import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mockStorefrontOverride = Symbol.for("miran.test.allow-mock-storefront");
globalThis[mockStorefrontOverride] = true;

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

async function createD1TestDatabase() {
  const { DatabaseSync } = await import("node:sqlite");
  const sqlite = new DatabaseSync(":memory:");
  let queryExecutions = 0;
  let activeQueries = 0;
  let maxConcurrentQueries = 0;
  let executedQueries = [];
  const execute = async (query, operation) => {
    queryExecutions += 1;
    executedQueries.push(query);
    activeQueries += 1;
    maxConcurrentQueries = Math.max(maxConcurrentQueries, activeQueries);
    await Promise.resolve();
    try {
      return operation();
    } finally {
      activeQueries -= 1;
    }
  };
  for (const file of [
    "0000_breezy_bastion.sql",
    "0001_big_masked_marvel.sql",
    "0002_previous_alice.sql",
    "0003_organic_amazoness.sql",
    "0004_foamy_violations.sql",
    "0005_cool_gambit.sql",
    "0006_furry_skreet.sql",
    "0007_slim_karen_page.sql",
    "0008_furry_gamma_corps.sql",
    "0009_square_magneto.sql",
    "0010_parched_eddie_brock.sql",
    "0011_lucky_vapor.sql",
    "0012_dark_blade.sql",
    "0013_steep_clint_barton.sql",
    "0014_brave_ronan.sql",
    "0015_silent_kingpin.sql",
    "0016_famous_red_skull.sql",
  ]) {
    const sql = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }
  const database = {
    prepare(query) {
      const statement = sqlite.prepare(query);
      let values = [];
      const prepared = {
        bind(...nextValues) {
          assert.notEqual(nextValues.length, 0, "Do not call D1 bind() without values");
          values = nextValues;
          return prepared;
        },
        async first() {
          return execute(query, () => statement.get(...values) ?? null);
        },
        async all() {
          return execute(query, () => ({
            results: statement.all(...values),
            success: true,
            meta: {},
          }));
        },
        async raw(options = {}) {
          return execute(query, () => {
            const rows = statement.all(...values);
            const columns = statement.columns().map((column) => column.name);
            const valuesByRow = rows.map((row) => columns.map((column) => row[column]));
            return options.columnNames ? [columns, ...valuesByRow] : valuesByRow;
          });
        },
        async run() {
          return execute(query, () => {
            const result = statement.run(...values);
            return { results: [], success: true, meta: { changes: result.changes } };
          });
        },
      };
      return prepared;
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
  return {
    database,
    close: () => sqlite.close(),
    resetQueryDiagnostics() {
      queryExecutions = 0;
      activeQueries = 0;
      maxConcurrentQueries = 0;
      executedQueries = [];
    },
    queryDiagnostics() {
      return {
        executionCount: queryExecutions,
        maxConcurrentQueries,
        queries: [...executedQueries],
      };
    },
  };
}

class FakeR2Bucket {
  constructor(objects = [], options = {}) {
    this.objects = new Map(objects.map((object) => [object.key, {
      bytes: new Uint8Array(object.bytes),
      etag: object.etag ?? `etag-${object.key}`,
      uploaded: object.uploaded ?? new Date("2026-08-28T10:00:00.000Z"),
      httpMetadata: object.httpMetadata ?? {},
      customMetadata: object.customMetadata ?? {},
    }]));
    this.pageSize = options.pageSize ?? 1000;
    this.missingKeys = new Set(options.missingKeys ?? []);
    this.getSizeOffsets = new Map(Object.entries(options.getSizeOffsets ?? {}));
    this.getEtags = new Map(Object.entries(options.getEtags ?? {}));
    this.afterGet = options.afterGet ?? null;
    this.listCalls = [];
  }

  async list(options = {}) {
    assert.deepEqual(options.include, ["httpMetadata", "customMetadata"]);
    this.listCalls.push(options.cursor);
    const keys = [...this.objects.keys()].sort();
    const offset = options.cursor ? Number(options.cursor) : 0;
    const pageKeys = keys.slice(offset, offset + this.pageSize);
    const nextOffset = offset + pageKeys.length;
    const truncated = nextOffset < keys.length;
    return {
      objects: pageKeys.map((key) => {
        const object = this.objects.get(key);
        return {
          key,
          size: object.bytes.byteLength,
          etag: object.etag,
          uploaded: object.uploaded,
          httpMetadata: object.httpMetadata,
          customMetadata: object.customMetadata,
          httpEtag: `"${object.etag}"`,
          writeHttpMetadata() {},
        };
      }),
      truncated,
      ...(truncated ? { cursor: String(nextOffset) } : {}),
    };
  }

  async get(key) {
    if (this.missingKeys.has(key)) return null;
    const stored = this.objects.get(key);
    if (!stored) return null;
    const snapshot = {
      bytes: new Uint8Array(stored.bytes),
      etag: stored.etag,
      uploaded: stored.uploaded,
      httpMetadata: structuredClone(stored.httpMetadata),
      customMetadata: structuredClone(stored.customMetadata),
    };
    if (this.afterGet) await this.afterGet(this, key);
    const sizeOffset = Number(this.getSizeOffsets.get(key) ?? 0);
    const etag = this.getEtags.get(key) ?? snapshot.etag;
    return {
      key,
      size: snapshot.bytes.byteLength + sizeOffset,
      etag,
      uploaded: snapshot.uploaded,
      httpMetadata: snapshot.httpMetadata,
      customMetadata: snapshot.customMetadata,
      httpEtag: `"${etag}"`,
      writeHttpMetadata() {},
      body: new Blob([snapshot.bytes]).stream(),
    };
  }

  addObject(object) {
    this.objects.set(object.key, {
      bytes: new Uint8Array(object.bytes),
      etag: object.etag ?? `etag-${object.key}`,
      uploaded: object.uploaded ?? new Date("2026-08-28T10:00:00.000Z"),
      httpMetadata: object.httpMetadata ?? {},
      customMetadata: object.customMetadata ?? {},
    });
  }
}

async function readMediaBackupTar(bucket) {
  const { createMediaBackupTar } = await import("../lib/media-backup.ts");
  const archive = await createMediaBackupTar(bucket, {
    exportedAt: "2026-08-28T12:00:00.000Z",
  });
  const bytes = new Uint8Array(await new Response(archive.body).arrayBuffer());
  return { bytes, entries: parseTarEntries(bytes) };
}

function parseTarEntries(archive) {
  const decoder = new TextDecoder();
  const entries = new Map();
  let pendingPax = {};
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = readTarText(header.subarray(0, 100), decoder);
    const headerSize = readTarOctal(header.subarray(124, 136), decoder);
    const type = String.fromCharCode(header[156] || 48);
    const effectiveSize = type === "x" ? headerSize : Number(pendingPax.size ?? headerSize);
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + effectiveSize;
    assert.ok(bodyEnd <= archive.length, "TAR entry body must be complete");
    const body = archive.slice(bodyStart, bodyEnd);
    if (type === "x") {
      pendingPax = parsePaxRecords(body, decoder);
    } else {
      const path = pendingPax.path ?? name;
      entries.set(path, body);
      pendingPax = {};
    }
    offset = bodyStart + effectiveSize + ((512 - (effectiveSize % 512)) % 512);
  }
  return entries;
}

function parsePaxRecords(bytes, decoder) {
  const fields = {};
  let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(0x20, offset);
    assert.ok(space > offset, "PAX record length is present");
    const length = Number(decoder.decode(bytes.subarray(offset, space)));
    const record = decoder.decode(bytes.subarray(space + 1, offset + length - 1));
    const equals = record.indexOf("=");
    assert.ok(equals > 0, "PAX record has a field name");
    fields[record.slice(0, equals)] = record.slice(equals + 1);
    offset += length;
  }
  return fields;
}

function readTarText(bytes, decoder) {
  const zero = bytes.indexOf(0);
  return decoder.decode(zero === -1 ? bytes : bytes.subarray(0, zero));
}

function readTarOctal(bytes, decoder) {
  const value = readTarText(bytes, decoder).trim();
  return value ? Number.parseInt(value, 8) : 0;
}

test("converts Jalali amazing-offer dates to the Iran timeline", async () => {
  const { jalaliDateTimeToIso, isoToJalaliInput } = await import(
    "../lib/jalali.ts"
  );
  const iso = jalaliDateTimeToIso("۱۴۰۵/۰۵/۲۳", "۱۲:۳۰");
  assert.equal(iso, "2026-08-14T09:00:00.000Z");
  const roundTrip = isoToJalaliInput(iso);
  assert.equal(roundTrip.date, "۱۴۰۵/۰۵/۲۳");
  assert.equal(roundTrip.time, "۱۲:۳۰");
  const { formatJalaliDateTime } = await import("../lib/jalali.ts");
  assert.equal(formatJalaliDateTime(iso), "۲۳ مرداد ۱۴۰۵ ساعت ۱۲:۳۰");
});

test("supports owner-selected Gregorian dates without changing stored UTC time", async () => {
  const {
    calendarDateTimeToIso,
    formatCalendarDateTime,
    gregorianDateTimeToIso,
    isoToCalendarInput,
  } = await import("../lib/jalali.ts");
  const iso = calendarDateTimeToIso("۲۰۲۶/۰۸/۱۴", "۱۲:۳۰", "gregorian");
  assert.equal(iso, "2026-08-14T09:00:00.000Z");
  assert.deepEqual(isoToCalendarInput(iso, "gregorian"), {
    date: "۲۰۲۶/۰۸/۱۴",
    time: "۱۲:۳۰",
  });
  assert.match(formatCalendarDateTime(iso, "gregorian"), /۲۰۲۶/);
  assert.equal(gregorianDateTimeToIso("۲۰۲۶/۰۲/۳۱", "۱۲:۳۰"), "");
});

test("calculates independent percentage and fixed product discounts in rials", async () => {
  const { calculateProductDiscount } = await import(
    "../lib/product-discount.ts"
  );
  assert.deepEqual(
    calculateProductDiscount({
      basePrice: 1_000_000,
      priceUnit: "toman",
      discountType: "percentage",
      discountValue: 15,
    }),
    {
      basePriceRial: 10_000_000,
      discountType: "percentage",
      discountValue: 15,
      discountRial: 1_500_000,
      finalPriceRial: 8_500_000,
    },
  );
  assert.equal(
    calculateProductDiscount({
      basePrice: 10_000_000,
      priceUnit: "rial",
      discountType: "amount",
      discountValue: 250_000,
      discountUnit: "toman",
    }).finalPriceRial,
    7_500_000,
  );
  assert.deepEqual(
    calculateProductDiscount({
      basePrice: 1_000_000,
      priceUnit: "rial",
      discountType: "percentage",
      discountValue: 10.5,
    }),
    {
      basePriceRial: 1_000_000,
      discountType: "percentage",
      discountValue: 11,
      discountRial: 110_000,
      finalPriceRial: 890_000,
    },
  );
  assert.equal(
    calculateProductDiscount({
      basePrice: 1_000,
      priceUnit: "rial",
      discountType: "amount",
      discountValue: 5_000,
      discountUnit: "rial",
    }).finalPriceRial,
    0,
  );
});

test("uses owner-defined delivery fees without an automatic free-shipping threshold", async () => {
  const { getDeliveryPriceMinor } = await import("../lib/money.ts");
  const fees = { standardRial: 750_000, priorityRial: 1_250_000 };
  assert.equal(getDeliveryPriceMinor("IRR", "standard", fees), 750_000);
  assert.equal(getDeliveryPriceMinor("IRR", "priority", fees), 1_250_000);
});

test("returns every active header message in the manager-defined order", async () => {
  const { filterActiveHeaderMessages } = await import(
    "../lib/header-messages.ts"
  );
  const messages = [
    { id: "first", visible: true, startsAt: "", endsAt: "" },
    { id: "hidden", visible: false, startsAt: "", endsAt: "" },
    { id: "invalid", visible: true, startsAt: "not-a-date", endsAt: "" },
    { id: "second", visible: true, startsAt: "", endsAt: "" },
  ];
  assert.deepEqual(
    filterActiveHeaderMessages(messages).map((message) => message.id),
    ["first", "second"],
  );
});

test("validates manual addresses and requires complete coordinate pairs", async () => {
  const { validateCustomerAddressPayload } = await import(
    "../features/account/address-validation.ts"
  );
  const valid = {
    label: "خانه",
    recipientName: "سهیلا هوشیاری",
    phone: "۰۹۱۲۱۲۳۴۵۶۷",
    province: "کردستان",
    city: "مریوان",
    postcode: "",
    addressLine: "خیابان نمونه، پلاک ۱۲",
    latitude: null,
    longitude: null,
    isDefault: true,
  };
  assert.deepEqual(validateCustomerAddressPayload(valid), valid);
  assert.equal(
    validateCustomerAddressPayload({ ...valid, latitude: 35.5 }),
    null,
  );
  assert.equal(
    validateCustomerAddressPayload({ ...valid, latitude: 91, longitude: 45 }),
    null,
  );
});

