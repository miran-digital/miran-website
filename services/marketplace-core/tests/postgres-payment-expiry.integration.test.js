import assert from "node:assert/strict";
import test from "node:test";
import { migratePostgres, openPostgresPool } from "../postgres/database.js";
import { PostgresMarketplaceService } from "../postgres/marketplace-service.js";
import { PostgresPaymentService } from "../postgres/payment-service.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

class NoCallProvider {
  constructor() {
    this.calls = 0;
  }

  async createPayment() {
    this.calls += 1;
    throw new Error("provider must not be called for expired reservation");
  }

  redirectUrl(authority) {
    return `https://sandbox.example.test/${authority}`;
  }
}

test(
  "expired reservation is released and committed before payment start returns CONFLICT",
  { skip: !databaseUrl },
  async () => {
    const pool = openPostgresPool({
      connectionString: databaseUrl,
      max: 4,
      applicationName: "miran-postgres-payment-expiry-test",
    });
    await migratePostgres(pool);
    const marketplace = new PostgresMarketplaceService(pool, { reservationMinutes: 15 });
    const provider = new NoCallProvider();
    const payments = new PostgresPaymentService(pool, provider, { reservationMinutes: 30 });
    const suffix = Date.now().toString(36);
    try {
      const user = await marketplace.register({
        email: `expired-pay-${suffix}@example.com`,
        password: "very-secure-pass-123",
      });
      const address = await marketplace.addAddress(user.id, {
        fullName: "Expired Payment Buyer",
        phone: "09120000000",
        province: "Tehran",
        city: "Tehran",
        addressLine: "Expired street",
        postalCode: "1234567890",
        isDefault: true,
      });
      const productId = `expired-pay-product-${suffix}`;
      await pool.query(
        `INSERT INTO products(id,title,slug,base_price_irr,status)
         VALUES($1,'Expired Pay Product',$2,500000,'PUBLISHED')`,
        [productId, `expired-pay-product-${suffix}`],
      );
      await pool.query(
        "INSERT INTO inventory(product_id,stock_on_hand,stock_reserved) VALUES($1,1,0)",
        [productId],
      );

      const createdAt = new Date("2026-08-16T00:00:00.000Z");
      const order = await marketplace.createOrder(user.id, {
        addressId: address.id,
        idempotencyKey: `expired-pay-${suffix}`,
        items: [{ productId, quantity: 1 }],
        now: createdAt,
      });

      await assert.rejects(
        () => payments.startZarinpal(user.id, order.id, {
          callbackUrl: "https://almiran.ir/api/payments/zarinpal/callback",
          now: new Date("2026-08-16T00:16:00.000Z"),
        }),
        (error) => error?.code === "CONFLICT",
      );
      assert.equal(provider.calls, 0);

      const storedOrder = await pool.query(
        "SELECT status FROM orders WHERE id=$1",
        [order.id],
      );
      assert.equal(storedOrder.rows[0].status, "PAYMENT_FAILED");
      const inventory = await pool.query(
        "SELECT stock_on_hand,stock_reserved FROM inventory WHERE product_id=$1",
        [productId],
      );
      assert.equal(inventory.rows[0].stock_on_hand, 1);
      assert.equal(inventory.rows[0].stock_reserved, 0);
      const reservations = await pool.query(
        "SELECT status FROM inventory_reservations WHERE order_id=$1",
        [order.id],
      );
      assert.equal(reservations.rows[0].status, "RELEASED");
      const providerPayments = await pool.query(
        "SELECT COUNT(*)::int AS n FROM payments WHERE order_id=$1",
        [order.id],
      );
      assert.equal(providerPayments.rows[0].n, 0);
    } finally {
      await pool.end();
    }
  },
);
