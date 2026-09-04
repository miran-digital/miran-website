import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createD1Database } from "./helpers/d1.mjs";
import { paymentProviderCatalog, findPaymentProvider, validCredential, availablePaymentProviders } from "../lib/payments/provider-catalog.ts";
import { getPaymentAdapter } from "../lib/payments/provider-registry.ts";
import { zarinpalAdapter, ZARINPAL_ENDPOINTS } from "../lib/payments/adapters/zarinpal.ts";
import { PaymentProviderError, getPaymentProviderUserMessage } from "../lib/payments/provider-errors.ts";
import { signPaymentCallback, verifyPaymentCallback } from "../lib/payments/callback-integrity.ts";
import { listPaymentProviderAdminConfigs, savePaymentProviderConfiguration, readPaymentProviderRuntimeConfig, readZarinpalVaultConfig, auditPaymentProviderHealth } from "../lib/payment-provider-config.ts";
import { createPaymentSession } from "../lib/payments/payment-service.ts";
import { handlePaymentCallback } from "../lib/payments/payment-callback.ts";
import { readPaymentRequestText, readPaymentRequestJson } from "../lib/payments/request-body.ts";
import { createOrderRecord, getOrderByNumberForPayment, getReusablePendingPaymentAttempt, recordPaymentAttempt, updatePaymentAuthority, failPaymentAttemptById, getPaymentAttemptForCallback, completePayment, getOwnedOrderPaymentSummary } from "../db/order-repository.ts";
import { hasPendingBankTransferReceipt, createBankTransferReceipt } from "../db/bank-transfer-repository.ts";

// Synthetic fixtures only. Never use a production merchant, encryption key or payment.
const MERCHANT = "11111111-1111-1111-1111-111111114821";
const SECOND_MERCHANT = "22222222-2222-2222-2222-222222224821";
const KEY = Buffer.alloc(32, 17).toString("base64");
const AUTHORITY = "A" + "1".repeat(35);
const SECOND_AUTHORITY = "A" + "2".repeat(35);
const readSource = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const configInput = (extra = {}) => ({ provider: "zarinpal", actorEmail: "owner@example.test", enabled: true, sandbox: false, credentials: { merchantId: MERCHANT }, ...extra });

test("V57 payment input bounds reject oversized chunked bodies before reading the rest", async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(1024)); },
    cancel() { cancelled = true; },
  });
  const request = new Request("https://store.example.test/api/payments/session", { method: "POST", body, duplex: "half" });
  assert.equal(await readPaymentRequestText(request, 2048), null);
  assert.equal(cancelled, true);
  assert.ok(pulls <= 4, "Stop after the first over-limit chunk; do not drain the body");
});

test("V57 payment input bounds count UTF-8 bytes and preserve a split Persian character", async () => {
  const bytes = new TextEncoder().encode('{"title":"سلام"}');
  const request = () => new Request("https://store.example.test/", { method: "POST", duplex: "half", body: new ReadableStream({
    start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); },
  }) });
  assert.deepEqual(await readPaymentRequestJson(request(), bytes.length), { title: "سلام" });
  assert.equal(await readPaymentRequestJson(request(), bytes.length - 1), null);
});

test("V57 payment input bounds reject invalid lengths, JSON and UTF-8 without leaking body contents", async () => {
  for (const length of ["99999", "-1", "NaN"]) {
    const request = new Request("https://store.example.test/", { method: "POST", headers: { "content-length": length }, body: "{}" });
    assert.equal(await readPaymentRequestJson(request, 2048), null);
    assert.equal(request.bodyUsed, false);
  }
  assert.equal(await readPaymentRequestJson(new Request("https://store.example.test/", { method: "POST", body: "private invalid JSON" }), 2048), null);
  assert.equal(await readPaymentRequestText(new Request("https://store.example.test/", { method: "POST", body: new Uint8Array([0xff]) }), 2048), null);
});

test("V57 payment callback rejects oversized POST before looking up any payment", async () => {
  const response = await handlePaymentCallback(new Request("https://store.example.test/api/payments/zarinpal/callback", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "x=" + "x".repeat(4096),
  }), "zarinpal", { getAdapter() { assert.fail("Oversized input must not reach the provider"); } });
  assert.equal(new URL(response.headers.get("location")).searchParams.get("status"), "invalid");
});

async function database(t) {
  const d1 = await createD1Database();
  // Serialize transactions as D1 does; do not interleave two SQLite BEGINs in tests.
  const batch = d1.database.batch;
  let tail = Promise.resolve();
  d1.database.batch = (statements) => {
    const pending = tail.then(() => batch(statements));
    tail = pending.catch(() => undefined);
    return pending;
  };
  t.after(() => d1.close());
  return d1;
}