test("applies the address and discount migration without losing seeded products", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(":memory:");
  const migrationFiles = [
    "0000_breezy_bastion.sql",
    "0001_big_masked_marvel.sql",
    "0002_previous_alice.sql",
    "0003_organic_amazoness.sql",
    "0004_foamy_violations.sql",
  ];
  for (const file of migrationFiles) {
    const sql = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  const before = database.prepare("SELECT COUNT(*) AS count FROM products").get().count;
  const discountedBefore = database.prepare(
    "SELECT COUNT(*) AS count FROM products WHERE compare_at_price_minor > price_minor",
  ).get().count;
  const migration = await readFile(
    new URL("../drizzle/0005_cool_gambit.sql", import.meta.url),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  const after = database.prepare("SELECT COUNT(*) AS count FROM products").get().count;
  const inferred = database.prepare(
    "SELECT COUNT(*) AS count FROM products WHERE discount_type = 'amount' AND discount_value = compare_at_price_minor - price_minor",
  ).get().count;
  const addresses = database.prepare(
    "SELECT COUNT(*) AS count FROM customer_addresses",
  ).get().count;
  assert.equal(before, 21);
  assert.equal(after, before);
  assert.equal(inferred, discountedBefore);
  assert.equal(addresses, 0);
  database.close();
});

test("adds an immutable delivery snapshot without changing legacy orders", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0000_breezy_bastion.sql",
    "0001_big_masked_marvel.sql",
    "0002_previous_alice.sql",
    "0003_organic_amazoness.sql",
    "0004_foamy_violations.sql",
    "0005_cool_gambit.sql",
  ]) {
    const sql = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  database.prepare(
    `INSERT INTO orders (
       id, order_number, idempotency_key, customer_name, customer_email,
       customer_phone, address_line, city, postcode, delivery_method,
       currency, subtotal_minor, delivery_minor, total_minor
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "legacy-order",
    "MS-LEGACY",
    "legacy-key",
    "مشتری قدیمی",
    "legacy@example.com",
    "09120000000",
    "نشانی قدیمی",
    "تهران",
    "",
    "standard",
    "GBP",
    100,
    0,
    100,
  );
  const before = database.prepare("SELECT COUNT(*) AS count FROM orders").get().count;
  const migration = await readFile(
    new URL("../drizzle/0006_furry_skreet.sql", import.meta.url),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  const row = database.prepare(
    `SELECT currency, address_source_id, address_label, province,
            latitude_e6, longitude_e6 FROM orders WHERE id = ?`,
  ).get("legacy-order");
  const after = database.prepare("SELECT COUNT(*) AS count FROM orders").get().count;
  assert.equal(before, 1);
  assert.equal(after, before);
  assert.deepEqual({ ...row }, {
    currency: "GBP",
    address_source_id: "",
    address_label: "",
    province: "",
    latitude_e6: null,
    longitude_e6: null,
  });
  database.close();
});

test("adds payment idempotency indexes without changing existing records", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0000_breezy_bastion.sql",
    "0001_big_masked_marvel.sql",
    "0002_previous_alice.sql",
    "0003_organic_amazoness.sql",
    "0004_foamy_violations.sql",
    "0005_cool_gambit.sql",
    "0006_furry_skreet.sql",
  ]) {
    const sql = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  database.prepare(
    `INSERT INTO payment_attempts
       (id, order_id, provider, authority, status, amount_minor)
     VALUES ('attempt-before', 'order-before', 'zarinpal', '', 'failed', 1000)`,
  ).run();
  database.prepare(
    `INSERT INTO admin_audit_log (actor_email, action, subject_id)
     VALUES ('payment-provider', 'order.paid', 'order-before')`,
  ).run();
  const before = database.prepare("SELECT COUNT(*) AS count FROM payment_attempts").get().count;
  for (const file of [
    "0007_slim_karen_page.sql",
    "0008_furry_gamma_corps.sql",
  ]) {
    const migration = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  const after = database.prepare("SELECT COUNT(*) AS count FROM payment_attempts").get().count;
  const indexes = database.prepare("PRAGMA index_list('payment_attempts')").all();
  assert.equal(after, before);
  assert.ok(indexes.some((index) => index.name === "payment_attempts_pending_order_unique" && index.unique === 1));
  assert.ok(indexes.some((index) => index.name === "payment_attempts_authority_unique" && index.unique === 1));
  assert.ok(database.prepare("PRAGMA index_list('admin_audit_log')").all().some(
    (index) => index.name === "admin_audit_order_paid_unique" && index.unique === 1,
  ));
  database.close();
});

test("normalizes Persian and Arabic search forms", async () => {
  const { normalizePersianSearchText } = await import("../lib/persian-search.ts");
  assert.equal(normalizePersianSearchText("لپ‌تاپ ۱۲۳"), "لپتاپ 123");
  assert.equal(normalizePersianSearchText("گوشي سامسونگ"), "گوشی سامسونگ");
  assert.equal(normalizePersianSearchText("كالا ١٢٣"), "کالا 123");
});

test("renders the storefront footer year in the Persian calendar", async () => {
  const { currentJalaliYear } = await import("../lib/jalali.ts");
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();
  const year = currentJalaliYear();
  assert.ok(
    html.includes(`© ${year} Miran Shop`) ||
      html.includes(`© <!-- -->${year}<!-- --> Miran Shop`),
  );
  assert.doesNotMatch(html, /© (?:<!-- -->)?20\d{2}/);
});

test("does not publish temporary development preview metadata", async () => {
  const worker = await loadWorker();

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.doesNotMatch(await response.text(), /codex-preview/i);
});

test("publishes the MIRAN social preview metadata", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("https://almiran.ir/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();
  assert.match(html, /property="og:image" content="https:\/\/almiran\.ir\/og\.png"/);
  assert.match(html, /name="twitter:image" content="https:\/\/almiran\.ir\/og\.png"/);
});

test("publishes canonical SEO routes without exposing private pages", async () => {
  const worker = await loadWorker();
  const context = { waitUntil() {}, passThroughOnException() {} };
  const env = {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
  const [home, robots, sitemap, paymentResult] = await Promise.all([
    worker.fetch(new Request("https://almiran.ir/", { headers: { accept: "text/html" } }), env, context),
    worker.fetch(new Request("https://almiran.ir/robots.txt"), env, context),
    worker.fetch(new Request("https://almiran.ir/sitemap.xml"), env, context),
    worker.fetch(new Request("https://almiran.ir/payment/result?status=failed", { headers: { accept: "text/html" } }), env, context),
  ]);
  const [homeHtml, robotsText, sitemapText, paymentHtml] = await Promise.all([
    home.text(), robots.text(), sitemap.text(), paymentResult.text(),
  ]);
  assert.match(homeHtml, /rel="canonical" href="https:\/\/almiran\.ir\/?"/);
  assert.match(robotsText, /Sitemap:\s*https:\/\/almiran\.ir\/sitemap\.xml/i);
  assert.match(sitemapText, /https:\/\/almiran\.ir\/product\/nova-128/);
  assert.doesNotMatch(sitemapText, /\/admin|\/checkout|\/payment\/result/);
  assert.match(paymentHtml, /noindex/);
});

test("adds baseline browser security headers", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("https://almiran.ir/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
  assert.match(response.headers.get("permissions-policy") ?? "", /geolocation=\(self\)/);
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'self'/);
});

test("reports database health without exposing configuration secrets", async () => {
  const { probeDatabaseHealth } = await import("../lib/health.ts");
  const d1 = await createD1TestDatabase();
  assert.equal(await probeDatabaseHealth(d1.database), "ok");
  const source = await readFile(
    new URL("../app/api/health/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /paymentConfigured/);
  assert.doesNotMatch(source, /merchantId|ZARINPAL_MERCHANT_ID/);
  d1.close();
});

test("connects the account page to isolated customer order history", async () => {
  const [pageSource, historySource] = await Promise.all([
    readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/account/order-history.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(pageSource, /listCustomerOrders\(user\.email\)/);
  assert.match(pageSource, /<OrderHistory orders=\{orders\}/);
  assert.match(historySource, /تاریخچه و وضعیت سفارش‌ها/);
  assert.match(historySource, /order\.currency === IRAN_CURRENCY/);
});

test("enforces the configured customer password policy", async () => {
  const { customerPasswordError } = await import("../lib/customer-password.ts");
  assert.match(customerPasswordError("short") ?? "", /۱۰/);
  assert.match(customerPasswordError("longbutweakpassword") ?? "", /حروف کوچک و بزرگ/);
  assert.equal(customerPasswordError("Miran#2026Secure"), null);
});

test("completes password recovery with a new-password form", async () => {
  const [routeSource, formSource] = await Promise.all([
    readFile(new URL("../app/api/auth/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/account/customer-auth-form.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(routeSource, /action === "updatePassword"/);
  assert.match(routeSource, /method: "PUT"/);
  assert.match(routeSource, /\/auth\/v1\/user/);
  assert.match(formSource, /hash\.get\("type"\) === "recovery"/);
  assert.match(formSource, /پیوند تأیید شد؛ رمز جدید را وارد کنید/);
  assert.match(formSource, /confirmPassword/);
});

test("renders the compact unified customer entry flow", async () => {
  const [pageSource, formSource, headerSource] = await Promise.all([
    readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/account/customer-auth-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/layout/site-header.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(pageSource, /ورود \| ثبت‌نام/);
  assert.match(pageSource, /لطفاً ایمیل خود را وارد کنید/);
  assert.doesNotMatch(pageSource, /حساب امن Miran Shop/);
  assert.match(formSource, /type Mode = "identify"/);
  assert.match(formSource, /شرایط استفاده/);
  assert.doesNotMatch(formSource, /ورود با شماره موبایل/);
  assert.match(headerSource, /CartLink compact/);
  assert.match(headerSource, /WishlistLink compact/);
});

test("keeps signup confirmation focused and opens a secure session from supported email links", async () => {
  const [routeSource, formSource] = await Promise.all([
    readFile(new URL("../app/api/auth/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/account/customer-auth-form.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(routeSource, /مستقیم وارد حساب می‌شوید/);
  assert.match(routeSource, /grant_type=pkce/);
  assert.match(routeSource, /token_hash/);
  assert.match(formSource, /if \(mode === "signup"\)/);
  assert.match(formSource, /setMode\("confirmation"\)/);
  assert.match(formSource, /mode === "confirmation"/);
  assert.match(formSource, /action: "exchange"/);
  assert.match(formSource, /action: "verify"/);
  assert.match(formSource, /window\.location\.replace\(next\)/);
});

test("reports email acceptance only after Supabase accepts the provider request", async () => {
  const { getSupabaseSignupOutcome } = await import(
    "../lib/customer-auth-provider.ts"
  );
  assert.equal(
    getSupabaseSignupOutcome({ ok: false, status: 500, data: { code: "smtp_error" } }),
    "rejected",
  );
  assert.equal(
    getSupabaseSignupOutcome({
      ok: true,
      status: 200,
      data: { user: { identities: [] } },
    }),
    "existing",
  );
  assert.equal(
    getSupabaseSignupOutcome({
      ok: true,
      status: 200,
      data: { user: { identities: [{ id: "new-identity" }] } },
    }),
    "accepted",
  );
  const routeSource = await readFile(
    new URL("../app/api/auth/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(routeSource, /if \(!result\.ok\)[\s\S]*ارسال پیوند بازیابی انجام نشد/);
  assert.match(routeSource, /درخواست ارسال ایمیل تأیید با موفقیت پذیرفته شد/);
  assert.match(routeSource, /customer_auth_provider_rejected/);
});

test("uses Persian in-app validation for every required address field", async () => {
  const source = await readFile(
    new URL("../features/account/address-book.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /<form[\s\S]*noValidate/);
  assert.match(source, /لطفاً نام تحویل‌گیرنده را وارد کنید/);
  assert.match(source, /لطفاً شماره همراه را وارد کنید/);
  assert.match(source, /لطفاً استان را وارد کنید/);
  assert.match(source, /لطفاً شهر را وارد کنید/);
  assert.match(source, /لطفاً نشانی کامل را وارد کنید/);
  assert.match(source, /aria-invalid/);
});

test("keeps every top-header message owner manageable", async () => {
  const adminSource = await readFile(
    new URL("../features/admin/admin-page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(adminSource, /افزودن پیام/);
  assert.match(adminSource, /ذخیره ویرایش پیام/);
  assert.match(adminSource, /مخفی/);
  assert.match(adminSource, /حذف/);
  assert.match(adminSource, /moveItem\(state\.headerMessages/);
});

test("lets the owner assign every operational permission without delegating owner control", async () => {
  const { normalizeAdminPermissions } = await import("../features/admin/admin-types.ts");
  assert.deepEqual(
    normalizeAdminPermissions(["catalog.write", "orders.write", "security.write", "restore.write"], "catalog_manager"),
    ["state.read", "catalog.write", "orders.write", "security.write", "backup.read", "restore.write"],
  );
  assert.deepEqual(normalizeAdminPermissions(undefined, "content_manager"), [
    "state.read",
    "content.write",
    "reviews.write",
  ]);
  assert.deepEqual(normalizeAdminPermissions(["orders.delete"], "order_manager"), [
    "state.read",
    "orders.write",
    "orders.delete",
  ]);
  assert.deepEqual(normalizeAdminPermissions(["customers.delete"], "order_manager"), [
    "state.read",
    "customers.read",
    "customers.delete",
  ]);
  const [pageSource, authSource] = await Promise.all([
    readFile(new URL("../features/admin/admin-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-auth.ts", import.meta.url), "utf8"),
  ]);
  assert.match(pageSource, /دسترسی‌های این مدیر/);
  assert.match(pageSource, /item\.permissions\.includes\(permission\)/);
  assert.match(pageSource, /role === "owner"/);
  assert.match(pageSource, /can\("catalog\.delete"\).*حذف/s);
  assert.match(authSource, /normalizeAdminPermissions\(user\?\.permissions/);
  assert.doesNotMatch(pageSource, /adminPermissionLabels.*admins\.write/s);
});

test("stores independent owner credentials as a slow hash and uses revocable opaque sessions", async () => {
  const {
    authenticateOwnerCredential,
    createOwnerSession,
    deleteOwnerSession,
    getOwnerCredentialStatus,
    getOwnerSession,
    saveOwnerCredential,
  } = await import("../db/admin-owner-auth-repository.ts");
  const d1 = await createD1TestDatabase();
  assert.equal((await getOwnerCredentialStatus(d1.database)).configured, false);
  await saveOwnerCredential({
    username: "miran.owner",
    password: "Strong#Pass2026!",
    ownerEmail: "owner@example.com",
    actorEmail: "owner@example.com",
  }, d1.database);
  assert.deepEqual(await authenticateOwnerCredential("MIRAN.OWNER", "wrong-password", d1.database), null);
  assert.deepEqual(await authenticateOwnerCredential("miran.owner", "Strong#Pass2026!", d1.database), {
    ownerEmail: "owner@example.com",
    username: "miran.owner",
  });
  const stored = await d1.database.prepare(
    "SELECT password_hash, password_salt, password_iterations FROM admin_owner_credentials WHERE id = 'owner'",
  ).first();
  assert.notEqual(stored.password_hash, "Strong#Pass2026!");
  assert.ok(stored.password_salt.length >= 20);
  assert.equal(stored.password_iterations, 100000);
  const session = await createOwnerSession("owner@example.com", d1.database);
  assert.equal((await getOwnerSession(session.token, d1.database)).ownerEmail, "owner@example.com");
  assert.equal(await d1.database.prepare("SELECT token_hash FROM admin_owner_sessions WHERE token_hash = ?").bind(session.token).first(), null);
  await deleteOwnerSession(session.token, d1.database);
  assert.equal(await getOwnerSession(session.token, d1.database), null);
  d1.close();
});

test("keeps Supabase auth responses private and invalidates logout sessions", async () => {
  const [routeSource, providerSource] = await Promise.all([
    readFile(new URL("../app/api/auth/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/customer-auth-provider.ts", import.meta.url), "utf8"),
  ]);
  assert.match(routeSource, /cache-control", "private, no-store"/);
  assert.match(routeSource, /\/auth\/v1\/logout/);
  assert.match(routeSource, /clearSession/);
  assert.match(providerSource, /searchParams\.set\("redirect_to"/);
  assert.doesNotMatch(providerSource, /redirect_to: options\.redirectTo/);
});

test("refreshes a customer session with exactly one provider request", async () => {
  const {
    refreshCustomerSession,
  } = await import("../lib/customer-auth-provider.ts");
  let calls = 0;
  const refreshed = await refreshCustomerSession(
    { url: "https://auth.example", key: "publishable-key" },
    "refresh-secret",
    async (url, init) => {
      calls += 1;
      assert.match(String(url), /grant_type=refresh_token/);
      assert.deepEqual(JSON.parse(String(init?.body)), {
        refresh_token: "refresh-secret",
      });
      return Response.json({
        access_token: "new-access",
        refresh_token: "rotated-refresh",
        expires_in: 1_800,
        user: { id: "customer-id", email: "customer@example.com" },
      });
    },
  );
  assert.equal(calls, 1);
  assert.deepEqual(refreshed.tokens, {
    accessToken: "new-access",
    refreshToken: "rotated-refresh",
    expiresIn: 1_800,
  });
});

test("closes invalid customer sessions and clears every auth cookie", async () => {
  const {
    clearCustomerSessionCookies,
    customerCookieNames,
    isCustomerAccessTokenExpired,
  } = await import("../lib/customer-session.ts");
  const { refreshCustomerSession } = await import(
    "../lib/customer-auth-provider.ts"
  );
  let calls = 0;
  const invalid = await refreshCustomerSession(
    { url: "https://auth.example", key: "publishable-key" },
    "invalid-refresh",
    async () => {
      calls += 1;
      return Response.json(
        { error_code: "refresh_token_not_found" },
        { status: 400 },
      );
    },
  );
  assert.equal(calls, 1);
  assert.equal(invalid.tokens, null);
  const cleared = [];
  clearCustomerSessionCookies({
    cookies: { set: (name, value, options) => cleared.push({ name, value, options }) },
  });
  assert.deepEqual(
    cleared.map(({ name }) => name).sort(),
    Object.values(customerCookieNames).sort(),
  );
  assert.ok(cleared.every(({ value, options }) => value === "" && options.maxAge === 0));
  const expiredPayload = Buffer.from(JSON.stringify({ exp: 1 })).toString("base64url");
  const validPayload = Buffer.from(JSON.stringify({ exp: 4_102_444_800 })).toString("base64url");
  assert.equal(isCustomerAccessTokenExpired(`x.${expiredPayload}.x`, 2_000), true);
  assert.equal(isCustomerAccessTokenExpired(`x.${validPayload}.x`, 2_000), false);
});

test("keeps refreshed tokens in secure HttpOnly cookies", async () => {
  const { setCustomerSessionCookies } = await import("../lib/customer-session.ts");
  const written = [];
  setCustomerSessionCookies(
    { cookies: { set: (name, value, options) => written.push({ name, value, options }) } },
    {
      accessToken: "new-access",
      refreshToken: "rotated-refresh",
      expiresIn: 1_800,
    },
  );
  assert.equal(written.length, 3);
  assert.ok(written.every(({ options }) =>
    options.httpOnly && options.secure && options.sameSite === "lax"
  ));
  assert.equal(written.find(({ name }) => name.includes("access"))?.options.maxAge, 1_800);
});

test("renders the separate owner login and rejects cross-site password attempts", async () => {
  const worker = await loadWorker();
  const page = await worker.fetch(
    new Request("https://almiran.ir/admin/login", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(page.status, 200);
  const pageHtml = await page.text();
  assert.match(pageHtml, /ورود مالک/);
  assert.match(pageHtml, /account-login-page/);
  const rejected = await worker.fetch(
    new Request("https://almiran.ir/api/admin/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ username: "owner", password: "NotARealPassword#1" }),
    }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(rejected.status, 403);
});

test("keeps admin chrome separate from the storefront and within the worker PBKDF2 limit", async () => {
  const [adminSource, adminCss, storefrontCss, authSource] = await Promise.all([
    readFile(new URL("../features/admin/admin-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/admin/admin.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront.css", import.meta.url), "utf8"),
    readFile(new URL("../db/admin-owner-auth-repository.ts", import.meta.url), "utf8"),
  ]);
  assert.match(adminSource, /admin-page/);
  assert.match(adminSource, /<strong>مدیریت<\/strong>[\s\S]*MIRAN[\s\S]*>خروج<\/a>/);
  assert.doesNotMatch(adminSource, /مرکز مدیریت|ایمیل حساب ChatGPT|userDisplayName|userEmail/);
  assert.match(storefrontCss, /body:has\(\.admin-page\) > \.site-header/);
  assert.match(adminCss, /\.topbar\s*\{[\s\S]*position: sticky;[\s\S]*top: 0;/);
  assert.match(adminCss, /\.sidebar\s*\{[\s\S]*position: sticky;[\s\S]*top: calc\(4\.5rem/);
  assert.match(adminCss, /\.campaignForm > button\s*\{[\s\S]*grid-column: 1 \/ -1;[\s\S]*align-self: start;/);
  assert.match(authSource, /PASSWORD_ITERATIONS = 100_000/);
  assert.doesNotMatch(authSource, /PASSWORD_ITERATIONS = 310_000/);
});

test("protects the customer address API when no user is signed in", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("https://almiran.ir/api/account/addresses"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 401);
  assert.match(await response.text(), /مدیریت نشانی/);
});

test("rejects cross-site customer address mutations before database access", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("https://almiran.ir/api/account/addresses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-email": "customer@example.com",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
      body: "{}",
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 403);
  assert.match(await response.text(), /بین.سایتی/);
});

test("protects support, notifications, and review submission for anonymous users", async () => {
  const worker = await loadWorker();
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const [support, notifications, review] = await Promise.all([
    worker.fetch(new Request("https://almiran.ir/api/account/support"), env, context),
    worker.fetch(new Request("https://almiran.ir/api/account/notifications"), env, context),
    worker.fetch(new Request("https://almiran.ir/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://almiran.ir" },
      body: "{}",
    }), env, context),
  ]);
  assert.equal(support.status, 401);
  assert.equal(notifications.status, 401);
  assert.equal(review.status, 401);
});

test("rejects cross-site support and review mutations before database access", async () => {
  const worker = await loadWorker();
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const headers = {
    "content-type": "application/json",
    "oai-authenticated-user-email": "customer@example.com",
    origin: "https://attacker.example",
    "sec-fetch-site": "cross-site",
  };
  const [support, review] = await Promise.all([
    worker.fetch(new Request("https://almiran.ir/api/account/support", { method: "POST", headers, body: "{}" }), env, context),
    worker.fetch(new Request("https://almiran.ir/api/reviews", { method: "POST", headers, body: "{}" }), env, context),
  ]);
  assert.equal(support.status, 403);
  assert.equal(review.status, 403);
});

test("creates, isolates, selects, and deletes customer addresses in D1", async () => {
  const {
    createCustomerAddress,
    deleteCustomerAddress,
    getOwnedCustomerAddress,
    listCustomerAddresses,
    setDefaultCustomerAddress,
  } = await import("../db/customer-address-repository.ts");
  const d1 = await createD1TestDatabase();
  const first = await createCustomerAddress("customer@example.com", {
    label: "خانه",
    recipientName: "مشتری آزمایشی",
    phone: "09120000000",
    province: "تهران",
    city: "تهران",
    postcode: "1234567890",
    addressLine: "خیابان نمونه، پلاک ۱۲",
    latitude: null,
    longitude: null,
    isDefault: false,
  }, d1.database);
  assert.equal(first.isDefault, true);

  const second = await createCustomerAddress("customer@example.com", {
    label: "محل کار",
    recipientName: "مشتری آزمایشی",
    phone: "+989120000000",
    province: "البرز",
    city: "کرج",
    postcode: "",
    addressLine: "بلوار نمونه، ساختمان ۲",
    latitude: 35.8,
    longitude: 50.9,
    isDefault: true,
  }, d1.database);
  assert.equal(second.isDefault, true);

  await setDefaultCustomerAddress("customer@example.com", first.id, d1.database);
  const selected = await listCustomerAddresses("customer@example.com", d1.database);
  assert.equal(selected.find((address) => address.id === first.id).isDefault, true);

  assert.deepEqual(
    await listCustomerAddresses("other@example.com", d1.database),
    [],
  );
  assert.equal(
    (await getOwnedCustomerAddress("customer@example.com", first.id, d1.database))?.id,
    first.id,
  );
  assert.equal(
    await getOwnedCustomerAddress("other@example.com", first.id, d1.database),
    null,
  );

  await deleteCustomerAddress("customer@example.com", second.id, d1.database);
  const remaining = await listCustomerAddresses("customer@example.com", d1.database);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, first.id);
  assert.equal(remaining[0].isDefault, true);
  d1.close();
});

test("creates an idempotent order with an immutable owned-address snapshot", async () => {
  const { createOrderRecord, listCustomerOrders } = await import("../db/order-repository.ts");
  const { createCustomerAddress, deleteCustomerAddress } = await import(
    "../db/customer-address-repository.ts"
  );
  const d1 = await createD1TestDatabase();
  await d1.database.prepare(
    `UPDATE products
        SET currency = 'IRR', stock_quantity = 10, reserved_quantity = 0, visible = 1
      WHERE id = (SELECT id FROM products ORDER BY rowid LIMIT 1)`,
  ).run();
  const product = await d1.database.prepare(
    `SELECT id, slug, title, sku, price_minor, reserved_quantity
       FROM products
      WHERE visible = 1 AND currency = 'IRR'
        AND stock_quantity - reserved_quantity >= 1
      LIMIT 1`,
  ).first();
  assert.ok(product);
  const address = await createCustomerAddress("customer@example.com", {
    label: "خانه",
    recipientName: "مشتری آزمایشی",
    phone: "09120000000",
    province: "تهران",
    city: "تهران",
    postcode: "1234567890",
    addressLine: "خیابان نمونه، پلاک ۱۲",
    latitude: 35.7219,
    longitude: 51.3347,
    isDefault: true,
  }, d1.database);
  const input = {
    idempotencyKey: crypto.randomUUID(),
    customerName: address.recipientName,
    customerEmail: "Customer@Example.com",
    customerPhone: address.phone,
    addressSourceId: address.id,
    addressLabel: address.label,
    addressLine: address.addressLine,
    city: address.city,
    province: address.province,
    postcode: address.postcode,
    latitude: address.latitude,
    longitude: address.longitude,
    deliveryMethod: "standard",
    currency: "IRR",
    deliveryMinor: 0,
    reservationMinutes: 20,
    lines: [{
      productId: product.id,
      variantId: "",
      sellerOfferId: "",
      selectionLabel: "فروش مستقیم میران",
      slug: product.slug,
      sku: product.sku,
      title: product.title,
      quantity: 1,
      unitPriceMinor: product.price_minor,
    }],
  };
  const created = await createOrderRecord(input, d1.database);
  const replayed = await createOrderRecord(input, d1.database);
  assert.equal(replayed.id, created.id);
  assert.equal(created.customerEmail, "customer@example.com");
  assert.equal(created.addressSourceId, address.id);
  assert.equal(created.addressLabel, "خانه");
  assert.equal(created.province, "تهران");
  assert.equal(created.latitude, 35.7219);
  assert.equal(created.longitude, 51.3347);
  assert.equal(
    (await d1.database.prepare("SELECT COUNT(*) AS count FROM orders").first()).count,
    1,
  );
  assert.equal(
    (await d1.database.prepare(
      "SELECT reserved_quantity FROM products WHERE id = ?",
    ).bind(product.id).first()).reserved_quantity,
    product.reserved_quantity + 1,
  );

  await deleteCustomerAddress("customer@example.com", address.id, d1.database);
  const snapshot = await d1.database.prepare(
    `SELECT address_source_id, address_label, address_line, province, city,
            postcode, latitude_e6, longitude_e6
       FROM orders WHERE id = ?`,
  ).bind(created.id).first();
  assert.deepEqual({ ...snapshot }, {
    address_source_id: address.id,
    address_label: "خانه",
    address_line: "خیابان نمونه، پلاک ۱۲",
    province: "تهران",
    city: "تهران",
    postcode: "1234567890",
    latitude_e6: 35_721_900,
    longitude_e6: 51_334_700,
  });
  assert.equal((await listCustomerOrders("CUSTOMER@example.com", d1.database)).length, 1);
  assert.deepEqual(await listCustomerOrders("other@example.com", d1.database), []);
  d1.close();
});

test("rolls back an order when simultaneous inventory reservation cannot complete", async () => {
  const { createOrderRecord } = await import("../db/order-repository.ts");
  const d1 = await createD1TestDatabase();
  const product = await d1.database.prepare(
    "SELECT id, slug, title, sku, price_minor FROM products ORDER BY rowid LIMIT 1",
  ).first();
  await d1.database.prepare(
    "UPDATE products SET currency = 'IRR', stock_quantity = 0, reserved_quantity = 0 WHERE id = ?",
  ).bind(product.id).run();
  await assert.rejects(
    createOrderRecord({
      idempotencyKey: crypto.randomUUID(),
      customerName: "مشتری",
      customerEmail: "stock@example.com",
      customerPhone: "09120000000",
      addressSourceId: "address-test",
      addressLabel: "خانه",
      addressLine: "نشانی",
      city: "تهران",
      province: "تهران",
      postcode: "",
      latitude: null,
      longitude: null,
      deliveryMethod: "standard",
      currency: "IRR",
      deliveryMinor: 0,
      reservationMinutes: 20,
      lines: [{
        productId: product.id,
        variantId: "",
        sellerOfferId: "",
        selectionLabel: "فروش مستقیم میران",
        slug: product.slug,
        sku: product.sku,
        title: product.title,
        quantity: 1,
        unitPriceMinor: product.price_minor,
      }],
    }, d1.database),
    /OUT_OF_STOCK/,
  );
  assert.equal((await d1.database.prepare("SELECT COUNT(*) AS count FROM orders").first()).count, 0);
  assert.equal((await d1.database.prepare("SELECT reserved_quantity FROM products WHERE id = ?").bind(product.id).first()).reserved_quantity, 0);
  d1.close();
});

test("keeps successful payment callbacks idempotent and prevents paid downgrade", async () => {
  const { completePayment, failPaymentAttempt } = await import("../db/order-repository.ts");
  const d1 = await createD1TestDatabase();
  await d1.database.prepare(
    `INSERT INTO orders (
       id, order_number, idempotency_key, customer_name, customer_email,
       customer_phone, address_line, city, postcode, delivery_method,
       currency, subtotal_minor, delivery_minor, total_minor
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    "payment-order", "MS-PAYMENT", "payment-key", "مشتری", "pay@example.com",
    "09120000000", "نشانی", "تهران", "", "standard", "IRR", 1000, 0, 1000,
  ).run();
  await d1.database.prepare(
    `INSERT INTO payment_attempts
       (id, order_id, provider, authority, status, amount_minor)
     VALUES (?, ?, 'zarinpal', ?, 'pending', ?)`,
  ).bind("attempt-payment", "payment-order", "AUTHORITY-1", 1000).run();
  const first = await completePayment(
    { authority: "AUTHORITY-1", providerReference: "REF-1" },
    d1.database,
  );
  const replay = await completePayment(
    { authority: "AUTHORITY-1", providerReference: "REF-1" },
    d1.database,
  );
  await failPaymentAttempt("AUTHORITY-1", d1.database);
  const row = await d1.database.prepare(
    "SELECT status, payment_status FROM orders WHERE id = 'payment-order'",
  ).first();
  const auditCount = await d1.database.prepare(
    "SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = 'order.paid'",
  ).first();
  assert.equal(first.id, replay.id);
  assert.deepEqual({ ...row }, { status: "confirmed", payment_status: "paid" });
  assert.equal(auditCount.count, 1);
  d1.close();
});

