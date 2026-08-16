import assert from "node:assert/strict";
import test from "node:test";
import { migratePostgres, openPostgresPool } from "../postgres/database.js";
import { PostgresMarketplaceService } from "../postgres/marketplace-service.js";
import { runPostgresMaintenance } from "../postgres/maintenance-service.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

test(
  "maintenance releases expired reservations and removes expired sessions",
  { skip: !databaseUrl },
  async () => {
    const pool = openPostgresPool({
      connectionString: databaseUrl,
      max: 4,
      applicationName: "miran-postgres-maintenance-test",
    });
    await migratePostgres(pool);
    const marketplace = new PostgresMarketplaceService(pool, { reservationMinutes: 15 });
    const suffix = Date.now().toString(36);
    try {
      const user = await marketplace.register({
        email: `maintenance-${suffix}@example.com`,
        password: "very-secure-pass-123",
      });
      const login = await marketplace.login({
        email: user.email,
        password: "very-secure-pass-123",
        now: new Date("2026-08-01T00:00:00.000Z"),
      });
      assert.ok(login.token);
      const address = await marketplace.addAddress(user.id, {
        fullName: "Maintenance Buyer",
        phone: "09120000000",
        province: "Tehran",
        city: "Tehran",
        addressLine: "Maintenance street",
        postalCode: "1234567890",
        isDefault: true,
      });
      const productId = `maintenance-product-${suffix}`;
      await pool.query(
        `INSERT INTO products(id,title,slug,base_price_irr,status)
         VALUES($1,'Maintenance Product',$2,1000000,'PUBLISHED')`,
        [productId, `maintenance-product-${suffix}`],
      );
      await pool.query(
        "INSERT INTO inventory(product_id,stock_on_hand,stock_reserved) VALUES($1,1,0)",
        [productId],
      );
      const order = await marketplace.createOrder(user.id, {
        addressId: address.id,
        idempotencyKey: `maintenance-${suffix}`,
        items: [{ productId, quantity: 1 }],
        now: new Date("2026-08-01T00:00:00.000Z"),
      });
      assert.equal(order.status, "PENDING_PAYMENT");

      const result = await runPostgresMaintenance(
        pool,
        marketplace,
        new Date("2026-09-15T00:00:00.000Z"),
      );
      assert.ok(result.releasedReservations >= 1);
      assert.ok(result.expiredSessions >= 1);

      const inventory = await pool.query(
        "SELECT stock_on_hand,stock_reserved FROM inventory WHERE product_id=$1",
        [productId],
      );
      assert.equal(inventory.rows[0].stock_on_hand, 1);
      assert.equal(inventory.rows[0].stock_reserved, 0);
      const storedOrder = await pool.query("SELECT status FROM orders WHERE id=$1", [order.id]);
      assert.equal(storedOrder.rows[0].status, "PAYMENT_FAILED");
      const session = await pool.query("SELECT id FROM sessions WHERE user_id=$1", [user.id]);
      assert.equal(session.rowCount, 0);
    } finally {
      await pool.end();
    }
  },
);