async function fixture(t) {
  const d1 = await database(t);
  const db = d1.database;
  await savePaymentProviderConfiguration(configInput({ mode: "add", priority: 10 }), db, KEY);
  const product = d1.sqlite.prepare("SELECT id, slug, title FROM products LIMIT 1").get();
  d1.sqlite.prepare("UPDATE products SET visible = 1, stock_quantity = 10, reserved_quantity = 0 WHERE id = ?").run(product.id);
  const order = await createOrderRecord({
    idempotencyKey: crypto.randomUUID(), customerName: "Synthetic Buyer", customerEmail: "buyer@example.test", customerPhone: "09120000000",
    addressSourceId: "test-address", addressLabel: "خانه", addressLine: "نشانی آزمایشی", city: "تهران", province: "تهران", postcode: "", latitude: null, longitude: null,
    deliveryMethod: "standard", currency: "IRR", deliveryMinor: 0, reservationMinutes: 30,
    lines: [{ productId: product.id, variantId: "", sellerOfferId: "", selectionLabel: "", slug: product.slug, sku: "TEST", title: product.title, quantity: 1, unitPriceMinor: 1000 }],
  }, db);
  const dependencies = {
    getOrder: (number, email) => getOrderByNumberForPayment(number, email, db),
    hasReceipt: (id) => hasPendingBankTransferReceipt(id, db),
    getPending: (id) => getReusablePendingPaymentAttempt(id, db),
    recordAttempt: (input) => recordPaymentAttempt(input, db),
    updateAuthority: (id, authority) => updatePaymentAuthority(id, authority, db),
    failAttempt: (id) => failPaymentAttemptById(id, db),
    getConfig: (provider, options = {}) => readPaymentProviderRuntimeConfig(provider, options, db, KEY),
    getAdapter: getPaymentAdapter,
  };
  const callbacks = {
    getAttempt: (authority, _db, provider) => getPaymentAttemptForCallback(authority, db, provider),
    getConfig: dependencies.getConfig, getAdapter: getPaymentAdapter,
    complete: (input) => completePayment(input, db), failAttempt: dependencies.failAttempt,
  };
  const input = { provider: "zarinpal", orderNumber: order.orderNumber, customerEmail: order.customerEmail, origin: "https://store.example.test" };
  return { ...d1, db, product, order, dependencies, callbacks, input };
}

function mockProvider(t, { verifyFailure = false, createFailure = false } = {}) {
  const requests = [];
  let verifications = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, body, options });
    if (url.endsWith("/payment/request.json")) {
      if (createFailure) throw new Error("PRIVATE_NETWORK_BODY " + MERCHANT);
      return Response.json({ data: { code: 100, authority: AUTHORITY } });
    }
    if (url.endsWith("/payment/verify.json")) {
      if (verifyFailure) throw new Error("PRIVATE_NETWORK_BODY " + MERCHANT);
      verifications++;
      return Response.json({ data: { code: verifications === 1 ? 100 : 101, ref_id: 123456789 } });
    }
    throw new Error("Unexpected test network URL");
  });
  return requests;
}

async function started(t, options) {
  const f = await fixture(t);
  const requests = mockProvider(t, options);
  const result = await createPaymentSession(f.input, f.dependencies);
  const callback = new URL(requests[0].body.callback_url);
  callback.searchParams.set("Authority", result.authority); callback.searchParams.set("Status", "OK");
  const attempt = await getPaymentAttemptForCallback(result.authority, f.db);
  return { ...f, requests, result, callback, attempt };
}

function settleInput(f, extra = {}) {
  return { attemptId: f.attempt.id, orderId: f.order.id, provider: "zarinpal", authority: AUTHORITY, amountMinor: 1000, currency: "IRR", providerReference: "123456789", ...extra };
}

test("V57 registry exposes eight PSP definitions and registers no fake adapter", () => {
  assert.equal(paymentProviderCatalog.length, 8);
  assert.equal(new Set(paymentProviderCatalog.map((item) => item.id)).size, 8);
  assert.equal(getPaymentAdapter("zarinpal").id, "zarinpal");
  for (const provider of paymentProviderCatalog.filter((item) => item.id !== "zarinpal")) {
    assert.equal(provider.integration, "not-integrated"); assert.equal(provider.credentialSchema.verified, false);
    assert.deepEqual(provider.credentialSchema.fields, []);
    assert.throws(() => getPaymentAdapter(provider.id), /NOT_INTEGRATED/);
  }
  assert.equal(findPaymentProvider("__proto__"), undefined);
  assert.throws(() => getPaymentAdapter("constructor"), /NOT_INTEGRATED/);
  assert.equal(zarinpalAdapter.refund, undefined);
});