test("exports every D1 table in the owner backup format", async () => {
  const { createLogicalDatabaseBackup } = await import("../db/backup-repository.ts");
  const d1 = await createD1TestDatabase();
  const product = await d1.database.prepare(
    "SELECT id FROM products ORDER BY rowid LIMIT 1",
  ).first();
  await d1.database.prepare(
    "UPDATE products SET english_title = ?, short_description = ? WHERE id = ?",
  ).bind("Backup title", "Backup short description", product.id).run();
  await d1.database.prepare(
    `INSERT INTO catalog_attribute_definitions
       (id, category_slug, code, label, filterable, searchable, comparable)
     VALUES (?, ?, ?, ?, 1, 1, 1)`,
  ).bind("backup-attribute", "digital", "backup-code", "ویژگی پشتیبان").run();
  await d1.database.prepare(
    `INSERT INTO product_attribute_values
       (id, product_id, attribute_id, value_text, normalized_value, key_feature)
     VALUES (?, ?, ?, ?, ?, 1)`,
  ).bind("backup-product-value", product.id, "backup-attribute", "مقدار", "مقدار").run();
  await d1.database.prepare(
    `INSERT INTO product_variants
       (id, product_id, title, sku, price_minor, stock_quantity)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind("backup-variant", product.id, "تنوع پشتیبان", "BACKUP-VARIANT", 1000, 2).run();
  await d1.database.prepare(
    `INSERT INTO product_variant_attribute_values
       (id, variant_id, attribute_id, value_text, normalized_value)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind("backup-variant-value", "backup-variant", "backup-attribute", "مقدار", "مقدار").run();
  await d1.database.prepare(
    `INSERT INTO product_questions
       (id, product_id, customer_email, customer_name, body)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind("backup-question", product.id, "question@example.com", "مشتری", "پرسش پشتیبان").run();
  await d1.database.prepare(
    `INSERT INTO product_price_history
       (id, product_id, source_type, source_id, previous_price_minor,
        new_price_minor, currency, changed_by)
     VALUES (?, ?, ?, ?, ?, ?, 'IRR', ?)`,
  ).bind("backup-price", product.id, "product", product.id, 900, 1000, "owner@example.com").run();
  await d1.database.prepare(
    `INSERT INTO admin_owner_credentials
       (id, username, password_salt, password_hash, password_iterations, owner_email, updated_by)
     VALUES ('owner', 'backup-owner', 'backup-salt', 'backup-hash', 210000, 'owner@example.com', 'owner@example.com')`,
  ).run();
  await d1.database.prepare(
    `INSERT INTO admin_owner_sessions
       (token_hash, owner_email, expires_at)
     VALUES ('backup-session-hash', 'owner@example.com', '2027-08-28T00:00:00.000Z')`,
  ).run();
  const emptyTableColumns = (await d1.database.prepare(
    "PRAGMA table_info(\"payment_attempts\")",
  ).all()).results
    .sort((left, right) => left.cid - right.cid)
    .map((column) => column.name);
  const backup = await createLogicalDatabaseBackup(d1.database);
  assert.equal(backup.format, "miran-shop-d1-backup-v2");
  assert.equal(backup.counts.products, 21);
  assert.equal(backup.schemaVersion, 16);
  assert.equal(backup.tables.catalog_attribute_definitions.length, 1);
  assert.equal(backup.tables.product_attribute_values.length, 1);
  assert.equal(backup.tables.product_variant_attribute_values.length, 1);
  assert.equal(backup.tables.product_questions.length, 1);
  assert.equal(backup.tables.product_price_history.length, 1);
  assert.ok(backup.schema.products.includes("english_title"));
  assert.ok(backup.schema.products.includes("short_description"));
  assert.equal(backup.tables.products.find((row) => row.id === product.id)?.english_title, "Backup title");
  assert.equal(backup.tables.products.find((row) => row.id === product.id)?.short_description, "Backup short description");
  assert.ok(Array.isArray(backup.tables.payment_attempts));
  assert.ok(Array.isArray(backup.tables.payment_provider_configs));
  assert.ok(Array.isArray(backup.tables.bank_transfer_receipts));
  assert.ok(Array.isArray(backup.tables.support_tickets));
  assert.ok(Array.isArray(backup.tables.product_reviews));
  assert.ok(Array.isArray(backup.tables.customer_notifications));
  assert.ok(Array.isArray(backup.tables.request_rate_limits));
  assert.ok(Array.isArray(backup.tables.customer_accounts));
  assert.deepEqual(backup.schema.payment_attempts, emptyTableColumns);
  assert.deepEqual(backup.tables.payment_attempts, []);
  assert.equal(backup.tables.admin_owner_credentials[0]?.username, "backup-owner");
  assert.equal(backup.tables.admin_owner_credentials[0]?.password_hash, "backup-hash");
  assert.equal(backup.tables.admin_owner_sessions[0]?.token_hash, "backup-session-hash");
  assert.equal(backup.media.included, false);
  await d1.database.prepare(
    "CREATE TABLE provider_runtime_table (id TEXT PRIMARY KEY NOT NULL)",
  ).run();
  const backupWithRuntimeTable = await createLogicalDatabaseBackup(d1.database);
  assert.equal(Object.keys(backupWithRuntimeTable.tables).length, 26);
  const delegatedBackup = await createLogicalDatabaseBackup(d1.database, { includeOwnerAuthentication: false });
  assert.deepEqual(delegatedBackup.tables.admin_owner_credentials, []);
  assert.deepEqual(delegatedBackup.tables.admin_owner_sessions, []);
  d1.close();
});

test("uses one sequential raw query per backup table within a safe D1 budget", async () => {
  const {
    createLogicalDatabaseBackup,
    LOGICAL_BACKUP_TABLES,
  } = await import("../db/backup-repository.ts");
  const d1 = await createD1TestDatabase();
  d1.resetQueryDiagnostics();

  const backup = await createLogicalDatabaseBackup(d1.database);
  const diagnostics = d1.queryDiagnostics();
  assert.equal(Object.keys(backup.tables).length, 26);
  assert.equal(LOGICAL_BACKUP_TABLES.length, 26);
  assert.equal(diagnostics.executionCount, 27);
  assert.ok(diagnostics.executionCount <= 30);
  assert.equal(diagnostics.maxConcurrentQueries, 1);
  assert.equal(
    diagnostics.queries.filter((query) => /^PRAGMA\s+table_info/i.test(query.trim())).length,
    0,
  );
  assert.equal(
    diagnostics.queries.filter((query) => /^SELECT \* FROM "/i.test(query.trim())).length,
    26,
  );

  const source = await readFile(
    new URL("../db/backup-repository.ts", import.meta.url),
    "utf8",
  );
  const implementation = source.slice(
    source.indexOf("export async function createLogicalDatabaseBackup"),
    source.indexOf("export function inspectLogicalDatabaseBackup"),
  );
  assert.match(implementation, /\.raw<unknown\[\]>\(\{ columnNames: true \}\)/);
  assert.doesNotMatch(implementation, /Promise\.all/);
  assert.doesNotMatch(implementation, /PRAGMA\s+table_info/i);
  d1.close();
});

test("requires every logical backup table while allowing additional runtime tables", async () => {
  const {
    assertBackupTableInventory,
    LOGICAL_BACKUP_TABLES,
  } = await import("../db/backup-repository.ts");
  const applicationTables = [...LOGICAL_BACKUP_TABLES];

  for (const additionalRuntimeTable of [
    "_cf_KV",
    "sqlite_sequence",
    "d1_migrations",
    "__drizzle_migrations",
    "provider_runtime_table",
    "future_feature_table",
  ]) {
    assert.doesNotThrow(() => {
      assertBackupTableInventory([...applicationTables, additionalRuntimeTable]);
    });
  }

  assert.throws(
    () => assertBackupTableInventory(applicationTables.slice(1)),
    /BACKUP_DATABASE_SCHEMA_MISMATCH/,
  );
});

test("keeps migration-defined application tables exactly covered by the backup contract", async () => {
  const { LOGICAL_BACKUP_TABLES } = await import("../db/backup-repository.ts");
  const d1 = await createD1TestDatabase();
  const readMigrationApplicationTables = async () =>
    (await d1.database.prepare(
      `SELECT name FROM sqlite_schema
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name`,
    ).all()).results.map((row) => row.name);
  const assertMigrationCoverage = (migrationTables) => {
    assert.deepEqual(
      [...migrationTables].sort(),
      [...LOGICAL_BACKUP_TABLES].sort(),
      "Migration-defined application tables must exactly match LOGICAL_BACKUP_TABLES",
    );
  };

  const migrationTables = await readMigrationApplicationTables();
  assert.equal(migrationTables.length, 26);
  assert.doesNotThrow(() => assertMigrationCoverage(migrationTables));

  await d1.database.prepare(
    "CREATE TABLE future_feature_table (id TEXT PRIMARY KEY NOT NULL)",
  ).run();
  const futureMigrationTables = await readMigrationApplicationTables();
  assert.throws(
    () => assertMigrationCoverage(futureMigrationTables),
    /Migration-defined application tables must exactly match LOGICAL_BACKUP_TABLES/,
  );
  assert.throws(
    () => assertMigrationCoverage(migrationTables.slice(1)),
    /Migration-defined application tables must exactly match LOGICAL_BACKUP_TABLES/,
  );
  d1.close();
});

test("round-trips long storefront settings and revisions without truncation", async () => {
  const {
    createLogicalDatabaseBackup,
    restoreLogicalDatabaseBackup,
  } = await import("../db/backup-repository.ts");
  const source = await createD1TestDatabase();
  const longSettings = JSON.stringify({
    marker: "settings-long-value",
    value: "تنظیمات-".repeat(40_000),
  });
  const longRevision = JSON.stringify({
    marker: "revision-long-value",
    value: "بازنگری-".repeat(40_000),
  });
  await source.database.prepare(
    `INSERT INTO storefront_settings (id, data, updated_by)
     VALUES ('primary', ?, 'owner@example.com')`,
  ).bind(longSettings).run();
  await source.database.prepare(
    `INSERT INTO storefront_revisions (id, data, actor_email)
     VALUES ('long-backup-revision', ?, 'owner@example.com')`,
  ).bind(longRevision).run();

  const backup = await createLogicalDatabaseBackup(source.database);
  assert.equal(
    backup.tables.storefront_settings.find((row) => row.id === "primary")?.data,
    longSettings,
  );
  assert.equal(
    backup.tables.storefront_revisions.find((row) => row.id === "long-backup-revision")?.data,
    longRevision,
  );

  const target = await createD1TestDatabase();
  await restoreLogicalDatabaseBackup(backup, target.database);
  assert.equal((await target.database.prepare(
    "SELECT data FROM storefront_settings WHERE id = 'primary'",
  ).first()).data, longSettings);
  assert.equal((await target.database.prepare(
    "SELECT data FROM storefront_revisions WHERE id = 'long-backup-revision'",
  ).first()).data, longRevision);
  source.close();
  target.close();
});

test("creates a complete TAR manifest for an empty R2 bucket", async () => {
  const { bytes, entries } = await readMediaBackupTar(new FakeR2Bucket());
  assert.deepEqual([...entries.keys()], ["_miran/manifest.json"]);
  const manifest = JSON.parse(new TextDecoder().decode(entries.get("_miran/manifest.json")));
  assert.deepEqual(manifest, {
    format: "miran-shop-r2-backup-v1",
    exportedAt: "2026-08-28T12:00:00.000Z",
    objectCount: 0,
    totalObjectBytes: 0,
    objects: [],
    complete: true,
  });
  assert.equal(bytes.length % 512, 0);
  assert.ok(bytes.subarray(-1024).every((value) => value === 0));
});

test("preserves one R2 object's original key, bytes, and metadata in TAR", async () => {
  const key = "products/محصول-نمونه/" + "long-key-".repeat(20) + "image.webp";
  const content = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
  const bucket = new FakeR2Bucket([{
    key,
    bytes: content,
    etag: "single-object-etag",
    uploaded: new Date("2026-08-28T11:22:33.000Z"),
    httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=60" },
    customMetadata: { uploadedBy: "owner@example.com", purpose: "catalog" },
  }]);
  const { entries } = await readMediaBackupTar(bucket);
  assert.deepEqual(entries.get(key), content);
  const manifest = JSON.parse(new TextDecoder().decode(entries.get("_miran/manifest.json")));
  assert.equal(manifest.objectCount, 1);
  assert.equal(manifest.totalObjectBytes, content.byteLength);
  assert.deepEqual(manifest.objects, [{
    key,
    size: content.byteLength,
    etag: "single-object-etag",
    uploaded: "2026-08-28T11:22:33.000Z",
    httpMetadata: { cacheControl: "public, max-age=60", contentType: "image/webp" },
    customMetadata: { purpose: "catalog", uploadedBy: "owner@example.com" },
  }]);
});

test("lists every R2 page for both inventories without assuming a full page", async () => {
  const objects = [
    { key: "branding/logo.svg", bytes: new TextEncoder().encode("logo") },
    { key: "orphan/unreferenced.bin", bytes: new Uint8Array([4, 5]) },
    { key: "seller-documents/private.pdf", bytes: new TextEncoder().encode("%PDF") },
  ];
  const bucket = new FakeR2Bucket(objects, { pageSize: 1 });
  const { entries } = await readMediaBackupTar(bucket);
  for (const object of objects) assert.deepEqual(entries.get(object.key), object.bytes);
  assert.deepEqual(bucket.listCalls, [undefined, "1", "2", undefined, "1", "2"]);
  const manifest = JSON.parse(new TextDecoder().decode(entries.get("_miran/manifest.json")));
  assert.equal(manifest.objectCount, 3);
  assert.equal(manifest.totalObjectBytes, 10);
});

test("fails the R2 backup stream when an inventoried object disappears", async () => {
  const bucket = new FakeR2Bucket([
    { key: "products/missing.webp", bytes: new Uint8Array([1]) },
  ], { missingKeys: ["products/missing.webp"] });
  await assert.rejects(readMediaBackupTar(bucket), /MEDIA_BACKUP_OBJECT_MISSING/);
});

test("fails the R2 backup stream when object size or etag differs", async () => {
  const object = { key: "products/mismatch.webp", bytes: new Uint8Array([1, 2, 3]) };
  await assert.rejects(
    readMediaBackupTar(new FakeR2Bucket([object], {
      getSizeOffsets: { [object.key]: 1 },
    })),
    /MEDIA_BACKUP_OBJECT_SIZE_MISMATCH/,
  );
  await assert.rejects(
    readMediaBackupTar(new FakeR2Bucket([object], {
      getEtags: { [object.key]: "changed-etag" },
    })),
    /MEDIA_BACKUP_OBJECT_ETAG_MISMATCH/,
  );
});

test("does not finish or mark an R2 backup complete when inventory changes", async () => {
  let changed = false;
  const bucket = new FakeR2Bucket([
    { key: "products/stable.webp", bytes: new Uint8Array([1, 2, 3]) },
  ], {
    afterGet(fake) {
      if (changed) return;
      changed = true;
      fake.addObject({ key: "products/added-during-backup.webp", bytes: new Uint8Array([4]) });
    },
  });
  await assert.rejects(readMediaBackupTar(bucket), /MEDIA_BACKUP_INVENTORY_CHANGED/);
});

test("allows full media backup only for an authenticated owner", async () => {
  const { isOwnerMediaBackupAccess } = await import("../lib/media-backup.ts");
  assert.equal(isOwnerMediaBackupAccess({ allowed: false }), false);
  assert.equal(isOwnerMediaBackupAccess({
    allowed: true,
    role: "order_manager",
    permissions: ["backup.read"],
  }), false);
  assert.equal(isOwnerMediaBackupAccess({ allowed: true, role: "owner" }), true);

  const routeSource = await readFile(
    new URL("../app/api/admin/media-backup/route.ts", import.meta.url),
    "utf8",
  );
  const permissionCheck = routeSource.indexOf('getAdminAccess("backup.read")');
  const ownerCheck = routeSource.indexOf("isOwnerMediaBackupAccess(access)");
  const bucketRead = routeSource.indexOf("getRuntimeEnv<{ BUCKET?: R2Bucket }>()");
  assert.ok(permissionCheck >= 0 && ownerCheck > permissionCheck && bucketRead > ownerCheck);
  assert.doesNotMatch(routeSource, /bucket\.(?:put|delete)\(/);
  assert.match(routeSource, /"content-type": "application\/x-tar"/);
  assert.match(routeSource, /"content-disposition": `attachment;/);
  assert.match(routeSource, /"cache-control": "private, no-store"/);
  assert.match(routeSource, /"x-content-type-options": "nosniff"/);

  const adminSource = await readFile(
    new URL("../features/admin/admin-page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(adminSource, /role === "owner"[\s\S]*?دانلود پشتیبان کامل رسانه/);
  assert.match(adminSource, /این فایل ممکن است شامل تصاویر، مدارک فروشندگان و فیش‌های پرداخت باشد؛ آن را خصوصی نگهداری کنید./);
});

test("does not serve the media backup endpoint to an anonymous request", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/media-backup"),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.notEqual(response.status, 200);
  assert.notEqual(response.headers.get("content-type"), "application/x-tar");
});

test("restores the complete migration 0016 backup and rejects legacy backups before writes", async () => {
  const {
    createLogicalDatabaseBackup,
    inspectLogicalDatabaseBackup,
    restoreLogicalDatabaseBackup,
  } = await import("../db/backup-repository.ts");
  const source = await createD1TestDatabase();
  const product = await source.database.prepare(
    "SELECT id, slug FROM products ORDER BY rowid LIMIT 1",
  ).first();
  await source.database.prepare(
    "UPDATE products SET english_title = ?, short_description = ? WHERE id = ?",
  ).bind("English title", "Short description", product.id).run();
  await source.database.prepare(
    `INSERT INTO catalog_attribute_definitions
       (id, category_slug, code, label)
     VALUES ('restore-attribute', 'digital', 'restore-code', 'Restore attribute')`,
  ).run();
  await source.database.prepare(
    `INSERT INTO product_attribute_values
       (id, product_id, attribute_id, value_text, normalized_value)
     VALUES (?, ?, 'restore-attribute', 'restore-value', 'restore-value')`,
  ).bind("restore-product-value", product.id).run();
  await source.database.prepare(
    `INSERT INTO product_variants
       (id, product_id, title, sku, price_minor, stock_quantity)
     VALUES ('restore-variant', ?, 'Restore variant', 'RESTORE-VARIANT', 1000, 1)`,
  ).bind(product.id).run();
  await source.database.prepare(
    `INSERT INTO product_variant_attribute_values
       (id, variant_id, attribute_id, value_text, normalized_value)
     VALUES ('restore-variant-value', 'restore-variant', 'restore-attribute', 'restore-value', 'restore-value')`,
  ).run();
  await source.database.prepare(
    `INSERT INTO product_questions
       (id, product_id, customer_email, customer_name, body)
     VALUES ('restore-question', ?, 'restore@example.com', 'Restore customer', 'Restore question')`,
  ).bind(product.id).run();
  await source.database.prepare(
    `INSERT INTO product_price_history
       (id, product_id, source_type, source_id, previous_price_minor,
        new_price_minor, currency, changed_by)
     VALUES ('restore-price', ?, 'product', ?, 900, 1000, 'IRR', 'owner@example.com')`,
  ).bind(product.id, product.id).run();
  const backup = await createLogicalDatabaseBackup(source.database);
  assert.equal(inspectLogicalDatabaseBackup(backup).status, "current");

  const target = await createD1TestDatabase();
  const beforeLegacy = (await target.database.prepare(
    "SELECT slug FROM products ORDER BY id",
  ).all()).results.map((row) => row.slug);
  const legacy = structuredClone(backup);
  legacy.schemaVersion = 15;
  delete legacy.tables.catalog_attribute_definitions;
  delete legacy.tables.product_attribute_values;
  delete legacy.tables.product_variant_attribute_values;
  delete legacy.tables.product_questions;
  delete legacy.tables.product_price_history;
  const legacyInspection = inspectLogicalDatabaseBackup(legacy);
  assert.equal(legacyInspection.status, "legacy");
  assert.deepEqual(legacyInspection.missingTables.sort(), [
    "catalog_attribute_definitions",
    "product_attribute_values",
    "product_price_history",
    "product_questions",
    "product_variant_attribute_values",
  ]);
  await assert.rejects(
    restoreLogicalDatabaseBackup(legacy, target.database),
    /BACKUP_SCHEMA_LEGACY/,
  );
  assert.deepEqual(
    (await target.database.prepare("SELECT slug FROM products ORDER BY id").all()).results.map((row) => row.slug),
    beforeLegacy,
  );

  await target.database.prepare(
    "UPDATE products SET slug = 'temporary-restore-slug' WHERE id = ?",
  ).bind(product.id).run();
  assert.deepEqual(await restoreLogicalDatabaseBackup(backup, target.database), {
    restored: true,
    schemaVersion: 16,
  });
  const restoredProduct = await target.database.prepare(
    "SELECT slug, english_title, short_description FROM products WHERE id = ?",
  ).bind(product.id).first();
  assert.deepEqual({ ...restoredProduct }, {
    slug: product.slug,
    english_title: "English title",
    short_description: "Short description",
  });
  for (const table of [
    "catalog_attribute_definitions",
    "product_attribute_values",
    "product_variant_attribute_values",
    "product_questions",
    "product_price_history",
  ]) {
    assert.equal((await target.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first()).count, 1);
  }
  assert.deepEqual(
    (await target.database.prepare("SELECT slug FROM products ORDER BY id").all()).results.map((row) => row.slug),
    (await source.database.prepare("SELECT slug FROM products ORDER BY id").all()).results.map((row) => row.slug),
  );
  source.close();
  target.close();
});

test("renders product cards with discount percent and rial equivalent", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("https://almiran.ir/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();
  assert.match(html, /٪/);
  assert.match(html, /معادل/);
  assert.match(html, /ریال/);
});

test("rejects files whose bytes do not match the declared upload type", async () => {
  const { hasValidUploadSignature } = await import("../lib/upload-signature.ts");
  const validPng = new File([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  ], "valid.png", { type: "image/png" });
  const fakePng = new File(["not an image"], "fake.png", { type: "image/png" });
  const validPdf = new File(["%PDF-1.7\n"], "valid.pdf", { type: "application/pdf" });
  const fakePdf = new File(["not a pdf"], "fake.pdf", { type: "application/pdf" });
  const validHeic = new File([
    new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
      0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
      0x6d, 0x69, 0x66, 0x31,
    ]),
  ], "iphone.heic", { type: "image/heic" });
  assert.equal(await hasValidUploadSignature(validPng, "png"), true);
  assert.equal(await hasValidUploadSignature(fakePng, "png"), false);
  assert.equal(await hasValidUploadSignature(validPdf, "pdf"), true);
  assert.equal(await hasValidUploadSignature(fakePdf, "pdf"), false);
  assert.equal(await hasValidUploadSignature(validHeic, "heic"), true);
});

