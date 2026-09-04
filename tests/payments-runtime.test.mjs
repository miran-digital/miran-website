import assert from "node:assert/strict";
import test from "node:test";

// Exercise the compiled Worker in memory, never a deployed site or a real PSP.
globalThis[Symbol.for("miran.test.allow-mock-storefront")] = true;
const context = { waitUntil() {}, passThroughOnException() {} };
const owner = "owner@example.test";
const origin = "https://store.example.test";
const headers = (email = "") => ({ origin, ...(email ? { "oai-authenticated-user-email": email } : {}) });

async function workerFixture(t) {
  const values = { ADMIN_EMAIL: owner, ZARINPAL_MERCHANT_ID: "", ZARINPAL_SANDBOX: "false", PAYMENT_CONFIG_ENCRYPTION_KEY: Buffer.alloc(32, 29).toString("base64") };
  for (const [name, value] of Object.entries(values)) {
    const before = process.env[name];
    process.env[name] = value;
    t.after(() => { if (before === undefined) delete process.env[name]; else process.env[name] = before; });
  }
  const url = new URL("../dist/server/index.js", import.meta.url);
  url.searchParams.set("test", crypto.randomUUID());
  return (await import(url.href)).default;
}

test("V57 compiled provider manager is owner-only and returns no credential material", async (t) => {
  const worker = await workerFixture(t);
  for (const [email, status] of [["", 401], ["manager@example.test", 403], [owner, 200]]) {
    const response = await worker.fetch(new Request(origin + "/api/admin/payment-providers", { headers: headers(email) }), {}, context);
    assert.equal(response.status, status);
    assert.match(response.headers.get("cache-control"), /private, no-store/);
    const payload = await response.json();
    assert.doesNotMatch(JSON.stringify(payload), /credentials_ciphertext|credentials_iv|PAYMENT_CONFIG_ENCRYPTION_KEY/);
    if (status === 200) {
      assert.equal(payload.providers.length, 8);
      assert.ok(payload.providers.every((provider) => !provider.added && !provider.available));
      assert.ok(payload.providers.every((provider) => !Object.hasOwn(provider, "credentials")));
    }
  }
});

test("V57 compiled provider writes and health checks reject unauthorized and cross-site requests", async (t) => {
  const worker = await workerFixture(t);
  for (const [path, method] of [["/api/admin/payment-providers", "POST"], ["/api/admin/payment-providers", "PATCH"], ["/api/admin/payment-providers", "DELETE"], ["/api/admin/payment-providers/zarinpal/health", "POST"]]) {
    for (const [email, expected] of [["", 401], ["manager@example.test", 403]]) {
      const response = await worker.fetch(new Request(origin + path, { method, headers: headers(email), body: "{}" }), {}, context);
      assert.equal(response.status, expected);
    }
    const crossSite = await worker.fetch(new Request(origin + path, { method, headers: { ...headers(owner), origin: "https://other.example.test", "sec-fetch-site": "cross-site" }, body: "{}" }), {}, context);
    assert.equal(crossSite.status, 403);
  }
  const noDatabase = await worker.fetch(new Request(origin + "/api/admin/payment-providers", { method: "PATCH", headers: { ...headers(owner), "content-type": "application/json" }, body: '{"provider":"zarinpal","enabled":true}' }), {}, context);
  assert.equal(noDatabase.status, 503, "Configuration writes fail closed when durable rate limiting is unavailable");
});

test("V57 compiled callback routes reject malformed requests without provider calls or HTTP 500", async (t) => {
  const worker = await workerFixture(t);
  for (const [path, method, extra] of [
    ["/api/payments/zarinpal/callback?Authority=invalid&Status=OK", "GET", {}],
    ["/api/payments/saman/callback", "POST", { headers: { "content-type": "application/json" }, body: "{}" }],
  ]) {
    const response = await worker.fetch(new Request(origin + path, { method, ...extra }), {}, context);
    assert.equal(response.status, 303);
    assert.equal(new URL(response.headers.get("location")).searchParams.get("status"), "invalid");
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
});

test("V57 compiled result page cannot report success or leak an order from browser query parameters", async (t) => {
  const worker = await workerFixture(t);
  const response = await worker.fetch(new Request(origin + "/payment/result?status=paid&order=PRIVATE-ORDER&ref=FAKE-REFERENCE", { headers: { accept: "text/html" } }), {}, context);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /پیگیری وضعیت پرداخت/);
  assert.match(html, /وارد حساب خریدار شوید/);
  assert.doesNotMatch(html, /<h1[^>]*>پرداخت با موفقیت تأیید شد/);
  assert.doesNotMatch(html, /<strong[^>]*>(?:PRIVATE-ORDER|FAKE-REFERENCE)<\/strong>/);
});