test("V57 verified schemas drive credential validation and dynamic accessible fields", async () => {
  const field = findPaymentProvider("zarinpal").credentialSchema.fields[0];
  assert.deepEqual(field, { name: "merchantId", label: "شناسه پذیرنده زرین‌پال", type: "password", required: true, secret: true, validation: "uuid", maxLength: 36 });
  assert.equal(validCredential(field, MERCHANT), true);
  for (const value of ["", "-".repeat(36), "x".repeat(36), MERCHANT + "x"]) assert.equal(validCredential(field, value), false);
  const component = await readSource("features/admin/payment-gateway-settings.tsx");
  assert.match(component, /definition\.credentialSchema\.fields\.map/);
  assert.match(component, /maxLength=\{field.maxLength\}/);
  assert.match(component, /aria-invalid=\{fieldError === field.name/);
  assert.match(component, /autoComplete=\{field.secret \? "new-password"/);
  assert.match(component, /form.reset\(\); setEditor\(null\)/);
  assert.doesNotMatch(component, /name="(?:merchantId|terminalId|password)"/);
});

test("V57 adding and editing a provider preserves encrypted values and priority", async (t) => {
  const d1 = await database(t);
  const added = await savePaymentProviderConfiguration(configInput({ mode: "add", enabled: false, priority: 20 }), d1.database, KEY);
  assert.equal(added.added, true); assert.equal(added.configured, true); assert.equal(added.enabled, false); assert.equal(added.priority, 20);
  assert.equal(added.credentialHints.merchantId, "••••4821");
  const stored = d1.sqlite.prepare("SELECT * FROM payment_provider_configs").get();
  assert.ok(stored.credentials_ciphertext); assert.doesNotMatch(JSON.stringify(stored), new RegExp(MERCHANT));
  const edited = await savePaymentProviderConfiguration({ provider: "zarinpal", priority: 5, credentials: { merchantId: "" }, actorEmail: "owner@example.test", mode: "update" }, d1.database, KEY);
  assert.equal(edited.priority, 5); assert.equal(edited.configured, true);
  assert.equal((await readPaymentProviderRuntimeConfig("zarinpal", { forVerification: true }, d1.database, KEY)).credentials.merchantId, MERCHANT);
  await assert.rejects(savePaymentProviderConfiguration(configInput({ mode: "add" }), d1.database, KEY), /PROVIDER_EXISTS/);
});

test("V57 required, unknown and oversized fields are rejected before storing secrets", async (t) => {
  const { database: db, sqlite } = await database(t);
  for (const input of [configInput({ credentials: {} }), configInput({ credentials: { merchantId: "bad" } }),
    configInput({ credentials: { merchantId: MERCHANT + "x" } }), configInput({ credentials: { terminalId: "wrong-provider-field" } }),
    configInput({ credentials: JSON.parse('{"__proto__":"bad"}') }), configInput({ priority: -1 }), configInput({ priority: 1.5 }), configInput({ priority: 1000 })]) {
    await assert.rejects(savePaymentProviderConfiguration({ ...input, mode: "add" }, db, KEY), /PAYMENT_/);
  }
  assert.equal(sqlite.prepare("SELECT count(*) n FROM payment_provider_configs").get().n, 0);
});

test("V57 enabling requires a real adapter and valid credentials; disabling preserves the vault", async (t) => {
  const { database: db, sqlite } = await database(t);
  await assert.rejects(savePaymentProviderConfiguration(configInput({ credentials: {} }), db, KEY), /CREDENTIAL_REQUIRED/);
  await savePaymentProviderConfiguration(configInput({ enabled: false }), db, KEY);
  const before = sqlite.prepare("SELECT credentials_ciphertext, credentials_iv FROM payment_provider_configs").get();
  const enabled = await savePaymentProviderConfiguration({ provider: "zarinpal", enabled: true, actorEmail: "owner@example.test" }, db, KEY);
  assert.equal(enabled.available, true);
  const disabled = await savePaymentProviderConfiguration({ provider: "zarinpal", enabled: false, actorEmail: "owner@example.test" }, db, KEY);
  assert.equal(disabled.available, false);
  assert.deepEqual(sqlite.prepare("SELECT credentials_ciphertext, credentials_iv FROM payment_provider_configs").get(), before);
  assert.equal(await readPaymentProviderRuntimeConfig("zarinpal", {}, db, KEY), null);
  assert.ok(await readPaymentProviderRuntimeConfig("zarinpal", { forVerification: true }, db, KEY));
});

test("V58 non-integrated definitions remain visible but cannot be persisted, collect credentials or activate", async (t) => {
  const { database: db, sqlite } = await database(t);
  await assert.rejects(savePaymentProviderConfiguration({ provider: "saman", actorEmail: "owner@example.test", mode: "add", enabled: false, priority: 1 }, db, KEY), /NOT_INTEGRATED/);
  await assert.rejects(savePaymentProviderConfiguration({ provider: "saman", enabled: true, actorEmail: "owner@example.test", mode: "update" }, db, KEY), /NOT_FOUND/);
  await assert.rejects(savePaymentProviderConfiguration({ provider: "saman", credentials: { terminalId: "12345" }, actorEmail: "owner@example.test", mode: "add" }, db, KEY), /NOT_INTEGRATED/);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM payment_provider_configs WHERE provider = 'saman'").get().count, 0);
  const config = (await listPaymentProviderAdminConfigs(db, KEY)).find((provider) => provider.provider === "saman");
  assert.equal(config.added, false); assert.equal(config.integrated, false); assert.equal(config.configured, false); assert.equal(config.available, false);
  assert.equal(await readPaymentProviderRuntimeConfig("saman", { forVerification: true }, db, KEY), null);
  sqlite.prepare("INSERT INTO payment_provider_configs (provider, enabled, sandbox, credentials_ciphertext, credentials_iv, updated_by) VALUES ('saman', 0, 0, 'legacy-metadata', 'legacy-iv', 'legacy-owner')").run();
  await assert.rejects(savePaymentProviderConfiguration({ provider: "saman", enabled: true, actorEmail: "owner@example.test", mode: "update" }, db, KEY), /NOT_INTEGRATED/);
  assert.equal(sqlite.prepare("SELECT enabled FROM payment_provider_configs WHERE provider = 'saman'").get().enabled, 0);
});

test("V57 old V55 AES-GCM merchant documents decrypt unchanged without a migration", async (t) => {
  const { database: db, sqlite } = await database(t);
  const key = await crypto.subtle.importKey("raw", Buffer.from(KEY, "base64"), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("miran-payment-provider:zarinpal:v1") }, key, new TextEncoder().encode(JSON.stringify({ merchantId: MERCHANT })));
  sqlite.prepare("INSERT INTO payment_provider_configs (provider, enabled, sandbox, credentials_ciphertext, credentials_iv, updated_by) VALUES ('zarinpal', 1, 0, ?, ?, 'legacy-owner')").run(Buffer.from(ciphertext).toString("base64"), Buffer.from(iv).toString("base64"));
  const before = sqlite.prepare("SELECT credentials_ciphertext, credentials_iv FROM payment_provider_configs").get();
  assert.deepEqual(await readZarinpalVaultConfig(db, KEY), { disabled: false, merchantId: MERCHANT, sandbox: false });
  assert.equal((await listPaymentProviderAdminConfigs(db, KEY))[0].priority, 100);
  assert.deepEqual(sqlite.prepare("SELECT credentials_ciphertext, credentials_iv FROM payment_provider_configs").get(), before);
});

test("V57 provider-aware AAD prevents ciphertext transplant and exposes no credential", async (t) => {
  const { database: db, sqlite } = await database(t);
  await savePaymentProviderConfiguration(configInput(), db, KEY);
  sqlite.prepare("INSERT INTO payment_provider_configs (provider, enabled, sandbox, credentials_ciphertext, credentials_iv, updated_by) SELECT 'saman', enabled, sandbox, credentials_ciphertext, credentials_iv, updated_by FROM payment_provider_configs WHERE provider = 'zarinpal'").run();
  const configs = await listPaymentProviderAdminConfigs(db, KEY);
  assert.equal(configs.find((item) => item.provider === "saman").configurationError, "unreadable");
  assert.equal(configs.find((item) => item.provider === "saman").available, false);
  assert.doesNotMatch(JSON.stringify(configs), new RegExp(MERCHANT));
  assert.doesNotMatch(JSON.stringify(configs), /credentials_ciphertext|credentials_iv/);
});

test("V57 wrong keys fail closed and emergency disable never overwrites unreadable ciphertext", async (t) => {
  const { database: db, sqlite } = await database(t);
  await savePaymentProviderConfiguration(configInput(), db, KEY);
  const before = sqlite.prepare("SELECT credentials_ciphertext, credentials_iv FROM payment_provider_configs").get();
  const wrongKey = Buffer.alloc(32, 18).toString("base64");
  assert.equal((await listPaymentProviderAdminConfigs(db, wrongKey))[0].available, false);
  assert.equal(await readPaymentProviderRuntimeConfig("zarinpal", {}, db, wrongKey), null);
  await assert.rejects(savePaymentProviderConfiguration({ provider: "zarinpal", priority: 10, actorEmail: "owner@example.test" }, db, wrongKey), /UNREADABLE/);
  await savePaymentProviderConfiguration({ provider: "zarinpal", enabled: false, actorEmail: "owner@example.test" }, db, "");
  assert.deepEqual(sqlite.prepare("SELECT credentials_ciphertext, credentials_iv FROM payment_provider_configs").get(), before);
});

test("V57 audit covers add/update/credentials/enable/disable/health with no secrets", async (t) => {
  const { database: db, sqlite } = await database(t);
  await savePaymentProviderConfiguration(configInput({ enabled: false }), db, KEY);
  await savePaymentProviderConfiguration({ provider: "zarinpal", enabled: true, actorEmail: "owner@example.test" }, db, KEY);
  await savePaymentProviderConfiguration({ provider: "zarinpal", enabled: false, actorEmail: "owner@example.test" }, db, KEY);
  await auditPaymentProviderHealth("zarinpal", "owner@example.test", db);
  const audit = sqlite.prepare("SELECT actor_email, action, subject_id FROM admin_audit_log WHERE action LIKE 'provider.%'").all();
  const actions = new Set(audit.map((item) => item.action));
  for (const action of ["added", "updated", "credentials-updated", "enabled", "disabled", "health-check"]) assert.ok(actions.has("provider." + action));
  assert.doesNotMatch(JSON.stringify(audit), new RegExp(MERCHANT + "|" + KEY));
  assert.ok(audit.every((row) => row.subject_id === "zarinpal"));
});

test("V57 configuration and audit persist atomically on dependency failure", async (t) => {
  const d1 = await database(t);
  d1.failNext(/INSERT INTO admin_audit_log/);
  await assert.rejects(savePaymentProviderConfiguration(configInput(), d1.database, KEY), /D1_TEST_FAILURE/);
  assert.equal(d1.sqlite.prepare("SELECT count(*) n FROM payment_provider_configs").get().n, 0);
});

test("V57 availability supports multiple implemented adapters in priority order and excludes ineligible providers", () => {
  // Future-adapter metadata doubles exercise the provider-agnostic boundary only.
  const eligible = { provider: "zarinpal", label: "test", priority: 20, sandbox: false, integrated: true, configured: true, enabled: true, available: true };
  const inputs = [eligible, { ...eligible, provider: "future-tested-adapter", priority: 1 },
    { ...eligible, provider: "disabled", enabled: false }, { ...eligible, provider: "draft", integrated: false },
    { ...eligible, provider: "broken", configured: false }, { ...eligible, provider: "down", available: false }];
  const result = availablePaymentProviders(inputs);
  assert.deepEqual(result.map((item) => item.id), ["future-tested-adapter", "zarinpal"]);
  assert.deepEqual(Object.keys(result[0]).sort(), ["id", "label", "priority", "sandbox"]);
  assert.equal(inputs[0].provider, "zarinpal");
});

test("V57 owner-only RBAC, CSRF, body bounds and no-store guard provider management", async () => {
  const [api, health, admin] = await Promise.all([readSource("app/api/admin/payment-providers/route.ts"), readSource("app/api/admin/payment-providers/[provider]/health/route.ts"), readSource("features/admin/admin-page.tsx")]);
  for (const source of [api, health]) {
    assert.match(source, /getAdminAccess\("security.write"\)/); assert.match(source, /access.role !== "owner"/);
    assert.match(source, /rejectCrossSiteMutation/); assert.match(source, /private, no-store/); assert.match(source, /rejectRateLimited/);
  }
  assert.match(api, /readPaymentRequestJson\(request, 8192\)/);
  assert.match(admin, /tab === "payments" && role === "owner" && can\("security.write"\)/);
});

test("V57 signed payment sessions use server-owned IRR amounts and exact requested provider", async (t) => {
  const f = await fixture(t); const requests = mockProvider(t);
  const result = await createPaymentSession({ ...f.input, amount: 1, currency: "GBP", callbackUrl: "https://attacker.example/" }, f.dependencies);
  assert.equal(result.provider, "zarinpal"); assert.equal(result.status, "pending");
  assert.equal(requests[0].body.amount, f.order.totalMinor); assert.equal(requests[0].body.currency, "IRR");
  assert.equal(requests[0].body.metadata.order_id, f.order.id); assert.equal(requests[0].options.redirect, "error");
  assert.equal(requests[0].url, ZARINPAL_ENDPOINTS.production.apiBase + "/payment/request.json");
  const callback = new URL(requests[0].body.callback_url);
  const attempt = await getPaymentAttemptForCallback(result.authority, f.db);
  assert.equal(callback.origin, f.input.origin); assert.equal(callback.searchParams.get("attempt"), attempt.id); assert.match(attempt.id, /^v57_/);
  assert.ok(await verifyPaymentCallback(callback.searchParams.get("state"), { provider: "zarinpal", attemptId: attempt.id, orderId: f.order.id, amountRial: 1000, currency: "IRR" }, await f.dependencies.getConfig("zarinpal")));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(MERCHANT + "|" + KEY));
});