test("converts HEIC client-side and never stores it as public storefront media", async () => {
  const { getProductImageValidationError, PRODUCT_IMAGE_ACCEPT } = await import(
    "../features/admin/product-image-optimizer.ts"
  );
  assert.equal(getProductImageValidationError(new File(["x"], "photo.jpg", { type: "image/jpeg" })), "");
  assert.equal(getProductImageValidationError(new File(["x"], "photo.heif", { type: "image/heif" })), "");
  assert.match(PRODUCT_IMAGE_ACCEPT, /image\/\*/);
  assert.match(PRODUCT_IMAGE_ACCEPT, /\.heic/);

  const uploadSource = await readFile(
    new URL("../app/api/admin/upload/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(uploadSource, /kind === "products"\s*\? 20_000_000/);
  assert.doesNotMatch(uploadSource, /\["image\/heic",\s*"heic"\]/);
  assert.doesNotMatch(uploadSource, /\["image\/heif",\s*"heif"\]/);
  assert.match(uploadSource, /heicSource/);
  assert.match(uploadSource, /پیش از ارسال در مرورگر به WebP یا JPG تبدیل شود/);
  assert.match(uploadSource, /normalizedContentTypes\.get\(extension\)/);
  assert.match(uploadSource, /`\/media\/\$\{key\}`/);
  assert.match(uploadSource, /cleanupToken/);
});

test("deletes only authenticated rollback uploads and recognizes legacy HEIC keys", async () => {
  const {
    deleteRollbackUploads,
    storageKeyFromMediaUrl,
  } = await import("../lib/admin-media-cleanup.ts");
  const objects = new Map([
    ["products/11111111-1111-4111-8111-111111111111.webp", {
      customMetadata: {
        uploadedBy: "owner@example.com",
        cleanupToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    }],
    ["products/22222222-2222-4222-8222-222222222222.webp", {
      customMetadata: {
        uploadedBy: "owner@example.com",
        cleanupToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    }],
  ]);
  const deleted = [];
  const bucket = {
    async get(key) {
      return objects.get(key) ?? null;
    },
    async delete(key) {
      deleted.push(key);
      objects.delete(key);
    },
  };
  const count = await deleteRollbackUploads([
    {
      url: "/media/products/11111111-1111-4111-8111-111111111111.webp",
      cleanupToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
    {
      url: "/media/products/22222222-2222-4222-8222-222222222222.webp",
      cleanupToken: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    },
  ], "owner@example.com", bucket);
  assert.equal(count, 1);
  assert.deepEqual(deleted, ["products/11111111-1111-4111-8111-111111111111.webp"]);
  assert.equal(objects.has("products/22222222-2222-4222-8222-222222222222.webp"), true);
  assert.equal(
    storageKeyFromMediaUrl("/media/products/33333333-3333-4333-8333-333333333333.heic"),
    "products/33333333-3333-4333-8333-333333333333.heic",
  );
  assert.equal(storageKeyFromMediaUrl("https://attacker.example/file.webp"), "");
});

test("keeps product editor and product list independently scrollable only on desktop", async () => {
  const css = await readFile(
    new URL("../features/admin/admin.module.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /@media \(min-width: 64rem\)[\s\S]*?\.productWorkspace \{[\s\S]*?height: max\(34rem, calc\(100dvh - 11\.5rem\)\);[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;/);
  assert.match(css, /@media \(min-width: 64rem\)[\s\S]*?\.productForm,[\s\S]*?\.productList \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;[\s\S]*?overflow-x: hidden;[\s\S]*?overscroll-behavior: contain;[\s\S]*?scrollbar-gutter: stable;/);
  assert.match(css, /@media \(max-width: 47\.99rem\)/);
  const baseColumns = css.match(/\.productForm,[\s\S]*?\.productList \{[\s\S]*?max-height: none;[\s\S]*?overflow: visible;/);
  assert.ok(baseColumns, "mobile and tablet keep normal page scrolling");
});

test("reports real launch blockers from catalog and seller data", async () => {
  const { buildLaunchReadiness } = await import(
    "../lib/launch-readiness.ts"
  );
  const now = Date.parse("2026-08-15T12:00:00.000Z");
  const state = { products: [
    {
      id: "product-1",
      title: "محصول آزمایشی معتبر",
      slug: "valid-product",
      brand: "Miran",
      category: "digital",
      sku: "SKU-1",
      description: "توضیح",
      placement: "special-offers",
      currency: "IRR",
      priceMinor: 10_000,
      compareAtPriceMinor: 12_000,
      stockQuantity: 3,
      reservedQuantity: 0,
      imageUrls: ["/media/products/product.webp"],
      videoUrl: "",
      amazingEnabled: true,
      amazingStartsAt: "2026-08-15T00:00:00.000Z",
      amazingEndsAt: "2026-08-16T00:00:00.000Z",
      variants: [],
      sellerOffers: [],
      visible: true,
    },
  ] };
  const invalidSeller = {
    id: "seller-1",
    createdAt: "2026-08-15T00:00:00.000Z",
    storeName: "فروشنده ناقص",
    contactName: "نمونه",
    email: "seller@example.com",
    phone: "09120000000",
    category: "digital",
    legalType: "individual",
    registrationNumber: "",
    address: "تهران",
    notes: "",
    guaranteeType: "review_later",
    guaranteeAmountMinor: 0,
    documents: [],
    documentStatus: "verified",
    guaranteeStatus: "waived",
    agreementStatus: "signed",
    adminNotes: "",
    status: "approved",
  };
  const report = buildLaunchReadiness({
    state,
    sellers: [invalidSeller],
    orders: [],
    paymentEnabled: false,
    siteUrl: "https://almiran.ir",
    siteIndexable: false,
    now,
  });
  assert.deepEqual(
    report.checks.filter((check) => check.status === "blocker").map((check) => check.id),
    ["payment", "seller-verification"],
  );
  assert.equal(report.checks.find((check) => check.id === "domain")?.status, "ready");
  assert.equal(report.checks.find((check) => check.id === "amazing")?.status, "ready");
});

test("requires an uploaded seller document before final approval", async () => {
  const { canApproveSeller } = await import(
    "../features/seller/seller-types.ts"
  );
  const review = {
    documentStatus: "verified",
    guaranteeStatus: "waived",
    agreementStatus: "signed",
    guaranteeType: "review_later",
    guaranteeAmountMinor: 0,
    adminNotes: "",
    status: "approved",
  };
  assert.equal(canApproveSeller({ ...review, documents: [] }), false);
  assert.equal(
    canApproveSeller({
      ...review,
      documents: [{
        id: "doc-1",
        name: "identity.pdf",
        contentType: "application/pdf",
        size: 100,
        downloadUrl: "/api/admin/sellers/documents?id=doc-1",
      }],
    }),
    true,
  );
});

test("guards inventory reservation updates and removes incomplete orders", async () => {
  const source = await readFile(
    new URL("../db/order-repository.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /UPDATE products[\s\S]*stock_quantity - reserved_quantity >= \?/,
  );
  assert.match(
    source,
    /UPDATE product_variants[\s\S]*stock_quantity - reserved_quantity >= \?/,
  );
  assert.match(
    source,
    /UPDATE seller_offers[\s\S]*stock_quantity - reserved_quantity >= \?/,
  );
  assert.match(source, /order\.items\.length !== input\.lines\.length/);
  assert.match(source, /rollbackIncompleteOrder/);
});

test("renders the managed storefront hero and category navigation", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /miran-default-hero\.png/);
  assert.match(html, /دسته‌بندی‌های اصلی/);
  assert.match(html, /سوپرمارکت/);
  assert.match(html, /دخانیات/);
  assert.match(html, /شگفت‌انگیزها/);
  assert.match(html, /تومان/);
  assert.doesNotMatch(html, /£|GBP|USD|EUR/);
});

test("reads owner-managed public media and colors from one persistent D1 state", async () => {
  const d1 = await createD1TestDatabase();
  const { createDefaultAdminState } = await import("../features/admin/admin-types.ts");
  const { readStorefrontState } = await import("../db/admin-repository.ts");
  const state = createDefaultAdminState();
  state.adminUsers = [{
    id: "private-admin",
    email: "private-admin@example.com",
    displayName: "Private Admin",
    role: "content_manager",
    active: true,
    permissions: ["state.read", "content.write"],
  }];
  state.banners = [{
    id: "public-banner",
    title: "بنر عمومی آزمون",
    altText: "بنر عمومی آزمون",
    href: "/offers",
    desktopImageUrl: "/media/banners/11111111-1111-4111-8111-111111111111.webp",
    mobileImageUrl: "",
    placement: "wide",
    scope: "home",
    categorySlug: "",
    startsAt: "",
    endsAt: "",
    visible: true,
  }];
  state.amazingSection.backgroundColor = "#1267d6";
  await d1.database.prepare(
    `INSERT INTO storefront_settings (id, data, updated_at, updated_by)
     VALUES (?, ?, CURRENT_TIMESTAMP, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`,
  ).bind("primary", JSON.stringify({ ...state, products: [] }), "owner@example.com").run();
  await d1.database.prepare(
    "UPDATE products SET image_url = ? WHERE id = ?",
  ).bind(
    JSON.stringify(["/media/products/22222222-2222-4222-8222-222222222222.png"]),
    "phone-1",
  ).run();
  const persisted = await readStorefrontState(d1.database);
  assert.equal(persisted.banners[0]?.desktopImageUrl, "/media/banners/11111111-1111-4111-8111-111111111111.webp");
  assert.equal(persisted.amazingSection.backgroundColor, "#1267d6");
  assert.equal(persisted.products.find((product) => product.id === "phone-1")?.imageUrls[0], "/media/products/22222222-2222-4222-8222-222222222222.png");

  const [layoutSource, managedSource, providerSource, apiSource] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/admin/managed-storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/admin/public-storefront-provider.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/storefront/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(layoutSource, /readStorefrontState/);
  assert.match(layoutSource, /toPublicStorefrontState\(state,/);
  assert.match(layoutSource, /PublicStorefrontProvider initialState=\{publicState\}/);
  assert.match(managedSource, /usePublicStorefrontState/);
  assert.match(providerSource, /loadPublicStorefrontState/);
  assert.match(apiSource, /toPublicStorefrontState\(state,/);
  assert.match(apiSource, /cloudflare-cdn-cache-control/);
  d1.close();
});

test("maps AdminState to a public-only storefront DTO without hiding owner data", async () => {
  const d1 = await createD1TestDatabase();
  const { createDefaultAdminState } = await import("../features/admin/admin-types.ts");
  const { toPublicStorefrontState } = await import("../features/admin/public-storefront.ts");
  const { readStorefrontState } = await import("../db/admin-repository.ts");
  const products = (await d1.database.prepare(
    "SELECT id FROM products ORDER BY rowid LIMIT 2",
  ).all()).results;
  const visibleProductId = products[0].id;
  const hiddenCategoryProductId = products[1].id;
  await d1.database.prepare("UPDATE products SET visible = 0").run();
  await d1.database.prepare(
    `UPDATE products
        SET visible = 1, category = 'mobile', stock_quantity = 10,
            reserved_quantity = 4
      WHERE id = ?`,
  ).bind(visibleProductId).run();
  await d1.database.prepare(
    `UPDATE products
        SET visible = 1, category = 'hookah-tobacco', stock_quantity = 10,
            reserved_quantity = 1
      WHERE id = ?`,
  ).bind(hiddenCategoryProductId).run();
  await d1.database.prepare(
    `INSERT INTO product_variants
       (id, product_id, title, sku, price_minor, stock_quantity, reserved_quantity)
     VALUES ('private-variant', ?, 'Private variant', 'PRIVATE-VARIANT', 1000, 5, 3)`,
  ).bind(visibleProductId).run();
  await d1.database.prepare(
    `INSERT INTO seller_offers
       (id, product_id, seller_application_id, seller_name, price_minor,
        stock_quantity, reserved_quantity, guarantee_label, delivery_label)
     VALUES ('private-offer', ?, 'private-seller-record', 'Public seller name',
             1000, 8, 2, 'Guarantee', 'Delivery')`,
  ).bind(visibleProductId).run();
  const state = createDefaultAdminState();
  state.adminUsers = [{
    id: "private-admin",
    email: "private-admin@example.com",
    displayName: "Private Admin",
    role: "owner",
    active: true,
    permissions: ["state.read"],
  }];
  state.hiddenCategoryIds = ["tobacco"];
  state.commerce.bankTransfer = {
    enabled: true,
    cardNumber: "6037997512345670",
    accountHolder: "Private account holder",
    bankName: "Private bank",
    instructions: "Private payment instructions",
    reviewHours: 24,
  };
  state.customCategories = [{
    id: "hidden-category-record",
    slug: "hidden-category",
    name: "Hidden category name",
    description: "Hidden category description",
    parentSlug: "",
    imageUrl: "",
    imageHidden: false,
    system: false,
    visible: false,
  }];
  state.banners = [
    {
      id: "active-banner",
      title: "Active public banner",
      altText: "Active public banner",
      href: "/offers",
      desktopImageUrl: "/active.webp",
      mobileImageUrl: "",
      placement: "wide",
      scope: "home",
      categorySlug: "",
      startsAt: "",
      endsAt: "",
      visible: true,
    },
    {
      id: "draft-banner",
      title: "Draft private banner",
      altText: "Draft private banner",
      href: "/offers",
      desktopImageUrl: "/draft.webp",
      mobileImageUrl: "",
      placement: "wide",
      scope: "home",
      categorySlug: "",
      startsAt: "",
      endsAt: "",
      visible: false,
    },
    {
      id: "future-banner",
      title: "Future private banner",
      altText: "Future private banner",
      href: "/offers",
      desktopImageUrl: "/future.webp",
      mobileImageUrl: "",
      placement: "wide",
      scope: "home",
      categorySlug: "",
      startsAt: "2027-01-01T00:00:00.000Z",
      endsAt: "2027-02-01T00:00:00.000Z",
      visible: true,
    },
  ];
  await d1.database.prepare(
    `INSERT INTO storefront_settings (id, data, updated_at, updated_by)
     VALUES ('primary', ?, CURRENT_TIMESTAMP, 'owner@example.com')
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`,
  ).bind(JSON.stringify({ ...state, products: [] })).run();

  const ownerState = await readStorefrontState(d1.database);
  const publicState = toPublicStorefrontState(ownerState, {
    now: Date.parse("2026-08-26T12:00:00.000Z"),
    categoryTaxonomy: [
      { slug: "digital" },
      { slug: "mobile", parentSlug: "digital" },
      { slug: "tobacco" },
      { slug: "hookah-tobacco", parentSlug: "tobacco" },
    ],
  });
  assert.equal(publicState.version, 1);
  assert.deepEqual(publicState.products.map((product) => product.id), [visibleProductId]);
  assert.equal(publicState.products[0].availableQuantity, 6);
  assert.deepEqual(publicState.banners.map((banner) => banner.id), ["active-banner"]);
  assert.ok(!publicState.visibleCategorySlugs.includes("tobacco"));
  assert.ok(!publicState.visibleCategorySlugs.includes("hookah-tobacco"));
  assert.ok(!publicState.categories.some((category) => category.slug === "hidden-category"));
  const publicJson = JSON.stringify(publicState);
  for (const privateValue of [
    "reservedQuantity",
    "adminUsers",
    "hiddenCategoryIds",
    "private-admin@example.com",
    "6037997512345670",
    "private-seller-record",
    "Private variant",
    "Draft private banner",
    "Future private banner",
    "Hidden category name",
  ]) {
    assert.ok(!publicJson.includes(privateValue), `${privateValue} leaked into public DTO`);
  }
  assert.equal(ownerState.adminUsers[0].email, "private-admin@example.com");
  assert.deepEqual(ownerState.hiddenCategoryIds, ["tobacco"]);
  assert.equal(ownerState.products.find((product) => product.id === visibleProductId).reservedQuantity, 4);
  assert.equal(
    ownerState.products.find((product) => product.id === visibleProductId).sellerOffers[0].sellerId,
    "private-seller-record",
  );
  d1.close();
});

test("keeps brands in their category branch and scopes banners per storefront", async () => {
  const {
    createDefaultAdminState,
    getActiveBanners,
    normalizeAdminState,
    stableBrandSlug,
  } = await import("../features/admin/admin-types.ts");
  const state = createDefaultAdminState();
  state.customCategories = [{
    id: "category-tobacco-leaf",
    slug: "tobacco-leaf",
    name: "تنباکو",
    description: "انواع تنباکو",
    parentSlug: "tobacco",
    imageUrl: "",
    imageHidden: false,
    system: false,
    visible: true,
  }];
  state.brands = [{
    id: "brand-jellayer",
    slug: "jellayer",
    name: "جلایر",
    categorySlug: "tobacco-leaf",
  }];
  state.banners = [
    {
      id: "home-banner",
      title: "صفحه اصلی",
      altText: "صفحه اصلی",
      href: "/",
      desktopImageUrl: "/media/banners/11111111-1111-4111-8111-111111111111.webp",
      mobileImageUrl: "",
      placement: "wide",
      scope: "home",
      categorySlug: "",
      startsAt: "",
      endsAt: "",
      visible: true,
    },
    {
      id: "tobacco-banner",
      title: "دخانیات",
      altText: "دخانیات",
      href: "/category/tobacco",
      desktopImageUrl: "/media/banners/22222222-2222-4222-8222-222222222222.webp",
      mobileImageUrl: "",
      placement: "wide",
      scope: "category",
      categorySlug: "tobacco",
      startsAt: "",
      endsAt: "",
      visible: true,
    },
  ];
  const normalized = normalizeAdminState(state);
  assert.equal(normalized.brands[0]?.categorySlug, "tobacco-leaf");
  assert.equal(stableBrandSlug("جلایر"), stableBrandSlug("جلایر"));
  assert.deepEqual(getActiveBanners(normalized).map((banner) => banner.id), ["home-banner"]);
  assert.deepEqual(
    getActiveBanners(normalized, { scope: "category", categorySlug: "tobacco" }).map((banner) => banner.id),
    ["tobacco-banner"],
  );
});

test("collects brands from a parent category branch without exposing subcategory cards", async () => {
  const { collectCategoryBrands } = await import("../features/catalog/category-brand-collection.ts");
  const categories = [
    { slug: "tobacco", name: "دخانیات", description: "" },
    { slug: "hookah-tobacco", name: "تنباکو", description: "", parentSlug: "tobacco" },
  ];
  const products = [{
    id: "jellayer-mint",
    title: "تنباکو جلایر نعنا",
    href: "/product/jellayer-mint",
    mediaLabel: "جلایر",
    brandId: "jellayer",
    brandName: "جلایر",
    categorySlugs: ["hookah-tobacco", "tobacco"],
    price: { amountMinor: 1_000_000, currency: "IRR" },
    inStock: true,
    featuredRank: 1,
    publishedAt: "2026-08-25T00:00:00Z",
  }];
  const managedBrands = [{
    id: "brand-jellayer",
    slug: "jellayer",
    name: "جلایر",
    categorySlug: "hookah-tobacco",
  }];
  assert.deepEqual(
    collectCategoryBrands("tobacco", categories, products, managedBrands),
    [{
      id: "jellayer",
      name: "جلایر",
      categorySlug: "hookah-tobacco",
      productCount: 1,
    }],
  );
});

test("separates category, banner, and category-filtered product management", async () => {
  const [adminSource, categorySource] = await Promise.all([
    readFile(new URL("../features/admin/admin-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/category/[slug]/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(adminSource, /\["categories", "دسته‌ها و برندها"\]/);
  assert.match(adminSource, /\["banners", "بنرها"\]/);
  assert.match(adminSource, /filteredAdminProducts/);
  assert.match(adminSource, /isCategoryWithin\(product\.category, activeProductCategoryFilter\)/);
  assert.match(adminSource, /افزودن زیر‌دسته/);
  assert.match(adminSource, /beginNewBrand\(category\.slug\)/);
  assert.match(categorySource, /ManagedBanners categorySlug=\{listing\.category\.slug\}/);
  assert.match(categorySource, /getCatalogBrandsForCategory/);
});

test("serves managed product images publicly from R2 without an owner session", async () => {
  const { servePublicMediaObject } = await import("../lib/public-media.ts");
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const key = "products/33333333-3333-4333-8333-333333333333.png";
  const bucket = {
    async get(requestedKey) {
      assert.equal(requestedKey, key);
      return {
        body: new Blob([bytes]).stream(),
        httpEtag: '"product-image-v1"',
        writeHttpMetadata(headers) {
          headers.set("content-type", "image/png");
        },
      };
    },
  };
  const response = await servePublicMediaObject(
    new Request(`https://almiran.ir/media/${key}`),
    key,
    bucket,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.match(response.headers.get("cache-control") ?? "", /immutable/);
  assert.equal(response.headers.get("content-disposition"), "inline");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);

  const notFound = await servePublicMediaObject(
    new Request("https://almiran.ir/media/products/not-a-valid-key.png"),
    "products/not-a-valid-key.png",
    bucket,
  );
  assert.equal(notFound.status, 404);
  assert.match(notFound.headers.get("cache-control") ?? "", /no-store/);
});

test("renders the dedicated amazing-offers experience", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request(
      "http://localhost/offers?category=digital&inStock=1&sort=discount",
      { headers: { accept: "text/html" } },
    ),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /پیشنهاد شگفت‌انگیز/);
  assert.match(html, /شگفت‌انگیز روز/);
  assert.match(html, /تمام پیشنهادهای شگفت‌انگیز/);
  assert.match(html, /فیلتر و مرتب‌سازی/);
  assert.match(html, /پیشنهاد شگفت‌انگیز(?:<!-- -->)? کالای دیجیتال/);
  assert.match(html, /تومان/);
});

test("renders every parent category as its own storefront", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/category/digital", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /کالای دیجیتال/);
  assert.doesNotMatch(html, /فروشگاه تخصصی Miran Shop/);
  assert.match(html, /برندهای(?: <!-- -->)?کالای دیجیتال/);
  assert.doesNotMatch(html, /زیرمجموعه‌های(?: <!-- -->)?کالای دیجیتال/);
  assert.match(html, /شگفت‌انگیز کالای دیجیتال/);
  assert.match(html, /منتخب کالای دیجیتال/);
});

test("provides the tobacco parent category for manager-owned subcategories", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/category/tobacco", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /دخانیات/);
  assert.doesNotMatch(html, /زیرمجموعه‌های(?: <!-- -->)?دخانیات/);
  assert.doesNotMatch(html, /فروشگاه تخصصی Miran Shop/);
});

test("uses the stored mint image and canonical product route in every storefront card", async () => {
  const { productHref, resolveProductSlug } = await import("../lib/product-link.ts");
  assert.equal(resolveProductSlug("jelayer-mint-250"), "jellayer-mint-250");
  assert.equal(productHref("jelayer-mint-250"), "/product/jellayer-mint-250");

  const d1 = await createD1TestDatabase();
  const imageUrl = "/media/products/efa4e311-7a55-465b-b792-93ff976b3410.png";
  await d1.database.prepare(
    `UPDATE products
        SET slug = ?, title = ?, brand = ?, category = ?, placement = ?,
            image_url = ?, visible = 1, amazing_enabled = 1,
            amazing_starts_at = ?, amazing_ends_at = ?
      WHERE id = ?`,
  ).bind(
    "jellayer-mint-250",
    "تنباکو 250 گرمی جلایر نعنا",
    "جلایر",
    "hookah-tobacco",
    "home-picks",
    JSON.stringify([imageUrl]),
    "2026-08-24T03:00:00.000Z",
    "2026-09-06T03:00:00.000Z",
    "phone-1",
  ).run();

  const { readStorefrontState } = await import("../db/admin-repository.ts");
  const persisted = await readStorefrontState(d1.database);
  const mint = persisted.products.find((product) => product.slug === "jellayer-mint-250");
  assert.equal(mint?.visible, true);
  assert.equal(mint?.imageUrls[0], imageUrl);

  const worker = await loadWorker();
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const legacy = await worker.fetch(
    new Request("http://localhost/product/jelayer-mint-250", { redirect: "manual", headers: { accept: "text/html" } }),
    env,
    context,
  );
  assert.equal(legacy.status, 308);
  assert.equal(new URL(legacy.headers.get("location"), "http://localhost").pathname, "/product/jellayer-mint-250");
  const [categorySource, managedSource, catalogSource, cardCss, amazingCss] = await Promise.all([
    readFile(new URL("../features/catalog/category-listing.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/admin/managed-storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/catalog/catalog-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/color-theme.css", import.meta.url), "utf8"),
    readFile(new URL("../features/offers/amazing-offers.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(categorySource, /product\.imageUrl[\s\S]*src=\{product\.imageUrl\}/);
  assert.match(managedSource, /href: productHref\(product\.slug\)/);
  assert.match(catalogSource, /href: productHref\(product\.slug\)/);
  assert.match(cardCss, /miran-product-card__media > img[\s\S]*object-fit: contain/);
  assert.match(amazingCss, /productCard > a[\s\S]*min-height: 22rem/);
  d1.close();
});

test("moves legacy tobacco-root products into the tobacco leaf without deleting records", async () => {
  const d1 = await createD1TestDatabase();
  const { readStorefrontState } = await import("../db/admin-repository.ts");
  const before = await d1.database.prepare("SELECT COUNT(*) AS count FROM products").first();
  await d1.database.prepare(
    "UPDATE products SET category = 'tobacco' WHERE id = 'phone-1'",
  ).run();
  const state = await readStorefrontState(d1.database);
  assert.equal(
    state.products.find((product) => product.id === "phone-1")?.category,
    "hookah-tobacco",
  );
  const after = await d1.database.prepare("SELECT COUNT(*) AS count FROM products").first();
  assert.equal(after.count, before.count);
  d1.close();
});

test("rejects cross-site order mutations before reading customer data", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({}),
    }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 403);
  assert.match(await response.text(), /بین‌سایتی|مبدأ/);
});

test("requires a signed-in customer before creating an order", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({}),
    }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 401);
  assert.match(await response.text(), /وارد حساب/);
});

test("resolves checkout addresses only from the signed-in customer", async () => {
  const source = await readFile(
    new URL("../app/api/orders/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /getOwnedCustomerAddress\(user\.email, addressId\)/);
  assert.doesNotMatch(source, /payload\.customer|customer:\s*payload/);
});

test("keeps the admin orders API private", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/orders"),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 401);
});

test("keeps admin support and review moderation APIs private", async () => {
  const worker = await loadWorker();
  const [support, reviews] = await Promise.all([
    worker.fetch(new Request("http://localhost/api/admin/support"), {}, { waitUntil() {}, passThroughOnException() {} }),
    worker.fetch(new Request("http://localhost/api/admin/reviews"), {}, { waitUntil() {}, passThroughOnException() {} }),
  ]);
  assert.equal(support.status, 401);
  assert.equal(reviews.status, 401);
});

test("keeps every destructive management endpoint private", async () => {
  const worker = await loadWorker();
  const paths = [
    "/api/admin/products",
    "/api/admin/product-variants",
    "/api/admin/orders",
    "/api/admin/sellers",
    "/api/admin/customers",
    "/api/admin/support",
    "/api/admin/reviews",
  ];
  const responses = await Promise.all(paths.map((path) => worker.fetch(
    new Request(`http://localhost${path}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000000" }),
    }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  )));
  assert.deepEqual(responses.map((response) => response.status), [401, 401, 401, 401, 401, 401, 401]);
});

test("keeps owner credential settings private", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/credentials"),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 401);
});

test("keeps storefront management state private", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/state"),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 401);
});

test("keeps backups and revisions private", async () => {
  const worker = await loadWorker();
  const [backup, revisions] = await Promise.all([
    worker.fetch(
      new Request("http://localhost/api/admin/backup"),
      {},
      { waitUntil() {}, passThroughOnException() {} },
    ),
    worker.fetch(
      new Request("http://localhost/api/admin/revisions"),
      {},
      { waitUntil() {}, passThroughOnException() {} },
    ),
  ]);
  assert.equal(backup.status, 403);
  assert.equal(revisions.status, 403);
});

test("keeps the launch-readiness report private", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/readiness"),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 401);
});

test("reports payment unavailable until an owner configures a merchant", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/payments/capability"),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    enabled: false,
    provider: null,
    reason: "merchant_not_configured",
  });
});

test("keeps encrypted Zarinpal configuration private", async () => {
  const {
    getPaymentProviderAdminConfig,
    readZarinpalVaultConfig,
    savePaymentProviderAdminConfig,
  } = await import("../lib/payment-provider-config.ts");
  const d1 = await createD1TestDatabase();
  const merchantId = "00000000-0000-0000-0000-000000000000";
  const encryptionKey = Buffer.alloc(32, 7).toString("base64");
  const config = await savePaymentProviderAdminConfig({
    enabled: true,
    sandbox: true,
    merchantId,
    actorEmail: "owner@example.com",
  }, d1.database, encryptionKey);
  assert.equal(config.configured, true);
  assert.equal(config.enabled, true);
  assert.doesNotMatch(JSON.stringify(config), new RegExp(merchantId));
  const stored = await d1.database.prepare(
    "SELECT enabled, sandbox, credentials_ciphertext FROM payment_provider_configs WHERE provider = 'zarinpal'",
  ).first();
  assert.equal(stored.enabled, 1);
  assert.equal(stored.sandbox, 1);
  assert.ok(stored.credentials_ciphertext.length > 20);
  assert.doesNotMatch(stored.credentials_ciphertext, new RegExp(merchantId));
  assert.equal((await getPaymentProviderAdminConfig(d1.database, encryptionKey)).credentialHint, "••••0000");
  assert.deepEqual(await readZarinpalVaultConfig(d1.database, encryptionKey), {
    disabled: false,
    merchantId,
    sandbox: true,
  });
  const routeSource = await readFile(
    new URL("../app/api/admin/payment-providers/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(routeSource, /getAdminAccess\("security\.write"\)/);
  assert.match(routeSource, /rejectCrossSiteMutation/);
  d1.close();
});

test("uses the documented ZarinPal endpoints and maps provider failures", async () => {
  const source = await readFile(
    new URL("../lib/payment-provider.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /https:\/\/payment\.zarinpal\.com\/pg\/v4/);
  assert.match(source, /https:\/\/payment\.zarinpal\.com\/pg\/StartPay/);
  assert.doesNotMatch(source, /https:\/\/api\.zarinpal\.com/);
  assert.match(source, /case -18:[\s\S]*دامنه/);
  assert.match(source, /PAYMENT_CONNECTION_FAILED/);
});

test("rejects cross-site payment session creation", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/payments/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ orderNumber: "MS-X", email: "x@example.com" }),
    }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 403);
});

test("requires the same signed-in customer before starting payment", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/payments/session", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ orderNumber: "MS-X" }),
    }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 401);
  assert.match(await response.text(), /وارد حساب/);
});

test("bounds signed-in payment requests before accessing order data", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/payments/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        "oai-authenticated-user-email": "customer@example.com",
        "content-length": "4096",
      },
      body: JSON.stringify({ orderNumber: "X".repeat(3000) }),
    }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 422);
});

test("normalizes and validates Iranian card numbers before enabling bank transfer", async () => {
  const {
    formatCardNumber,
    isBankTransferConfigured,
    isValidIranianCardNumber,
    normalizeCardNumber,
  } = await import("../lib/bank-transfer.ts");
  assert.equal(normalizeCardNumber("۶۰۳۷-۹۹۷۵-۱۲۳۴-۵۶۷۰"), "6037997512345670");
  assert.equal(formatCardNumber("6037997512345670"), "6037 9975 1234 5670");
  assert.equal(isValidIranianCardNumber("6037997512345670"), true);
  assert.equal(isValidIranianCardNumber("1111111111111111"), false);
  assert.equal(isBankTransferConfigured({
    enabled: true,
    cardNumber: "6037997512345670",
    accountHolder: "مالک فروشگاه",
    bankName: "",
    instructions: "",
    reviewHours: 24,
  }), true);
});

test("adds private receipt storage metadata without changing existing commerce data", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0000_breezy_bastion.sql",
    "0001_big_masked_marvel.sql",
    "0002_previous_alice.sql",
    "0003_organic_amazoness.sql",
    "0004_foamy_violations.sql",
    "0005_cool_gambit.sql",
    "0006_furry_skreet.sql",
    "0007_slim_karen_page.sql",
    "0008_furry_gamma_corps.sql",
  ]) {
    const sql = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  const before = {
    products: database.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    orders: database.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    sellers: database.prepare("SELECT COUNT(*) AS count FROM seller_applications").get().count,
  };
  const migration = await readFile(
    new URL("../drizzle/0009_square_magneto.sql", import.meta.url),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  const after = {
    products: database.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    orders: database.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    sellers: database.prepare("SELECT COUNT(*) AS count FROM seller_applications").get().count,
  };
  assert.deepEqual(after, before);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM bank_transfer_receipts").get().count, 0);
  assert.ok(database.prepare("PRAGMA index_list('bank_transfer_receipts')").all().some(
    (index) => index.name === "bank_transfer_receipts_pending_order_unique" && index.unique === 1,
  ));
  database.close();
});

test("adds support, review, and notification tables without changing commerce data", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0000_breezy_bastion.sql",
    "0001_big_masked_marvel.sql",
    "0002_previous_alice.sql",
    "0003_organic_amazoness.sql",
    "0004_foamy_violations.sql",
    "0005_cool_gambit.sql",
    "0006_furry_skreet.sql",
    "0007_slim_karen_page.sql",
    "0008_furry_gamma_corps.sql",
    "0009_square_magneto.sql",
  ]) {
    const sql = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  const before = {
    products: database.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    orders: database.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    sellers: database.prepare("SELECT COUNT(*) AS count FROM seller_applications").get().count,
  };
  const migration = await readFile(new URL("../drizzle/0010_parched_eddie_brock.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  const after = {
    products: database.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    orders: database.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    sellers: database.prepare("SELECT COUNT(*) AS count FROM seller_applications").get().count,
  };
  assert.deepEqual(after, before);
  for (const table of ["support_tickets", "support_messages", "product_reviews", "customer_notifications"]) {
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0);
  }
  database.close();
});

test("isolates support tickets and notifies the customer after an admin reply", async () => {
  const {
    createSupportTicket,
    listCustomerNotifications,
    listCustomerSupportTickets,
    replyToCustomerSupportTicket,
    updateAdminSupportTicket,
  } = await import("../db/customer-care-repository.ts");
  const d1 = await createD1TestDatabase();
  const ticket = await createSupportTicket({
    customerEmail: "customer@example.com",
    customerName: "مشتری آزمایشی",
    subject: "پرسش درباره سفارش",
    category: "order",
    orderNumber: "",
    body: "لطفاً وضعیت ارسال را بررسی کنید.",
  }, d1.database);
  assert.equal(ticket.status, "open");
  assert.equal(ticket.messages.length, 1);
  assert.deepEqual(await listCustomerSupportTickets("other@example.com", d1.database), []);
  await assert.rejects(
    replyToCustomerSupportTicket("other@example.com", ticket.id, "پاسخ غیرمجاز", d1.database),
    /SUPPORT_NOT_FOUND/,
  );
  const updated = await updateAdminSupportTicket({
    ticketId: ticket.id,
    status: "waiting_customer",
    reply: "کد رهگیری را پس از تحویل به پست ثبت می‌کنیم.",
    actorEmail: "owner@example.com",
  }, d1.database);
  assert.equal(updated.status, "waiting_customer");
  assert.equal(updated.messages.at(-1).authorRole, "admin");
  const notifications = await listCustomerNotifications("customer@example.com", d1.database);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].href, /account#support/);
  d1.close();
});

test("publishes reviews only after verified purchase and admin moderation", async () => {
  const {
    getCustomerReviewState,
    listApprovedProductReviews,
    moderateProductReview,
    submitProductReview,
  } = await import("../db/review-repository.ts");
  const { listCustomerNotifications } = await import("../db/customer-care-repository.ts");
  const d1 = await createD1TestDatabase();
  const product = await d1.database.prepare("SELECT id, slug, title, sku, price_minor FROM products ORDER BY rowid LIMIT 1").first();
  await d1.database.prepare(
    `INSERT INTO orders (
       id, order_number, idempotency_key, status, payment_status,
       customer_name, customer_email, customer_phone, address_line, city,
       postcode, delivery_method, currency, subtotal_minor, delivery_minor, total_minor
     ) VALUES (?, ?, ?, 'shipped', 'paid', ?, ?, ?, ?, ?, ?, ?, 'IRR', ?, 0, ?)`,
  ).bind(
    "review-order", "MS-REVIEW-1", "review-key", "خریدار", "buyer@example.com",
    "09120000000", "نشانی", "تهران", "", "standard", product.price_minor, product.price_minor,
  ).run();
  await d1.database.prepare(
    `INSERT INTO order_items (
       id, order_id, product_id, slug, sku, title, quantity, unit_price_minor, line_total_minor
     ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).bind("review-item", "review-order", product.id, product.slug, product.sku, product.title, product.price_minor, product.price_minor).run();

  assert.equal((await getCustomerReviewState(product.id, "buyer@example.com", d1.database)).eligible, true);
  await assert.rejects(
    submitProductReview({ productId: product.id, customerEmail: "other@example.com", customerName: "دیگری", rating: 5, title: "", body: "این خرید متعلق به من نیست." }, d1.database),
    /REVIEW_NOT_ELIGIBLE/,
  );
  const submitted = await submitProductReview({
    productId: product.id,
    customerEmail: "buyer@example.com",
    customerName: "خریدار آزمایشی",
    rating: 5,
    title: "کیفیت مناسب",
    body: "محصول سالم و مطابق توضیحات به دستم رسید.",
  }, d1.database);
  assert.equal(submitted.status, "pending");
  assert.equal((await listApprovedProductReviews(product.id, d1.database)).length, 0);
  const approved = await moderateProductReview({
    reviewId: submitted.id,
    status: "approved",
    moderationNote: "دیدگاه تأیید شد.",
    actorEmail: "owner@example.com",
  }, d1.database);
  assert.equal(approved.status, "approved");
  assert.equal((await listApprovedProductReviews(product.id, d1.database)).length, 1);
  assert.equal((await listCustomerNotifications("buyer@example.com", d1.database)).length, 1);
  d1.close();
});

test("keeps bank-transfer receipts pending until an authorized manual review", async () => {
  const {
    createBankTransferReceipt,
    listCustomerBankTransferReceipts,
    reviewBankTransferReceipt,
  } = await import("../db/bank-transfer-repository.ts");
  const d1 = await createD1TestDatabase();
  const expires = new Date(Date.now() + 30 * 60_000).toISOString();
  await d1.database.prepare(
    `INSERT INTO orders (
       id, order_number, idempotency_key, status, payment_status,
       reservation_expires_at, customer_name, customer_email, customer_phone,
       address_line, city, postcode, delivery_method, currency,
       subtotal_minor, delivery_minor, total_minor
     ) VALUES (?, ?, ?, 'new', 'not_collected', ?, ?, ?, ?, ?, ?, ?, ?, 'IRR', ?, 0, ?)`,
  ).bind(
    "receipt-order",
    "MS-RECEIPT-1",
    "receipt-key",
    expires,
    "مشتری",
    "receipt@example.com",
    "09120000000",
    "نشانی",
    "تهران",
    "",
    "standard",
    1_000_000,
    1_000_000,
  ).run();
  const receipt = await createBankTransferReceipt({
    orderId: "receipt-order",
    customerEmail: "receipt@example.com",
    storageKey: "payment-receipts/example.pdf",
    originalName: "receipt.pdf",
    contentType: "application/pdf",
    size: 1200,
    transferReference: "TRACK-1",
    customerNote: "واریز انجام شد",
    reviewHours: 24,
  }, d1.database);
  assert.equal(receipt.status, "pending");
  assert.equal((await listCustomerBankTransferReceipts("RECEIPT@example.com", d1.database)).length, 1);
  assert.deepEqual(await listCustomerBankTransferReceipts("other@example.com", d1.database), []);
  assert.equal((await d1.database.prepare(
    "SELECT payment_status FROM orders WHERE id = 'receipt-order'",
  ).first()).payment_status, "pending");
  await assert.rejects(
    createBankTransferReceipt({
      orderId: "receipt-order",
      customerEmail: "receipt@example.com",
      storageKey: "payment-receipts/duplicate.pdf",
      originalName: "duplicate.pdf",
      contentType: "application/pdf",
      size: 1200,
      transferReference: "",
      customerNote: "",
      reviewHours: 24,
    }, d1.database),
    /RECEIPT_PENDING/,
  );
  const approved = await reviewBankTransferReceipt({
    id: receipt.id,
    status: "approved",
    actorEmail: "owner@example.com",
    reviewNote: "واریز در حساب کنترل شد",
  }, d1.database);
  assert.equal(approved.status, "approved");
  assert.deepEqual({ ...(await d1.database.prepare(
    "SELECT status, payment_status, reservation_expires_at FROM orders WHERE id = 'receipt-order'",
  ).first()) }, {
    status: "confirmed",
    payment_status: "paid",
    reservation_expires_at: "",
  });
  assert.equal((await d1.database.prepare(
    "SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = 'bank-transfer.receipt-approved'",
  ).first()).count, 1);
  d1.close();
});

test("protects receipt submission from anonymous and cross-site requests", async () => {
  const worker = await loadWorker();
  const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const context = { waitUntil() {}, passThroughOnException() {} };
  const anonymous = await worker.fetch(
    new Request("https://almiran.ir/api/payments/bank-transfer/receipt", { method: "POST" }),
    env,
    context,
  );
  assert.equal(anonymous.status, 401);
  const crossSite = await worker.fetch(
    new Request("https://almiran.ir/api/payments/bank-transfer/receipt", {
      method: "POST",
      headers: {
        "oai-authenticated-user-email": "customer@example.com",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
    }),
    env,
    context,
  );
  assert.equal(crossSite.status, 403);
});

test("keeps seller identity documents private", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request(
      "http://localhost/api/admin/sellers/documents?applicationId=test&documentId=test",
    ),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 401);
});

test("keeps campaign image uploads private", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/upload", {
      method: "POST",
      body: new FormData(),
    }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 403);
});

test("rejects cross-site seller applications before reading documents", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/sellers", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
      body: new FormData(),
    }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 403);
});

test("rejects oversized seller uploads before parsing multipart data", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/sellers", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "multipart/form-data; boundary=test",
        "content-length": "17000000",
      },
      body: "--test--",
    }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 413);
});

test("adds persistent rate limits without changing commerce records", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0000_breezy_bastion.sql",
    "0001_big_masked_marvel.sql",
    "0002_previous_alice.sql",
    "0003_organic_amazoness.sql",
    "0004_foamy_violations.sql",
    "0005_cool_gambit.sql",
    "0006_furry_skreet.sql",
    "0007_slim_karen_page.sql",
    "0008_furry_gamma_corps.sql",
    "0009_square_magneto.sql",
    "0010_parched_eddie_brock.sql",
  ]) {
    const sql = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  const before = {
    products: database.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    orders: database.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    sellers: database.prepare("SELECT COUNT(*) AS count FROM seller_applications").get().count,
  };
  const migration = await readFile(new URL("../drizzle/0011_lucky_vapor.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  const after = {
    products: database.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    orders: database.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    sellers: database.prepare("SELECT COUNT(*) AS count FROM seller_applications").get().count,
  };
  assert.deepEqual(after, before);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM request_rate_limits").get().count, 0);
  database.close();
});

