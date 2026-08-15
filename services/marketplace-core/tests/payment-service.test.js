import assert from "node:assert/strict";
import test from "node:test";
import { MarketplaceCore } from "../src/core.js";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";
import { PaymentService } from "../src/payment-service.js";
import { ProductCreateService } from "../src/product-create-service.js";
import { ZarinpalClient } from "../src/zarinpal-client.js";

function buyer(core, suffix) {
  const user = core.register({ email: `${suffix}@example.com`, password: "very-secure-pass-123" });
  const address = core.addAddress(user.id, {
    fullName: suffix,
    phone: "09120000000",
    province: "Tehran",
    city: "Tehran",
    addressLine: "Test street",
    postalCode: "1234567890",
    isDefault: true,
  });
  return { user, address };
}

function fixture() {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  const core = new MarketplaceCore(db, { reservationMinutes: 15 });
  const products = new ProductCreateService(db);
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('admin','admin@example.com','s','h','ADMIN')").run();
  return { db, core, products };
}

function fakeProvider() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    if (String(url).endsWith("/pg/v4/payment/request.json")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { code: 100, authority: "A000000000000000000000000000001", fee: 0, fee_type: "Merchant" },
          errors: [],
        }),
      };
    }
    if (String(url).endsWith("/pg/v4/payment/verify.json")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { code: 100, ref_id: 123456789, card_pan: "6037********1234", fee: 0, fee_type: "Merchant" },
          errors: [],
        }),
      };
    }
    throw new Error("unexpected provider URL");
  };
  return { calls, client: new ZarinpalClient({ merchantId: "test-merchant", sandbox: true, fetchImpl }) };
}

test("payment amount is taken from order, provider request is IRR and verified callback consumes inventory exactly once", async () => {
  const { db, core, products } = fixture();
  const customer = buyer(core, "paying-buyer");
  const product = products.create("admin", {
    title: "Payment product",
    slug: "payment-product",
    basePriceIrr: 20_000_000,
    discountType: "PERCENTAGE",
    discountValue: 25,
    stockOnHand: 2,
    status: "PUBLISHED",
  });
  const order = core.createOrder(customer.user.id, {
    addressId: customer.address.id,
    idempotencyKey: "payment-order-001",
    items: [{ productId: product.id, quantity: 1 }],
  });
  const provider = fakeProvider();
  const payments = new PaymentService(db, provider.client, { reservationMinutes: 30 });

  const start = await payments.startZarinpal(customer.user.id, order.id, {
    callbackUrl: "http://localhost:3000/api/payments/zarinpal/callback",
    email: customer.user.email,
  });
  assert.match(start.redirectUrl, /^https:\/\/sandbox\.zarinpal\.com\/pg\/StartPay\//);
  assert.equal(provider.calls[0].body.amount, 15_000_000);
  assert.equal(provider.calls[0].body.currency, "IRR");
  assert.equal(provider.calls[0].body.merchant_id, "test-merchant");
  assert.equal(db.prepare("SELECT status FROM payments WHERE id=?").get(start.paymentId).status, "REDIRECTED");

  const verified = await payments.verifyZarinpalCallback({ authority: start.authority, status: "OK" });
  assert.equal(verified.referenceId, "123456789");
  assert.equal(db.prepare("SELECT status FROM orders WHERE id=?").get(order.id).status, "PAID");
  assert.equal(db.prepare("SELECT status FROM payments WHERE id=?").get(start.paymentId).status, "VERIFIED");
  const inventory = db.prepare("SELECT * FROM inventory WHERE product_id=?").get(product.id);
  assert.equal(inventory.stock_on_hand, 1);
  assert.equal(inventory.stock_reserved, 0);

  const repeated = await payments.verifyZarinpalCallback({ authority: start.authority, status: "OK" });
  assert.equal(repeated.alreadyVerified, true);
  assert.equal(provider.calls.filter((call) => call.url.endsWith("verify.json")).length, 1);
  db.close();
});

test("another customer cannot start payment and cancelled callback releases reservation", async () => {
  const { db, core, products } = fixture();
  const customer = buyer(core, "owner-buyer");
  const other = buyer(core, "other-buyer");
  const product = products.create("admin", {
    title: "Cancel product",
    slug: "cancel-product",
    basePriceIrr: 5_000_000,
    stockOnHand: 1,
    status: "PUBLISHED",
  });
  const order = core.createOrder(customer.user.id, {
    addressId: customer.address.id,
    idempotencyKey: "payment-order-002",
    items: [{ productId: product.id, quantity: 1 }],
  });
  const provider = fakeProvider();
  const payments = new PaymentService(db, provider.client);

  await assert.rejects(
    () => payments.startZarinpal(other.user.id, order.id, {
      callbackUrl: "http://localhost:3000/api/payments/zarinpal/callback",
    }),
    /order not found/i,
  );

  const start = await payments.startZarinpal(customer.user.id, order.id, {
    callbackUrl: "http://localhost:3000/api/payments/zarinpal/callback",
  });
  const cancelled = await payments.verifyZarinpalCallback({ authority: start.authority, status: "NOK" });
  assert.equal(cancelled.cancelled, true);
  assert.equal(db.prepare("SELECT status FROM orders WHERE id=?").get(order.id).status, "PAYMENT_FAILED");
  const inventory = db.prepare("SELECT * FROM inventory WHERE product_id=?").get(product.id);
  assert.equal(inventory.stock_reserved, 0);
  assert.equal(inventory.stock_on_hand, 1);
  db.close();
});