test("V57 retrying session creation reuses one issued attempt without a second provider request", async (t) => {
  const f = await started(t);
  const second = await createPaymentSession(f.input, f.dependencies);
  assert.equal(second.authority, AUTHORITY); assert.equal(f.requests.length, 1);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM payment_attempts").get().n, 1);
});

test("V57 invalid, disabled, non-integrated and misconfigured providers reject before a charge", async (t) => {
  const f = await fixture(t); const requests = mockProvider(t);
  await assert.rejects(createPaymentSession({ ...f.input, provider: "evil" }, f.dependencies), /PROVIDER_INVALID/);
  await assert.rejects(createPaymentSession({ ...f.input, provider: "saman" }, f.dependencies), /NOT_INTEGRATED/);
  await savePaymentProviderConfiguration({ provider: "zarinpal", enabled: false, actorEmail: "owner@example.test" }, f.db, KEY);
  await assert.rejects(createPaymentSession(f.input, f.dependencies), /NOT_CONFIGURED/);
  f.sqlite.prepare("UPDATE payment_provider_configs SET enabled = 1, credentials_ciphertext = 'broken'").run();
  await assert.rejects(createPaymentSession(f.input, f.dependencies), /NOT_CONFIGURED/);
  assert.equal(requests.length, 0); assert.equal(f.sqlite.prepare("SELECT count(*) n FROM payment_attempts").get().n, 0);
});