test("adds encrypted payment-provider storage without changing commerce records", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0000_breezy_bastion.sql",
    "0001_big_masked_marvel.sql",
    "0002_previous_alice.sql",
    "0003_organic_amazoness.sql",
    "0004_foamy_violations.sql",
    "0005_cool_gambit.sql",
    "0006_furry_skreet.sql",
    "0007_slim_karen_page.sql",
    "0008_furry_gamma_corps.sql",
    "0009_square_magneto.sql",
    "0010_parched_eddie_brock.sql",
    "0011_lucky_vapor.sql",
  ]) {
    const sql = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  const before = {
    products: database.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    orders: database.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    sellers: database.prepare("SELECT COUNT(*) AS count FROM seller_applications").get().count,
  };
  const migration = await readFile(new URL("../drizzle/0012_dark_blade.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  const after = {
    products: database.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    orders: database.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    sellers: database.prepare("SELECT COUNT(*) AS count FROM seller_applications").get().count,
  };
  assert.deepEqual(after, before);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM payment_provider_configs").get().count, 0);
  database.close();
});

test("adds safe product archiving without changing existing commerce records", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0000_breezy_bastion.sql",
    "0001_big_masked_marvel.sql",
    "0002_previous_alice.sql",
    "0003_organic_amazoness.sql",
    "0004_foamy_violations.sql",
    "0005_cool_gambit.sql",
    "0006_furry_skreet.sql",
    "0007_slim_karen_page.sql",
    "0008_furry_gamma_corps.sql",
    "0009_square_magneto.sql",
    "0010_parched_eddie_brock.sql",
    "0011_lucky_vapor.sql",
    "0012_dark_blade.sql",
  ]) {
    const sql = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  const before = {
    products: database.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    orders: database.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
  };
  const migration = await readFile(new URL("../drizzle/0013_steep_clint_barton.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  assert.deepEqual({
    products: database.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    orders: database.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
  }, before);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM products WHERE archived_at != ''").get().count, 0);
  database.close();
});

