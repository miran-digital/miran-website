import assert from "node:assert/strict";
import test from "node:test";
import { migratePostgres, openPostgresPool } from "../postgres/database.js";
import { PostgresMarketplaceService } from "../postgres/marketplace-service.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

async function fixture() {
  if (!databaseUrl) throw new Error("POSTGRES_TEST_DATABASE_URL is required");
  const pool = openPostgresPool({
    connectionString: databaseUrl,
    max: 8,
    applicationName: "miran-postgres-marketplace-test",
  });
  await migratePostgres(pool);
  return { pool, service: new PostgresMarketplaceService(pool, { reservationMinutes: 15 }) };
}

async function buyer(service, suffix) {
  const user = await service.register({
    email: `buyer-${suffix}@example.com`,
    password: "very-secure-pass-123",
  });
  const login = await service.login({
    email: user.email,
    password: "very-secure-pass-123",
  });
  assert.equal((await service.authenticate(login.token)).id, user.id);
  const address = await service.addAddress(user.id, {
    fullName: "Buyer",
    phone: "09120000000",
    province: "Tehran",
    city: "Tehran",
    addressLine: "Test address",
    postalCode: "1234567890",
    isDefault: true,
  });
  return { user, login, address };
}

test(
  "PostgreSQL auth stores only token hash and logout invalidates the session",
  { skip: !databaseUrl },
  async () => {
    const { pool, service } = await fixture();
    const suffix = `${Date.now().toString(36)}-auth`;
    try {
      const { user, login } = await buyer(service, suffix);
      const rawToken = await pool.query(
        "SELECT COUNT(*)::int AS n FROM sessions WHERE token_hash=$1",
        [login.token],
      );
      assert.equal(rawToken.rows[0].n, 0);
      assert.equal((await service.authenticate(login.token)).id, user.id);
      await service.logout(login.token);
      await assert.rejects(() => service.authenticate(login.token), /invalid or expired/i);
    } finally {
      await pool.end();
    }
  },
);

test(
  "PostgreSQL checkout locks inventory, prevents oversell and keeps idempotency",
  { skip: !databaseUrl },
  async () => {
    const { pool, service } = await fixture();
    const suffix = `${Date.now().toString(36)}-stock`;
    const productId = `pg-product-${suffix}`;
    try {
      const firstBuyer = await buyer(service, `${suffix}-a`);
      const secondBuyer = await buyer(service, `${suffix}-b`);
      await pool.query(
        `INSERT INTO products
         (id,title,slug,brand,base_price_irr,discount_type,discount_value,status,is_amazing)
         VALUES($1,'Postgres Phone',$2,'Miran',1000000,'PERCENTAGE',10,'PUBLISHED',TRUE)`,
        [productId, `pg-phone-${suffix}`],
      );
      await pool.query(
        "INSERT INTO inventory(product_id,stock_on_hand,stock_reserved) VALUES($1,1,0)",
        [productId],
      );

      const attempts = await Promise.allSettled([
        service.createOrder(firstBuyer.user.id, {
          addressId: firstBuyer.address.id,
          idempotencyKey: `checkout-${suffix}-a`,
          items: [{ productId, quantity: 1 }],
        }),
        service.createOrder(secondBuyer.user.id, {
          addressId: secondBuyer.address.id,
          idempotencyKey: `checkout-${suffix}-b`,
          items: [{ productId, quantity: 1 }],
        }),
      ]);
      const fulfilled = attempts.filter((item) => item.status === "fulfilled");
      const rejected = attempts.filter((item) => item.status === "rejected");
      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
      assert.equal(rejected[0].reason.code, "OUT_OF_STOCK");

      const order = fulfilled[0].value;
      assert.equal(order.totalIrr, 900000);
      const winner = order.userId === firstBuyer.user.id ? firstBuyer : secondBuyer;
      const repeated = await service.createOrder(winner.user.id, {
        addressId: winner.address.id,
        idempotencyKey: order.userId === firstBuyer.user.id
          ? `checkout-${suffix}-a`
          : `checkout-${suffix}-b`,
        items: [{ productId, quantity: 1 }],
      });
      assert.equal(repeated.id, order.id);

      let inventory = await pool.query(
        "SELECT stock_on_hand,stock_reserved FROM inventory WHERE product_id=$1",
        [productId],
      );
      assert.equal(inventory.rows[0].stock_on_hand, 1);
      assert.equal(inventory.rows[0].stock_reserved, 1);

      const paid = await service.markOrderPaid(order.id, {
        provider: "TEST",
        authority: `authority-${suffix}`,
        referenceId: `ref-${suffix}`,
      });
      assert.equal(paid.status, "PAID");
      inventory = await pool.query(
        "SELECT stock_on_hand,stock_reserved FROM inventory WHERE product_id=$1",
        [productId],
      );
      assert.equal(inventory.rows[0].stock_on_hand, 0);
      assert.equal(inventory.rows[0].stock_reserved, 0);
      const details = await service.getOrder(winner.user.id, order.id);
      assert.equal(details.items.length, 1);
      assert.equal(details.items[0].unitFinalPriceIrr, 900000);
    } finally {
      await pool.end();
    }
  },
);

test(
  "expired PostgreSQL reservations release stock and fail pending orders",
  { skip: !databaseUrl },
  async () => {
    const { pool, service } = await fixture();
    const suffix = `${Date.now().toString(36)}-expiry`;
    const productId = `expiry-product-${suffix}`;
    try {
      const current = await buyer(service, suffix);
      await pool.query(
        `INSERT INTO products(id,title,slug,base_price_irr,status)
         VALUES($1,'Expiry Product',$2,500000,'PUBLISHED')`,
        [productId, `expiry-${suffix}`],
      );
      await pool.query(
        "INSERT INTO inventory(product_id,stock_on_hand,stock_reserved) VALUES($1,2,0)",
        [productId],
      );
      const now = new Date("2026-08-16T00:00:00.000Z");
      const order = await service.createOrder(current.user.id, {
        addressId: current.address.id,
        idempotencyKey: `expiry-${suffix}`,
        items: [{ productId, quantity: 2 }],
        now,
      });
      assert.equal(order.status, "PENDING_PAYMENT");
      const released = await service.releaseExpiredReservations(
        new Date("2026-08-16T00:16:00.000Z"),
      );
      assert.ok(released >= 1);
      const storedOrder = await pool.query("SELECT status FROM orders WHERE id=$1", [order.id]);
      assert.equal(storedOrder.rows[0].status, "PAYMENT_FAILED");
      const inventory = await pool.query(
        "SELECT stock_on_hand,stock_reserved FROM inventory WHERE product_id=$1",
        [productId],
      );
      assert.equal(inventory.rows[0].stock_on_hand, 2);
      assert.equal(inventory.rows[0].stock_reserved, 0);
    } finally {
      await pool.end();
    }
  },
);