test("V57 sessions reject another customer's order, bad currency and stale server totals", async (t) => {
  const f = await fixture(t); const requests = mockProvider(t);
  await assert.rejects(createPaymentSession({ ...f.input, customerEmail: "other@example.test" }, f.dependencies), /ORDER_UNAVAILABLE/);
  await assert.rejects(createPaymentSession(f.input, { ...f.dependencies, getOrder: async () => ({ ...f.order, currency: "GBP" }) }), /AMOUNT_INVALID/);
  await assert.rejects(createPaymentSession(f.input, { ...f.dependencies, getOrder: async () => ({ ...f.order, totalMinor: 1 }) }), /ORDER_OR_CONFIG_CHANGED/);
  assert.equal(requests.length, 0); assert.equal(f.sqlite.prepare("SELECT count(*) n FROM payment_attempts").get().n, 0);
});

test("V57 pending bank transfers and other providers prevent competing payment attempts", async (t) => {
  const f = await fixture(t); const requests = mockProvider(t);
  await createBankTransferReceipt({ orderId: f.order.id, customerEmail: f.order.customerEmail, storageKey: "synthetic-receipt", originalName: "test.pdf", contentType: "application/pdf", size: 10, transferReference: "", customerNote: "", reviewHours: 1 }, f.db);
  await assert.rejects(createPaymentSession(f.input, f.dependencies), /RECEIPT_PENDING/);
  f.sqlite.prepare("UPDATE bank_transfer_receipts SET status = 'rejected'").run();
  f.sqlite.prepare("INSERT INTO payment_attempts (id, order_id, provider, status, amount_minor) VALUES ('other-pending', ?, 'saman', 'pending', 1000)").run(f.order.id);
  await assert.rejects(createPaymentSession(f.input, f.dependencies), /OTHER_PROVIDER_PENDING/);
  assert.equal(requests.length, 0);
});

