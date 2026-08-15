import assert from "node:assert/strict";
import test from "node:test";
import { migratePostgres, openPostgresPool } from "../postgres/database.js";
import { PostgresMarketplaceService } from "../postgres/marketplace-service.js";
import { PostgresPaymentService } from "../postgres/payment-service.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

class FakeZarinpal {
  constructor() {
    this.created = 0;
    this.verified = 0;
  }

  async createPayment({ amountIrr }) {
    this.created += 1;
    const authority = `authority-${this.created}-${amountIrr}`;
    return {
      authority,
      redirectUrl: this.redirectUrl(authority),
      raw: { data: { code: 100, authority } },
    };
  }

  redirectUrl(authority) {
    return `https://sandbox.example.test/start/${encodeURIComponent(authority)}`;
  }

  async verifyPayment({ authority }) {
    this.verified += 1;
    return {
      code: 100,
      referenceId: `ref-${authority}`,
      raw: { data: { code: 100, ref_id: `ref-${authority}` } },
    };
  }
}

async function fixture() {
  if (!databaseUrl) throw new Error("POSTGRES_TEST_DATABASE_URL is required");
  const pool = openPostgresPool({
    connectionString: databaseUrl,
    max: 6,
    applicationName: "miran-postgres-payment-test",
  });
  await migratePostgres(pool);
  const marketplace = new PostgresMarketplaceService(pool, { reservationMinutes: 15 });
  const provider = new FakeZarinpal();
  const payments = new PostgresPaymentService(pool, provider, { reservationMinutes: 30 });
  const suffix = Date.now().toString(36);
  const user = await marketplace.register({
    email: `pay-${suffix}@example.com`,
    password: "very-secure-pass-123",
  });
  const address = await marketplace.addAddress(user.id, {
    fullName: "Payment Buyer",
    phone: "09120000000",
    province: "Tehran",
    city: "Tehran",
    addressLine: "Payment street",
    postalCode: "1234567890",
    isDefault: true,
  });
  const productId = `pay-product-${suffix}`;
  await pool.query(
    `INSERT INTO products(id,title,slug,base_price_irr,status)
     VALUES($1,'Payment Product',$2,500000,'PUBLISHED')`,
    [productId, `pay-product-${suffix}`],
  );
  await pool.query(
    "INSERT INTO inventory(product_id,stock_on_hand,stock_reserved) VALUES($1,2,0)",
    [productId],
  );
  return { pool, marketplace, payments, provider, suffix, user, address, productId };
}

async function createOrder(fixtureValue, keySuffix = "a") {
  return fixtureValue.marketplace.createOrder(fixtureValue.user.id, {
    addressId: fixtureValue.address.id,
    idempotencyKey: `payment-${fixtureValue.suffix}-${keySuffix}`,
    items: [{ productId: fixtureValue.productId, quantity: 1 }],
  });
}

test(
  "PostgreSQL payment start is reusable and verified callback settles stock once",
  { skip: !databaseUrl },
  async () => {
    const value = await fixture();
    try {
      const order = await createOrder(value);
      const started = await value.payments.startZarinpal(value.user.id, order.id, {
        callbackUrl: "https://almiran.ir/api/payments/zarinpal/callback",
        email: value.user.email,
      });
      assert.equal(started.reused, false);
      assert.equal(value.provider.created, 1);

      const reused = await value.payments.startZarinpal(value.user.id, order.id, {
        callbackUrl: "https://almiran.ir/api/payments/zarinpal/callback",
      });
      assert.equal(reused.reused, true);
      assert.equal(reused.authority, started.authority);
      assert.equal(value.provider.created, 1);

      const verified = await value.payments.verifyZarinpalCallback({
        authority: started.authority,
        status: "OK",
      });
      assert.equal(verified.orderId, order.id);
      assert.equal(verified.referenceId, `ref-${started.authority}`);
      assert.equal(value.provider.verified, 1);

      const secondVerify = await value.payments.verifyZarinpalCallback({
        authority: started.authority,
        status: "OK",
      });
      assert.equal(secondVerify.alreadyVerified, true);
      assert.equal(value.provider.verified, 1);

      const inventory = await value.pool.query(
        "SELECT stock_on_hand,stock_reserved FROM inventory WHERE product_id=$1",
        [value.productId],
      );
      assert.equal(inventory.rows[0].stock_on_hand, 1);
      assert.equal(inventory.rows[0].stock_reserved, 0);
      const storedOrder = await value.pool.query("SELECT status FROM orders WHERE id=$1", [order.id]);
      assert.equal(storedOrder.rows[0].status, "PAID");
    } finally {
      await value.pool.end();
    }
  },
);

test(
  "PostgreSQL cancelled callback releases reservation and prevents fake payment success",
  { skip: !databaseUrl },
  async () => {
    const value = await fixture();
    try {
      const order = await createOrder(value, "cancel");
      const started = await value.payments.startZarinpal(value.user.id, order.id, {
        callbackUrl: "https://almiran.ir/api/payments/zarinpal/callback",
      });
      const cancelled = await value.payments.verifyZarinpalCallback({
        authority: started.authority,
        status: "NOK",
      });
      assert.equal(cancelled.cancelled, true);
      assert.equal(value.provider.verified, 0);

      const inventory = await value.pool.query(
        "SELECT stock_on_hand,stock_reserved FROM inventory WHERE product_id=$1",
        [value.productId],
      );
      assert.equal(inventory.rows[0].stock_on_hand, 2);
      assert.equal(inventory.rows[0].stock_reserved, 0);
      const storedOrder = await value.pool.query("SELECT status FROM orders WHERE id=$1", [order.id]);
      assert.equal(storedOrder.rows[0].status, "PAYMENT_FAILED");
      const payment = await value.pool.query(
        "SELECT status FROM payments WHERE authority=$1",
        [started.authority],
      );
      assert.equal(payment.rows[0].status, "CANCELLED");
    } finally {
      await value.pool.end();
    }
  },
);