test("adds the customer account directory without changing existing live records", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0000_breezy_bastion.sql",
    "0001_big_masked_marvel.sql",
    "0002_previous_alice.sql",
    "0003_organic_amazoness.sql",
    "0004_foamy_violations.sql",
    "0005_cool_gambit.sql",
    "0006_furry_skreet.sql",
    "0007_slim_karen_page.sql",
    "0008_furry_gamma_corps.sql",
    "0009_square_magneto.sql",
    "0010_parched_eddie_brock.sql",
    "0011_lucky_vapor.sql",
    "0012_dark_blade.sql",
    "0013_steep_clint_barton.sql",
  ]) {
    const sql = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  const before = {
    products: database.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    orders: database.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    sellers: database.prepare("SELECT COUNT(*) AS count FROM seller_applications").get().count,
  };
  const migration = await readFile(new URL("../drizzle/0014_brave_ronan.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  assert.deepEqual({
    products: database.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    orders: database.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    sellers: database.prepare("SELECT COUNT(*) AS count FROM seller_applications").get().count,
  }, before);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM customer_accounts").get().count, 0);
  database.close();
});

test("adds owner credential and session tables without changing live commerce data", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(":memory:");
  for (const file of [
    "0000_breezy_bastion.sql",
    "0001_big_masked_marvel.sql",
    "0002_previous_alice.sql",
    "0003_organic_amazoness.sql",
    "0004_foamy_violations.sql",
    "0005_cool_gambit.sql",
    "0006_furry_skreet.sql",
    "0007_slim_karen_page.sql",
    "0008_furry_gamma_corps.sql",
    "0009_square_magneto.sql",
    "0010_parched_eddie_brock.sql",
    "0011_lucky_vapor.sql",
    "0012_dark_blade.sql",
    "0013_steep_clint_barton.sql",
    "0014_brave_ronan.sql",
  ]) {
    const sql = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  const before = {
    products: database.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    orders: database.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    sellers: database.prepare("SELECT COUNT(*) AS count FROM seller_applications").get().count,
  };
  const migration = await readFile(new URL("../drizzle/0015_silent_kingpin.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  assert.deepEqual({
    products: database.prepare("SELECT COUNT(*) AS count FROM products").get().count,
    orders: database.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    sellers: database.prepare("SELECT COUNT(*) AS count FROM seller_applications").get().count,
  }, before);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM admin_owner_credentials").get().count, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM admin_owner_sessions").get().count, 0);
  database.close();
});