test("V57 creation timeouts fail only the undelivered attempt without damaging the order or inventory", async (t) => {
  const f = await fixture(t); mockProvider(t, { createFailure: true });
  await assert.rejects(createPaymentSession(f.input, f.dependencies), /PAYMENT_CONNECTION_FAILED/);
  assert.equal(f.sqlite.prepare("SELECT status FROM payment_attempts").get().status, "failed");
  assert.equal(f.sqlite.prepare("SELECT status FROM orders WHERE id = ?").get(f.order.id).status, "new");
  assert.equal(f.sqlite.prepare("SELECT reserved_quantity FROM products WHERE id = ?").get(f.product.id).reserved_quantity, 1);
  assert.equal(await getReusablePendingPaymentAttempt(f.order.id, f.db), null);
});

test("V57 stale configuration cannot issue an attempt with a rotated credential snapshot", async (t) => {
  const f = await fixture(t); const requests = mockProvider(t);
  const stale = await f.dependencies.getConfig("zarinpal");
  await savePaymentProviderConfiguration(configInput({ credentials: { merchantId: SECOND_MERCHANT } }), f.db, KEY);
  await assert.rejects(createPaymentSession(f.input, { ...f.dependencies, getConfig: async () => stale }), /ORDER_OR_CONFIG_CHANGED/);
  assert.equal(requests.length, 0);
});

test("V57 pending attempts block credential/sandbox rotation while disable and priority preserve callback verification", async (t) => {
  const f = await started(t);
  await assert.rejects(savePaymentProviderConfiguration(configInput({ credentials: { merchantId: SECOND_MERCHANT } }), f.db, KEY), /CONFIG_BUSY/);
  await assert.rejects(savePaymentProviderConfiguration({ provider: "zarinpal", sandbox: true, actorEmail: "owner@example.test" }, f.db, KEY), /CONFIG_BUSY/);
  await savePaymentProviderConfiguration({ provider: "zarinpal", priority: 1, actorEmail: "owner@example.test" }, f.db, KEY);
  await savePaymentProviderConfiguration({ provider: "zarinpal", enabled: false, actorEmail: "owner@example.test" }, f.db, KEY);
  const response = await handlePaymentCallback(new Request(f.callback), "zarinpal", f.callbacks);
  assert.equal(new URL(response.headers.get("location")).searchParams.get("status"), "paid");
  assert.equal(await f.dependencies.getConfig("zarinpal"), null);
});

test("V57 successful and concurrent duplicate callbacks settle once without another inventory transition", async (t) => {
  const f = await started(t);
  const before = f.sqlite.prepare("SELECT stock_quantity, reserved_quantity FROM products WHERE id = ?").get(f.product.id);
  const responses = await Promise.all([1, 2].map(() => handlePaymentCallback(new Request(f.callback), "zarinpal", f.callbacks)));
  assert.ok(responses.every((response) => new URL(response.headers.get("location")).searchParams.get("status") === "paid"));
  const replay = await handlePaymentCallback(new Request(f.callback), "zarinpal", f.callbacks);
  assert.equal(replay.status, 303);
  assert.deepEqual({ ...f.sqlite.prepare("SELECT status, payment_status FROM orders WHERE id = ?").get(f.order.id) }, { status: "confirmed", payment_status: "paid" });
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM admin_audit_log WHERE action = 'order.paid'").get().n, 1);
  assert.deepEqual(f.sqlite.prepare("SELECT stock_quantity, reserved_quantity FROM products WHERE id = ?").get(f.product.id), before);
});

for (const [name, alter] of [
  ["wrong amount", (result) => ({ ...result, amountRial: 1 })],
  ["wrong order", (result) => ({ ...result, orderId: "wrong-order" })],
  ["wrong provider", (result) => ({ ...result, provider: "saman" })],
  ["wrong currency", (result) => ({ ...result, currency: "GBP" })],
  ["wrong attempt", (result) => ({ ...result, attemptId: "wrong-attempt" })],
  ["empty reference", (result) => ({ ...result, reference: "" })],
]) test("V57 callback rejects normalized " + name + " before settlement", async (t) => {
  const f = await started(t);
  const adapter = { ...zarinpalAdapter, verifyPayment: async (input) => alter({ ...input, status: "paid", reference: "123456789" }) };
  const response = await handlePaymentCallback(new Request(f.callback), "zarinpal", { ...f.callbacks, getAdapter: () => adapter });
  assert.equal(new URL(response.headers.get("location")).searchParams.get("status"), "invalid");
  assert.equal(f.sqlite.prepare("SELECT status FROM payment_attempts").get().status, "pending");
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM admin_audit_log WHERE action = 'order.paid'").get().n, 0);
});

test("V57 new callbacks reject missing/tampered state even through the legacy URL", async (t) => {
  const f = await started(t);
  for (const change of [(url) => url.searchParams.delete("state"), (url) => url.searchParams.set("state", "0".repeat(64)), (url) => url.searchParams.set("attempt", "other")]) {
    const url = new URL(f.callback); change(url);
    const response = await handlePaymentCallback(new Request(url), "zarinpal", f.callbacks);
    assert.equal(new URL(response.headers.get("location")).searchParams.get("status"), "invalid");
  }
  assert.equal(f.requests.length, 1); assert.equal(f.sqlite.prepare("SELECT status FROM payment_attempts").get().status, "pending");
});

test("V57 signatures bind all context fields and use constant-time verification", async () => {
  const context = { provider: "zarinpal", attemptId: "v57_test", orderId: "order", amountRial: 1000, currency: "IRR" };
  const config = { provider: "zarinpal", credentials: { merchantId: MERCHANT }, sandbox: false };
  const signature = await signPaymentCallback(context, config);
  assert.ok(await verifyPaymentCallback(signature, context, config));
  for (const changes of [{ provider: "saman" }, { attemptId: "other" }, { orderId: "other" }, { amountRial: 1 }, { currency: "GBP" }]) assert.equal(await verifyPaymentCallback(signature, { ...context, ...changes }, config), false);
  assert.equal(await verifyPaymentCallback(signature, context, { ...config, sandbox: true }), false);
  assert.match(await readSource("lib/payments/callback-integrity.ts"), /crypto\.subtle\.verify/);
});

test("V57 legacy pending Zarinpal callbacks still require real server verification", async (t) => {
  const f = await started(t);
  f.sqlite.prepare("UPDATE payment_attempts SET id = 'legacy-v55'").run();
  f.callback.searchParams.delete("state"); f.callback.searchParams.delete("attempt");
  const response = await handlePaymentCallback(new Request(f.callback), "zarinpal", f.callbacks);
  assert.equal(new URL(response.headers.get("location")).searchParams.get("status"), "paid");
  assert.equal(f.requests.filter((request) => request.url.endsWith("/verify.json")).length, 1);
});

test("V57 verified cancellation cannot downgrade a paid attempt", async (t) => {
  const f = await started(t);
  await handlePaymentCallback(new Request(f.callback), "zarinpal", f.callbacks);
  f.callback.searchParams.set("Status", "NOK");
  await handlePaymentCallback(new Request(f.callback), "zarinpal", f.callbacks);
  await failPaymentAttemptById(f.attempt.id, f.db);
  assert.equal(f.sqlite.prepare("SELECT status FROM payment_attempts").get().status, "paid");
  assert.equal(f.sqlite.prepare("SELECT payment_status FROM orders WHERE id = ?").get(f.order.id).payment_status, "paid");
});

test("V57 verification timeout retains pending and logs no provider body or secret", async (t) => {
  const logs = []; t.mock.method(console, "warn", (...args) => logs.push(args));
  const f = await started(t, { verifyFailure: true });
  const response = await handlePaymentCallback(new Request(f.callback), "zarinpal", f.callbacks);
  assert.equal(new URL(response.headers.get("location")).searchParams.get("status"), "verification_pending");
  assert.equal(f.sqlite.prepare("SELECT status FROM payment_attempts").get().status, "pending");
  assert.doesNotMatch(JSON.stringify(logs), new RegExp(MERCHANT + "|PRIVATE_NETWORK_BODY|" + AUTHORITY));
  assert.equal(await response.text(), "");
});