test("lets authorized management remove products and preserves products referenced by orders", async () => {
  const { deleteAdminProduct, readStorefrontState } = await import("../db/admin-repository.ts");
  const d1 = await createD1TestDatabase();
  const products = await d1.database.prepare(
    "SELECT id, slug, sku, title, price_minor FROM products ORDER BY rowid ASC LIMIT 2",
  ).all();
  const removable = products.results[0];
  const referenced = products.results[1];
  assert.equal((await deleteAdminProduct(removable.id, "owner@example.com", d1.database)).mode, "deleted");
  assert.equal(await d1.database.prepare("SELECT id FROM products WHERE id = ?").bind(removable.id).first(), null);
  await d1.database.prepare(
    `INSERT INTO orders (
       id, order_number, idempotency_key, status, payment_status,
       customer_name, customer_email, customer_phone, address_line, city,
       postcode, delivery_method, currency, subtotal_minor, delivery_minor, total_minor
     ) VALUES ('archive-order', 'MS-ARCHIVE', 'archive-key', 'confirmed', 'paid',
       'مشتری', 'archive@example.com', '09120000000', 'نشانی', 'تهران', '',
       'standard', 'IRR', ?, 0, ?)`,
  ).bind(referenced.price_minor, referenced.price_minor).run();
  await d1.database.prepare(
    `INSERT INTO order_items (
       id, order_id, product_id, slug, sku, title, quantity,
       unit_price_minor, line_total_minor
     ) VALUES ('archive-item', 'archive-order', ?, ?, ?, ?, 1, ?, ?)`,
  ).bind(referenced.id, referenced.slug, referenced.sku, referenced.title, referenced.price_minor, referenced.price_minor).run();
  assert.equal((await deleteAdminProduct(referenced.id, "owner@example.com", d1.database)).mode, "archived");
  const archived = await d1.database.prepare("SELECT visible, archived_at FROM products WHERE id = ?").bind(referenced.id).first();
  assert.equal(archived.visible, 0);
  assert.ok(archived.archived_at);
  const state = await readStorefrontState(d1.database);
  assert.equal(state.products.some((product) => product.id === referenced.id), false);
  const routeSource = await readFile(new URL("../app/api/admin/products/route.ts", import.meta.url), "utf8");
  const stateRouteSource = await readFile(new URL("../app/api/admin/state/route.ts", import.meta.url), "utf8");
  assert.match(routeSource, /getAdminAccess\("catalog\.delete"\)/);
  assert.match(routeSource, /rejectCrossSiteMutation/);
  assert.match(stateRouteSource, /مجوز حذف این اطلاعات/);
  assert.match(stateRouteSource, /admins\.write/);
  d1.close();
});

test("deletes only an unreserved owned variant and preserves product, sibling, offers, media, and history", async () => {
  const { deleteAdminProductVariant } = await import("../db/admin-repository.ts");
  const d1 = await createD1TestDatabase();
  const product = await d1.database.prepare(
    "SELECT id, title, slug, price_minor, image_url, video_url FROM products ORDER BY rowid ASC LIMIT 1",
  ).first();
  const siblingProduct = await d1.database.prepare(
    "SELECT id FROM products ORDER BY rowid ASC LIMIT 1 OFFSET 1",
  ).first();
  const snapshot = structuredClone(product);
  await d1.database.prepare(
    `INSERT INTO product_variants
       (id, product_id, title, sku, price_minor, stock_quantity, reserved_quantity)
     VALUES ('delete-variant', ?, 'حذف‌شونده', 'DELETE-VARIANT', 1200, 4, 0),
            ('sibling-variant', ?, 'باقی‌مانده', 'SIBLING-VARIANT', 1300, 5, 0),
            ('other-product-variant', ?, 'محصول دیگر', 'OTHER-VARIANT', 1400, 6, 0)`,
  ).bind(product.id, product.id, siblingProduct.id).run();
  await d1.database.prepare(
    `INSERT INTO catalog_attribute_definitions (id, category_slug, code, label)
     VALUES ('delete-attribute-definition', 'digital', 'color', 'رنگ')`,
  ).run();
  await d1.database.prepare(
    `INSERT INTO product_variant_attribute_values
       (id, variant_id, attribute_id, value_text, normalized_value)
     VALUES ('delete-variant-attribute', 'delete-variant', 'delete-attribute-definition', 'مشکی', 'مشکی'),
            ('sibling-variant-attribute', 'sibling-variant', 'delete-attribute-definition', 'سفید', 'سفید')`,
  ).run();
  await d1.database.prepare(
    `INSERT INTO seller_offers
       (id, product_id, seller_application_id, seller_name, price_minor, stock_quantity)
     VALUES ('preserved-offer', ?, 'seller-1', 'فروشنده', 1100, 3)`,
  ).bind(product.id).run();
  await d1.database.prepare(
    `INSERT INTO orders (
       id, order_number, idempotency_key, customer_name, customer_email,
       customer_phone, address_line, city, postcode, delivery_method,
       currency, subtotal_minor, delivery_minor, total_minor
     ) VALUES ('variant-history-order', 'MS-VARIANT-HISTORY', 'variant-history-key',
       'مشتری', 'history@example.com', '09120000000', 'نشانی', 'تهران', '',
       'standard', 'IRR', 1200, 0, 1200)`,
  ).run();
  await d1.database.prepare(
    `INSERT INTO order_items (
       id, order_id, product_id, variant_id, slug, sku, title, quantity,
       unit_price_minor, line_total_minor
     ) VALUES ('variant-history-item', 'variant-history-order', ?, 'delete-variant', ?,
       'DELETE-VARIANT', 'تنوع تاریخی', 1, 1200, 1200)`,
  ).bind(product.id, product.slug).run();

  assert.deepEqual(
    await deleteAdminProductVariant(product.id, "delete-variant", "owner@example.com", d1.database),
    { deleted: true },
  );
  assert.equal(await d1.database.prepare("SELECT id FROM product_variants WHERE id = 'delete-variant'").first(), null);
  assert.equal(await d1.database.prepare("SELECT id FROM product_variant_attribute_values WHERE variant_id = 'delete-variant'").first(), null);
  assert.ok(await d1.database.prepare("SELECT id FROM product_variants WHERE id = 'sibling-variant'").first());
  assert.ok(await d1.database.prepare("SELECT id FROM product_variant_attribute_values WHERE variant_id = 'sibling-variant'").first());
  assert.ok(await d1.database.prepare("SELECT id FROM seller_offers WHERE id = 'preserved-offer'").first());
  assert.ok(await d1.database.prepare("SELECT id FROM order_items WHERE id = 'variant-history-item' AND variant_id = 'delete-variant'").first());
  assert.deepEqual(
    await d1.database.prepare("SELECT id, title, slug, price_minor, image_url, video_url FROM products WHERE id = ?").bind(product.id).first(),
    snapshot,
  );
  assert.equal((await d1.database.prepare(
    "SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = 'product.variant-deleted' AND subject_id = 'delete-variant'",
  ).first()).count, 1);
  await assert.rejects(
    deleteAdminProductVariant(product.id, "other-product-variant", "owner@example.com", d1.database),
    /VARIANT_NOT_FOUND/,
  );

  await d1.database.prepare(
    `INSERT INTO product_variants
       (id, product_id, title, sku, price_minor, stock_quantity, reserved_quantity)
     VALUES ('reserved-variant', ?, 'رزروشده', 'RESERVED-VARIANT', 1500, 3, 1)`,
  ).bind(product.id).run();
  await d1.database.prepare(
    `INSERT INTO product_variant_attribute_values
       (id, variant_id, attribute_id, value_text, normalized_value)
     VALUES ('reserved-variant-attribute', 'reserved-variant', 'delete-attribute-definition', 'قرمز', 'قرمز')`,
  ).run();
  await assert.rejects(
    deleteAdminProductVariant(product.id, "reserved-variant", "owner@example.com", d1.database),
    /VARIANT_RESERVED/,
  );
  assert.ok(await d1.database.prepare("SELECT id FROM product_variants WHERE id = 'reserved-variant'").first());
  assert.ok(await d1.database.prepare("SELECT id FROM product_variant_attribute_values WHERE variant_id = 'reserved-variant'").first());
  d1.close();
});

test("protects the dedicated variant deletion endpoint and refreshes after confirmed success", async () => {
  const [routeSource, pageSource, storeSource] = await Promise.all([
    readFile(new URL("../app/api/admin/product-variants/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../features/admin/admin-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/admin/admin-store.ts", import.meta.url), "utf8"),
  ]);
  assert.match(routeSource, /getAdminAccess\("catalog\.delete"\)/);
  assert.match(routeSource, /rejectCrossSiteMutation/);
  assert.match(routeSource, /declaredLength > 2_048/);
  assert.match(routeSource, /این تنوع در سفارش فعال رزرو شده است و تا آزادشدن رزرو قابل حذف نیست\./);
  assert.match(routeSource, /status: 409/);
  assert.match(pageSource, /فقط همین تنوع حذف می‌شود\. خود محصول، تصاویر، ویدیو، قیمت اصلی و سایر تنوع‌ها باقی می‌مانند\. ادامه می‌دهید؟/);
  assert.match(pageSource, /can\("catalog\.delete"\)[\s\S]*?حذف تنوع/);
  assert.match(pageSource, /await removeAdminProductVariant\(productId, variantId\);[\s\S]*?await loadAdminState\(\)/);
  assert.doesNotMatch(pageSource, /variantDelete-/);
  assert.match(storeSource, /fetch\("\/api\/admin\/product-variants"/);

  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/product-variants", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "product", variantId: "variant" }),
    }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 401);
});

test("keeps the ten-image gallery additive, deduplicated, previewed, ordered, and rollback-safe", async () => {
  const { MAX_PRODUCT_IMAGES, normalizeAdminState, isAdminState } = await import("../features/admin/admin-types.ts");
  const { productImageFileIdentity } = await import("../features/admin/product-image-optimizer.ts");
  assert.equal(MAX_PRODUCT_IMAGES, 10);
  assert.equal(
    productImageFileIdentity({ name: "a.webp", size: 12, lastModified: 34, type: "image/webp" }),
    productImageFileIdentity({ name: "a.webp", size: 12, lastModified: 34, type: "image/webp" }),
  );
  const d1 = await createD1TestDatabase();
  const { readStorefrontState } = await import("../db/admin-repository.ts");
  const state = await readStorefrontState(d1.database);
  const elevenImages = Array.from({ length: 11 }, (_, index) => `/media/products/00000000-0000-4000-8000-${String(index).padStart(12, "0")}.webp`);
  state.products[0].imageUrls = elevenImages;
  assert.equal(isAdminState(state), false);
  assert.equal(normalizeAdminState(state).products[0].imageUrls.length, 10);

  const [pageSource, css, repositorySource] = await Promise.all([
    readFile(new URL("../features/admin/admin-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/admin/admin.module.css", import.meta.url), "utf8"),
    readFile(new URL("../db/admin-repository.ts", import.meta.url), "utf8"),
  ]);
  assert.match(pageSource, /\[\.\.\.current, \.\.\.staged\]/);
  assert.match(pageSource, /productImageFileIdentity\(file\)/);
  assert.match(pageSource, /URL\.createObjectURL\(file\)/);
  assert.match(pageSource, /URL\.revokeObjectURL\(url\)/);
  assert.match(pageSource, /جدید \/ هنوز ذخیره نشده/);
  assert.match(pageSource, /پاک کردن تصاویر جدید/);
  assert.match(pageSource, /primaryProductImage[\s\S]*?imageUrls/);
  assert.match(pageSource, /for \(const item of files\)[\s\S]*?await optimizeProductImageForWeb[\s\S]*?await uploadMedia/);
  assert.doesNotMatch(pageSource, /Promise\.all\(files\.map/);
  assert.match(pageSource, /cleanupUploadedMedia\(pendingUploads\)/);
  assert.match(pageSource, /selectedProductVideo\.previewUrl/);
  assert.match(pageSource, /ویدئوی جایگزین؛ هنوز ذخیره نشده/);
  assert.match(css, /\.galleryEditor img[\s\S]*?object-fit: cover/);
  assert.match(repositorySource, /slice\(0, MAX_PRODUCT_IMAGES\)/);
  d1.close();
});

test("scopes product brands after category selection and groups catalog by category and brand", async () => {
  const pageSource = await readFile(new URL("../features/admin/admin-page.tsx", import.meta.url), "utf8");
  assert.ok(pageSource.indexOf("<label>دسته‌بندی") < pageSource.indexOf("<label>برند"));
  assert.match(pageSource, /disabled=\{!productCategorySelection\}/);
  assert.match(pageSource, /ابتدا دسته‌بندی را انتخاب کنید/);
  assert.match(pageSource, /availableProductBrands = productCategorySelection[\s\S]*?isCategoryWithin\(productCategorySelection, brand\.categorySlug\)/);
  assert.match(pageSource, /changedFromPersisted[\s\S]*?setProductBrandSelection\(""\)/);
  assert.match(pageSource, /categoryPathLabel\(category\.slug\)/);
  assert.match(pageSource, /groupedAdminProducts[\s\S]*?productCategoryGroup[\s\S]*?productBrandGroup/);
  assert.match(pageSource, /برند قدیمی \/ تعریف‌نشده/);
  assert.match(pageSource, /products\.length\.toLocaleString\("fa-IR"\).*محصول/);
});

test("tracks customer emails and removes store data only after orders are cleared", async () => {
  const {
    deleteCustomerStoreData,
    listAdminCustomers,
    upsertCustomerAccount,
  } = await import("../db/customer-account-repository.ts");
  const d1 = await createD1TestDatabase();
  await upsertCustomerAccount({
    authUserId: "auth-customer-1",
    email: "Customer@Example.com",
    fullName: "مشتری آزمایشی",
    emailConfirmedAt: "2026-08-24T10:00:00.000Z",
  }, d1.database);
  await d1.database.prepare(
    `INSERT INTO customer_addresses (
       id, owner_email, recipient_name, phone, address_line, city, province
     ) VALUES ('customer-address', 'customer@example.com', 'مشتری', '09120000000', 'نشانی', 'تهران', 'تهران')`,
  ).run();
  const customers = await listAdminCustomers(d1.database);
  assert.equal(customers.length, 1);
  assert.equal(customers[0].email, "customer@example.com");
  assert.equal(customers[0].addressCount, 1);
  await d1.database.prepare(
    `INSERT INTO orders (
       id, order_number, idempotency_key, status, payment_status,
       customer_name, customer_email, customer_phone, address_line, city,
       postcode, delivery_method, currency, subtotal_minor, delivery_minor, total_minor
     ) VALUES ('customer-order', 'MS-CUSTOMER', 'customer-order-key', 'cancelled', 'failed',
       'مشتری', 'customer@example.com', '09120000000', 'نشانی', 'تهران', '',
       'standard', 'IRR', 1000, 0, 1000)`,
  ).run();
  await assert.rejects(
    deleteCustomerStoreData("customer@example.com", "owner@example.com", d1.database),
    /CUSTOMER_HAS_ORDERS/,
  );
  await d1.database.prepare("DELETE FROM orders WHERE id = 'customer-order'").run();
  await deleteCustomerStoreData("customer@example.com", "owner@example.com", d1.database);
  assert.equal((await d1.database.prepare("SELECT COUNT(*) AS count FROM customer_accounts").first()).count, 0);
  assert.equal((await d1.database.prepare("SELECT COUNT(*) AS count FROM customer_addresses").first()).count, 0);
  d1.close();
});

test("deletes an order with dependent rows and safely releases reserved inventory", async () => {
  const { deleteOrderRecord } = await import("../db/order-repository.ts");
  const d1 = await createD1TestDatabase();
  const product = await d1.database.prepare(
    "SELECT id, slug, sku, title, price_minor FROM products ORDER BY rowid ASC LIMIT 1",
  ).first();
  await d1.database.prepare("UPDATE products SET reserved_quantity = 1 WHERE id = ?").bind(product.id).run();
  await d1.database.prepare(
    `INSERT INTO orders (
       id, order_number, idempotency_key, status, payment_status,
       reservation_expires_at, customer_name, customer_email, customer_phone,
       address_line, city, postcode, delivery_method, currency,
       subtotal_minor, delivery_minor, total_minor
     ) VALUES ('delete-order', 'MS-DELETE', 'delete-order-key', 'new', 'pending',
       '2099-01-01T00:00:00.000Z', 'مشتری', 'delete@example.com', '09120000000',
       'نشانی', 'تهران', '', 'standard', 'IRR', ?, 0, ?)`,
  ).bind(product.price_minor, product.price_minor).run();
  await d1.database.prepare(
    `INSERT INTO order_items (
       id, order_id, product_id, slug, sku, title, quantity,
       unit_price_minor, line_total_minor
     ) VALUES ('delete-item', 'delete-order', ?, ?, ?, ?, 1, ?, ?)`,
  ).bind(product.id, product.slug, product.sku, product.title, product.price_minor, product.price_minor).run();
  await d1.database.prepare(
    "INSERT INTO payment_attempts (id, order_id, provider, status, amount_minor) VALUES ('delete-attempt', 'delete-order', 'zarinpal', 'failed', ?)",
  ).bind(product.price_minor).run();
  await d1.database.prepare(
    `INSERT INTO support_tickets (
       id, ticket_number, customer_email, customer_name, order_id, subject
     ) VALUES ('delete-ticket', 'T-DELETE', 'delete@example.com', 'مشتری', 'delete-order', 'پیگیری')`,
  ).run();
  await d1.database.prepare(
    `INSERT INTO orders (
       id, order_number, idempotency_key, status, payment_status,
       reservation_expires_at, customer_name, customer_email, customer_phone,
       address_line, city, postcode, delivery_method, currency,
       subtotal_minor, delivery_minor, total_minor
     ) VALUES ('unrelated-expired', 'MS-UNRELATED', 'unrelated-expired-key', 'new', 'pending',
       '2020-01-01T00:00:00.000Z', 'مشتری دیگر', 'other@example.com', '09120000001',
       'نشانی', 'تهران', '', 'standard', 'IRR', 1000, 0, 1000)`,
  ).run();
  await deleteOrderRecord("delete-order", "owner@example.com", d1.database);
  assert.equal(await d1.database.prepare("SELECT id FROM orders WHERE id = 'delete-order'").first(), null);
  assert.equal(await d1.database.prepare("SELECT id FROM order_items WHERE order_id = 'delete-order'").first(), null);
  assert.equal(await d1.database.prepare("SELECT id FROM payment_attempts WHERE order_id = 'delete-order'").first(), null);
  assert.equal((await d1.database.prepare("SELECT order_id FROM support_tickets WHERE id = 'delete-ticket'").first()).order_id, "");
  assert.equal((await d1.database.prepare("SELECT reserved_quantity FROM products WHERE id = ?").bind(product.id).first()).reserved_quantity, 0);
  assert.equal((await d1.database.prepare("SELECT status FROM orders WHERE id = 'unrelated-expired'").first()).status, "new");
  d1.close();
});

test("lets authorized management edit and delete sellers without leaving offers", async () => {
  const {
    deleteSellerApplicationRecord,
    updateSellerApplicationRecord,
  } = await import("../db/admin-repository.ts");
  const d1 = await createD1TestDatabase();
  await d1.database.prepare(
    `INSERT INTO seller_applications (
       id, store_name, contact_name, email, phone, category, legal_type,
       address, guarantee_type, documents_json
     ) VALUES ('seller-delete', 'قدیمی', 'نام قدیمی', 'old@example.com', '09120000000',
       'home', 'individual', 'نشانی قدیمی', 'review_later', '[]')`,
  ).run();
  const product = await d1.database.prepare("SELECT id FROM products ORDER BY rowid ASC LIMIT 1").first();
  await d1.database.prepare(
    `INSERT INTO seller_offers (
       id, product_id, seller_application_id, seller_name, price_minor
     ) VALUES ('seller-delete-offer', ?, 'seller-delete', 'قدیمی', 1000)`,
  ).bind(product.id).run();
  await updateSellerApplicationRecord("seller-delete", {
    storeName: "فروشگاه جدید",
    contactName: "مدیر جدید",
    email: "new@example.com",
    phone: "09121111111",
    category: "home",
    legalType: "individual",
    registrationNumber: "",
    address: "نشانی جدید",
    notes: "ویرایش‌شده",
    status: "reviewing",
    documentStatus: "submitted",
    guaranteeStatus: "requested",
    agreementStatus: "sent",
    guaranteeType: "review_later",
    guaranteeAmountMinor: 0,
    adminNotes: "یادداشت",
  }, "owner@example.com", d1.database);
  const edited = await d1.database.prepare("SELECT store_name, email, status FROM seller_applications WHERE id = 'seller-delete'").first();
  assert.deepEqual({ ...edited }, { store_name: "فروشگاه جدید", email: "new@example.com", status: "reviewing" });
  await deleteSellerApplicationRecord("seller-delete", "owner@example.com", d1.database);
  assert.equal(await d1.database.prepare("SELECT id FROM seller_applications WHERE id = 'seller-delete'").first(), null);
  assert.equal(await d1.database.prepare("SELECT id FROM seller_offers WHERE seller_application_id = 'seller-delete'").first(), null);
  d1.close();
});

test("deletes complete support conversations and product reviews", async () => {
  const {
    createSupportTicket,
    deleteAdminSupportTicket,
  } = await import("../db/customer-care-repository.ts");
  const { deleteProductReview } = await import("../db/review-repository.ts");
  const d1 = await createD1TestDatabase();
  const ticket = await createSupportTicket({
    customerEmail: "remove@example.com",
    customerName: "مشتری",
    subject: "حذف شود",
    category: "other",
    orderNumber: "",
    body: "این پیام برای آزمون حذف کامل تیکت است.",
  }, d1.database);
  await deleteAdminSupportTicket(ticket.id, "owner@example.com", d1.database);
  assert.equal(await d1.database.prepare("SELECT id FROM support_tickets WHERE id = ?").bind(ticket.id).first(), null);
  assert.equal(await d1.database.prepare("SELECT id FROM support_messages WHERE ticket_id = ?").bind(ticket.id).first(), null);
  const product = await d1.database.prepare("SELECT id FROM products ORDER BY rowid ASC LIMIT 1").first();
  await d1.database.prepare(
    `INSERT INTO product_reviews (
       id, product_id, customer_email, customer_name, order_id, rating, body
     ) VALUES ('review-delete', ?, 'remove@example.com', 'مشتری', 'old-order', 4, 'دیدگاه آزمایشی برای حذف')`,
  ).bind(product.id).run();
  await deleteProductReview("review-delete", "owner@example.com", d1.database);
  assert.equal(await d1.database.prepare("SELECT id FROM product_reviews WHERE id = 'review-delete'").first(), null);
  d1.close();
});

test("enforces D1 rate limits without storing the raw identity", async () => {
  const { consumeRateLimit } = await import("../db/rate-limit-repository.ts");
  const d1 = await createD1TestDatabase();
  const input = {
    scope: "order.create",
    identity: "Sensitive.Customer@Example.com",
    limit: 2,
    windowSeconds: 60,
    now: Date.parse("2026-08-21T12:00:00.000Z"),
  };
  assert.equal((await consumeRateLimit(input, d1.database)).allowed, true);
  assert.equal((await consumeRateLimit(input, d1.database)).allowed, true);
  const blocked = await consumeRateLimit(input, d1.database);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  const stored = await d1.database.prepare(
    "SELECT identity_hash, hit_count, blocked_count FROM request_rate_limits",
  ).first();
  assert.equal(stored.hit_count, 3);
  assert.equal(stored.blocked_count, 1);
  assert.equal(stored.identity_hash.length, 64);
  assert.doesNotMatch(stored.identity_hash, /customer|example/i);
  assert.equal((await consumeRateLimit({ ...input, now: input.now + 60_000 }, d1.database)).allowed, true);
  d1.close();
});

test("builds operational reports from paid IRR orders without exposing PII", async () => {
  const { getOperationalReport } = await import("../db/reporting-repository.ts");
  const d1 = await createD1TestDatabase();
  const baseline = await getOperationalReport(5, d1.database);
  const product = await d1.database.prepare(
    "SELECT id, slug, sku, title FROM products ORDER BY rowid ASC LIMIT 1",
  ).first();
  await d1.database.prepare(
    `INSERT INTO orders (
       id, order_number, idempotency_key, status, payment_status,
       customer_name, customer_email, customer_phone, address_line, city,
       postcode, delivery_method, currency, subtotal_minor, delivery_minor, total_minor
     ) VALUES (?, ?, ?, 'confirmed', 'paid', ?, ?, ?, ?, ?, ?, ?, 'IRR', ?, 0, ?)`,
  ).bind(
    "report-order", "MS-REPORT", "report-key", "مشتری گزارش", "report-customer@example.com",
    "09120000000", "نشانی محرمانه", "تهران", "", "standard", 1_250_000, 1_250_000,
  ).run();
  await d1.database.prepare(
    `INSERT INTO order_items (
       id, order_id, product_id, slug, sku, title, quantity,
       unit_price_minor, line_total_minor
     ) VALUES (?, ?, ?, ?, ?, ?, 2, ?, ?)`,
  ).bind(
    "report-item", "report-order", product.id, product.slug, product.sku,
    product.title, 625_000, 1_250_000,
  ).run();
  const report = await getOperationalReport(5, d1.database);
  assert.equal(report.commerce.totalOrders, baseline.commerce.totalOrders + 1);
  assert.equal(report.commerce.paidOrders, baseline.commerce.paidOrders + 1);
  assert.equal(report.commerce.paidRevenueRial, baseline.commerce.paidRevenueRial + 1_250_000);
  assert.equal(report.commerce.paidUnits, baseline.commerce.paidUnits + 2);
  assert.ok(report.topProducts.some((item) => item.productId === product.id && item.quantity >= 2));
  assert.doesNotMatch(JSON.stringify(report), /report-customer|نشانی محرمانه|09120000000/i);
  d1.close();
});

test("keeps operational reports private", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/admin/reports"),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 401);
});