test("V57 settlement rejects wrong persisted amount/currency/order/provider and expired orders", async (t) => {
  const f = await started(t);
  for (const changes of [{ amountMinor: 1 }, { currency: "GBP" }, { orderId: "wrong" }, { attemptId: "wrong" }, { provider: "saman" }, { providerReference: "" }]) {
    await assert.rejects(completePayment(settleInput(f, changes), f.db), /PAYMENT_/);
  }
  f.sqlite.prepare("UPDATE orders SET status = 'expired' WHERE id = ?").run(f.order.id);
  await assert.rejects(completePayment(settleInput(f), f.db), /SETTLEMENT_CONFLICT/);
  assert.equal(f.sqlite.prepare("SELECT status FROM payment_attempts").get().status, "pending");
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM admin_audit_log WHERE action = 'order.paid'").get().n, 0);
});

test("V57 a provider reference cannot be replayed onto another order", async (t) => {
  const f = await started(t);
  await completePayment(settleInput(f), f.db);
  f.sqlite.prepare("INSERT INTO orders (id, order_number, idempotency_key, customer_name, customer_email, customer_phone, address_line, city, postcode, delivery_method, currency, subtotal_minor, delivery_minor, total_minor) VALUES ('second-order', 'MS-SECOND', 'second-key', 'Second', 'buyer@example.test', '', '', '', '', 'standard', 'IRR', 1000, 0, 1000)").run();
  f.sqlite.prepare("INSERT INTO payment_attempts (id, order_id, provider, authority, status, amount_minor) VALUES ('v57_second', 'second-order', 'zarinpal', ?, 'pending', 1000)").run(SECOND_AUTHORITY);
  await assert.rejects(completePayment(settleInput(f, { attemptId: "v57_second", orderId: "second-order", authority: SECOND_AUTHORITY }), f.db), /SETTLEMENT_CONFLICT/);
  assert.equal(f.sqlite.prepare("SELECT status FROM payment_attempts WHERE id = 'v57_second'").get().status, "pending");
});

test("V57 settlement rollback preserves the pending attempt if audit storage fails", async (t) => {
  const f = await started(t);
  f.failNext(/INSERT OR IGNORE INTO admin_audit_log/);
  await assert.rejects(completePayment(settleInput(f), f.db), /D1_TEST_FAILURE/);
  assert.equal(f.sqlite.prepare("SELECT status FROM payment_attempts").get().status, "pending");
  assert.equal(f.sqlite.prepare("SELECT payment_status FROM orders WHERE id = ?").get(f.order.id).payment_status, "pending");
});

test("V57 safe health checks never make a charge or claim verified bank connectivity", async (t) => {
  let calls = 0; t.mock.method(globalThis, "fetch", () => { calls++; throw new Error("No network expected"); });
  const result = await zarinpalAdapter.healthCheck({ provider: "zarinpal", credentials: { merchantId: MERCHANT }, sandbox: false });
  assert.equal(result.status, "configured"); assert.equal(result.scope, "configuration"); assert.match(result.message, /بررسی نشده/); assert.equal(calls, 0);
});

test("V57 adapters reject malformed success responses and never return raw upstream messages", async (t) => {
  const context = { provider: "zarinpal", attemptId: "v57_test", orderId: "order", amountRial: 1000, currency: "IRR", authority: AUTHORITY };
  const config = { provider: "zarinpal", credentials: { merchantId: MERCHANT }, sandbox: false };
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: { code: 100, ref_id: "" }, errors: { code: -9, message: MERCHANT } }));
  await assert.rejects(zarinpalAdapter.verifyPayment(context, config), (error) => error.message === "PAYMENT_VERIFY_REJECTED" && !JSON.stringify(error).includes(MERCHANT));
  assert.doesNotMatch(getPaymentProviderUserMessage(new PaymentProviderError("PAYMENT_VERIFY_REJECTED", -9)), new RegExp(MERCHANT));
  assert.equal(zarinpalAdapter.handleCallback(new URLSearchParams("Authority=" + AUTHORITY + "&Status=OK&Status=NOK")), null);
});

test("V57 checkout selects PSPs while result-page truth comes only from the owned database order", async (t) => {
  const f = await started(t);
  await completePayment(settleInput(f), f.db);
  assert.equal((await getOwnedOrderPaymentSummary(f.order.orderNumber, f.order.customerEmail, f.db)).payment_status, "paid");
  assert.equal(await getOwnedOrderPaymentSummary(f.order.orderNumber, "other@example.test", f.db), null);
  const [checkout, page] = await Promise.all([readSource("features/checkout/checkout-page.tsx"), readSource("app/payment/result/page.tsx")]);
  assert.match(checkout, /paymentProviders.map/); assert.match(checkout, /provider: activePaymentProvider/); assert.match(checkout, /Bank Transfer|کارت‌به‌کارت/);
  assert.match(page, /summary\?\.payment_status === "paid"/); assert.doesNotMatch(page, /params.status === "paid"|params.ref/);
});