test("rejects oversized admin uploads before multipart parsing", async () => {
  const source = await readFile(
    new URL("../app/api/admin/upload/route.ts", import.meta.url),
    "utf8",
  );
  const sizeGuard = source.indexOf("declaredLength > 26_000_000");
  const multipartParsing = source.indexOf("request.formData()");
  assert.ok(sizeGuard >= 0);
  assert.ok(multipartParsing > sizeGuard);
});

test("adds and rolls back the product foundation without changing existing products or slugs", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(":memory:");
  const migrations = [
    "0000_breezy_bastion.sql",
    "0001_big_masked_marvel.sql",
    "0002_previous_alice.sql",
    "0003_organic_amazoness.sql",
    "0004_foamy_violations.sql",
    "0005_cool_gambit.sql",
    "0006_furry_skreet.sql",
    "0007_slim_karen_page.sql",
    "0008_furry_gamma_corps.sql",
    "0009_square_magneto.sql",
    "0010_parched_eddie_brock.sql",
    "0011_lucky_vapor.sql",
    "0012_dark_blade.sql",
    "0013_steep_clint_barton.sql",
    "0014_brave_ronan.sql",
    "0015_silent_kingpin.sql",
  ];
  for (const file of migrations) {
    const sql = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) database.exec(statement);
    }
  }
  const before = database.prepare("SELECT id, slug FROM products ORDER BY id").all();
  const migration = await readFile(
    new URL("../drizzle/0016_famous_red_skull.sql", import.meta.url),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  assert.deepEqual(database.prepare("SELECT id, slug FROM products ORDER BY id").all(), before);
  const columns = database.prepare("PRAGMA table_info('products')").all();
  assert.equal(columns.find((column) => column.name === "english_title")?.notnull, 0);
  assert.equal(columns.find((column) => column.name === "short_description")?.notnull, 0);
  for (const table of [
    "catalog_attribute_definitions",
    "product_attribute_values",
    "product_variant_attribute_values",
    "product_questions",
    "product_price_history",
  ]) {
    assert.equal(database.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table).count, 1);
  }
  const rollback = await readFile(
    new URL("../db/rollback/0016_famous_red_skull.down.sql", import.meta.url),
    "utf8",
  );
  for (const statement of rollback.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  assert.deepEqual(database.prepare("SELECT id, slug FROM products ORDER BY id").all(), before);
  const rolledBackColumns = database.prepare("PRAGMA table_info('products')").all();
  assert.equal(rolledBackColumns.some((column) => column.name === "english_title"), false);
  assert.equal(rolledBackColumns.some((column) => column.name === "short_description"), false);
  database.close();
});

test("round-trips nullable copy and queryable product and variant attributes", async () => {
  const { readStorefrontState, writeStorefrontState } = await import(
    "../db/admin-repository.ts"
  );
  const d1 = await createD1TestDatabase();
  const state = await readStorefrontState(d1.database);
  const product = state.products[0];
  assert.ok(product);
  product.englishTitle = null;
  product.shortDescription = null;
  product.attributes = [{
    id: `attribute-value-${product.id}-weight`,
    definitionId: `attribute-definition-${product.category}-weight`,
    code: "weight_grams",
    label: "وزن",
    dataType: "number",
    unit: "گرم",
    value: "250",
    filterable: true,
    searchable: true,
    comparable: true,
    keyFeature: true,
    sortOrder: 0,
  }];
  if (product.variants[0]) {
    product.variants[0].attributes = [{
      id: `variant-attribute-${product.variants[0].id}-weight`,
      definitionId: product.attributes[0].definitionId,
      code: "weight_grams",
      label: "وزن",
      dataType: "number",
      unit: "گرم",
      value: "250",
      filterable: true,
      searchable: true,
      comparable: true,
    }];
  }
  await writeStorefrontState(state, "owner@example.com", d1.database);
  const persisted = await readStorefrontState(d1.database);
  const saved = persisted.products.find((item) => item.id === product.id);
  assert.equal(saved?.englishTitle, null);
  assert.equal(saved?.shortDescription, null);
  assert.deepEqual(saved?.attributes, product.attributes);
  const queryable = await d1.database.prepare(
    `SELECT product.id, definition.code, value.value_number,
            definition.filterable, definition.searchable, definition.comparable
       FROM product_attribute_values AS value
       JOIN catalog_attribute_definitions AS definition
         ON definition.id = value.attribute_id
       JOIN products AS product ON product.id = value.product_id
      WHERE definition.category_slug = ?
        AND definition.code = 'weight_grams'
        AND value.value_number = 250
        AND value.visible = 1`,
  ).bind(product.category).first();
  assert.deepEqual({ ...queryable }, {
    id: product.id,
    code: "weight_grams",
    value_number: 250,
    filterable: 1,
    searchable: 1,
    comparable: 1,
  });
  d1.close();
});

test("records IRR price history only when a real source price changes", async () => {
  const { readStorefrontState, writeStorefrontState } = await import(
    "../db/admin-repository.ts"
  );
  const { listProductPriceHistory } = await import(
    "../db/product-page-repository.ts"
  );
  const d1 = await createD1TestDatabase();
  let state = await readStorefrontState(d1.database);
  const productId = state.products[0].id;
  await writeStorefrontState(state, "owner@example.com", d1.database);
  assert.equal((await listProductPriceHistory(productId, 100, d1.database)).length, 0);
  state = await readStorefrontState(d1.database);
  const product = state.products.find((item) => item.id === productId);
  const previousPrice = product.priceMinor;
  product.priceMinor += 10_000;
  await writeStorefrontState(state, "owner@example.com", d1.database);
  const history = await listProductPriceHistory(productId, 100, d1.database);
  assert.equal(history.length, 1);
  assert.deepEqual({
    sourceType: history[0].sourceType,
    sourceId: history[0].sourceId,
    previousPriceMinor: history[0].previousPriceMinor,
    newPriceMinor: history[0].newPriceMinor,
    currency: history[0].currency,
  }, {
    sourceType: "product",
    sourceId: productId,
    previousPriceMinor: previousPrice,
    newPriceMinor: previousPrice + 10_000,
    currency: "IRR",
  });
  const stored = await d1.database.prepare(
    "SELECT changed_by, changed_at FROM product_price_history WHERE id = ?",
  ).bind(history[0].id).first();
  assert.equal(stored.changed_by, "owner@example.com");
  assert.ok(Number.isFinite(Date.parse(stored.changed_at)));
  await writeStorefrontState(
    await readStorefrontState(d1.database),
    "owner@example.com",
    d1.database,
  );
  assert.equal((await listProductPriceHistory(productId, 100, d1.database)).length, 1);
  d1.close();
});

test("computes rating, review count, and question count from moderated records", async () => {
  const { getProductEngagementSummary } = await import(
    "../db/product-page-repository.ts"
  );
  const d1 = await createD1TestDatabase();
  const product = await d1.database.prepare("SELECT id FROM products ORDER BY rowid LIMIT 1").first();
  for (const [id, rating, status] of [
    ["engagement-review-1", 4, "approved"],
    ["engagement-review-2", 5, "approved"],
    ["engagement-review-3", 1, "pending"],
  ]) {
    await d1.database.prepare(
      `INSERT INTO product_reviews (
         id, product_id, customer_email, customer_name, order_id,
         rating, body, status
       ) VALUES (?, ?, ?, 'مشتری', '', ?, 'دیدگاه واقعی آزمون', ?)`,
    ).bind(id, product.id, `${id}@example.com`, rating, status).run();
  }
  await d1.database.prepare(
    `INSERT INTO product_questions (
       id, product_id, customer_email, customer_name, body, status
     ) VALUES
       ('question-published', ?, 'one@example.com', 'مشتری', 'پرسش منتشرشده', 'published'),
       ('question-pending', ?, 'two@example.com', 'مشتری', 'پرسش در انتظار', 'pending')`,
  ).bind(product.id, product.id).run();
  assert.deepEqual(
    await getProductEngagementSummary(product.id, d1.database),
    { ratingAverage: 4.5, reviewCount: 2, questionCount: 1 },
  );
  const productColumns = await d1.database.prepare("PRAGMA table_info('products')").all();
  assert.equal(productColumns.results.some((column) => /rating|review_count/.test(column.name)), false);
  d1.close();
});

test("uses local MIRAN fonts without an internet or previous-cache dependency", async () => {
  const [fontSource, layoutSource, foundationCss, baseCss, adminSource, vazirmatnBytes, estedadBytes] = await Promise.all([
    readFile(new URL("../lib/fonts.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ui/styles/foundation.css", import.meta.url), "utf8"),
    readFile(new URL("../components/ui/styles/base.css", import.meta.url), "utf8"),
    readFile(new URL("../features/admin/admin-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/fonts/vazirmatn-variable.woff2", import.meta.url)),
    readFile(new URL("../public/fonts/estedad-semibold.woff2", import.meta.url)),
  ]);
  assert.equal(vazirmatnBytes.subarray(0, 4).toString("ascii"), "wOF2");
  assert.equal(estedadBytes.subarray(0, 4).toString("ascii"), "wOF2");
  assert.doesNotMatch(fontSource, /next\/font\/google|fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(fontSource, /vazirmatn-variable\.woff2[\s\S]*weight: "100 900"/);
  assert.match(fontSource, /estedad-semibold\.woff2[\s\S]*weight: "600"/);
  assert.match(layoutSource, /className=\{`\$\{vazirmatn\.variable\} \$\{estedad\.variable\}`\}/);
  assert.match(foundationCss, /--miran-font-sans: var\(--font-vazirmatn\)/);
  assert.match(foundationCss, /--miran-font-heading: var\(--font-estedad\)/);
  assert.match(baseCss, /button,input,textarea,select\{font:inherit\}/);
  assert.match(baseCss, /h1,h2\{font-family:var\(--miran-font-heading\)\}/);
  assert.doesNotMatch(`${fontSource}${layoutSource}${foundationCss}${baseCss}`, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(adminSource, /عنوان انگلیسی \(اختیاری\)/);
  assert.match(adminSource, /توضیح کوتاه \(اختیاری\)/);
  assert.match(adminSource, /ویژگی‌های ساختاریافته محصول/);
});

test("does not expose mock catalog data when the production database is unavailable", async () => {
  globalThis[mockStorefrontOverride] = false;
  try {
    const worker = await loadWorker();
    const env = {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    };
    const context = { waitUntil() {}, passThroughOnException() {} };
    const apiResponse = await worker.fetch(
      new Request("https://almiran.ir/api/storefront"),
      env,
      context,
    );
    assert.equal(apiResponse.status, 503);
    assert.equal(apiResponse.headers.get("retry-after"), "30");
    const apiBody = await apiResponse.text();
    assert.match(apiBody, /موقتاً در دسترس نیست/);
    assert.doesNotMatch(apiBody, /Nova|Sonic|Orbit|mock/i);

    const pageResponse = await worker.fetch(
      new Request("https://almiran.ir/product/nova-128", {
        headers: { accept: "text/html" },
      }),
      env,
      context,
    );
    const pageHtml = await pageResponse.text();
    assert.match(pageHtml, /بارگذاری صفحه ممکن نشد/);
    assert.doesNotMatch(pageHtml, /Nova 128GB|24,999|Sonic One/);
  } finally {
    globalThis[mockStorefrontOverride] = true;
  }
});

test("fails closed when auth rate-limit storage is unavailable", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("https://almiran.ir/api/auth", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://almiran.ir",
      },
      body: JSON.stringify({
        action: "login",
        email: "customer@example.com",
        password: "Miran#2026Secure",
      }),
    }),
    {},
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.match(await response.text(), /سامانهٔ امنیتی ورود موقتاً در دسترس نیست/);
});

test("rate-limits signup email abuse without limiting normal storefront browsing", async () => {
  const d1 = await createD1TestDatabase();
  const { rateLimitCustomerAuth } = await import(
    "../lib/customer-auth-rate-limit.ts"
  );
  assert.equal((await d1.database.prepare(
    "SELECT COUNT(*) AS count FROM request_rate_limits",
  ).first()).count, 0);

  const statuses = [];
  let finalResponse;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    finalResponse = await rateLimitCustomerAuth(
      new Request("https://almiran.ir/api/auth", {
        headers: { "cf-connecting-ip": "203.0.113.9" },
      }),
      "signup",
      "rate-test@example.com",
      d1.database,
    );
    statuses.push(finalResponse?.status ?? 0);
  }
  assert.deepEqual(statuses, [0, 0, 0, 429]);
  assert.ok(Number(finalResponse.headers.get("retry-after")) > 0);
  assert.match(await finalResponse.text(), /تعداد درخواست‌ها بیش از حد مجاز/);
  assert.ok((await d1.database.prepare(
    "SELECT COUNT(*) AS count FROM request_rate_limits WHERE scope = 'auth.signup'",
  ).first()).count >= 2);
  d1.close();
});

test("keeps auth logs free of tokens, cookies, secrets, and full emails", async () => {
  const [routeSource, proxySource] = await Promise.all([
    readFile(new URL("../app/api/auth/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
  ]);
  const logCalls = `${routeSource}\n${proxySource}`.match(/console\.(?:error|warn|log)\([^;]+/g) ?? [];
  for (const call of logCalls) {
    assert.doesNotMatch(call, /accessToken|refreshToken|cookie|email|password|secret/i);
  }
  assert.match(proxySource, /refreshCustomerSession\(config, refreshToken\)/);
  assert.doesNotMatch(proxySource, /while\s*\(|setInterval|setTimeout/);
});
