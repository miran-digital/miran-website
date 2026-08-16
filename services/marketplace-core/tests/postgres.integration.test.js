import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPostgresHealth,
  migratePostgres,
  openPostgresPool,
  withPostgresTransaction,
} from "../postgres/database.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

async function freshPool() {
  if (!databaseUrl) throw new Error("POSTGRES_TEST_DATABASE_URL is required");
  const pool = openPostgresPool({
    connectionString: databaseUrl,
    max: 4,
    applicationName: "miran-postgres-integration-test",
  });
  await migratePostgres(pool);
  return pool;
}

test(
  "PostgreSQL migrations are idempotent and create the production schema",
  { skip: !databaseUrl },
  async () => {
    const pool = await freshPool();
    try {
      await migratePostgres(pool);
      const health = await checkPostgresHealth(pool);
      assert.equal(health.database_name, "miran_test");
      assert.ok(Number(health.server_version_num) >= 170000);

      const versions = await pool.query(
        "SELECT version FROM schema_migrations ORDER BY version",
      );
      assert.deepEqual(
        versions.rows.map((row) => row.version),
        ["001_init.sql", "008_cart_logistics.sql"],
      );

      const requiredTables = [
        "users",
        "sessions",
        "addresses",
        "sellers",
        "seller_documents",
        "seller_guarantees",
        "categories",
        "products",
        "product_media",
        "inventory",
        "orders",
        "order_items",
        "inventory_reservations",
        "payments",
        "audit_log",
        "home_sections",
        "header_messages",
        "storefront_banners",
        "carts",
        "cart_items",
        "shipping_methods",
      ];
      const tables = await pool.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema='public' AND table_type='BASE TABLE'`,
      );
      const names = new Set(tables.rows.map((row) => row.table_name));
      for (const table of requiredTables) assert.ok(names.has(table), `${table} must exist`);

      const orderColumns = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema='public' AND table_name='orders'`,
      );
      const orderColumnNames = new Set(orderColumns.rows.map((row) => row.column_name));
      assert.ok(orderColumnNames.has("shipping_method_code"));
      assert.ok(orderColumnNames.has("shipping_method_name"));
      assert.ok(orderColumnNames.has("shipping_irr"));
    } finally {
      await pool.end();
    }
  },
);

test(
  "PostgreSQL enforces one default address and one primary product image",
  { skip: !databaseUrl },
  async () => {
    const pool = await freshPool();
    const suffix = Date.now().toString(36);
    const userId = `user-${suffix}`;
    const productId = `product-${suffix}`;
    try {
      await pool.query(
        "INSERT INTO users(id,email,password_salt,password_hash) VALUES($1,$2,'salt','hash')",
        [userId, `${userId}@example.com`],
      );
      await pool.query(
        `INSERT INTO addresses(id,user_id,full_name,phone,province,city,address_line,postal_code,is_default)
         VALUES($1,$2,'User','09120000000','Tehran','Tehran','Address','1234567890',TRUE)`,
        [`address-a-${suffix}`, userId],
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO addresses(id,user_id,full_name,phone,province,city,address_line,postal_code,is_default)
           VALUES($1,$2,'User','09120000000','Tehran','Tehran','Address 2','1234567891',TRUE)`,
          [`address-b-${suffix}`, userId],
        ),
        (error) => error?.code === "23505",
      );

      await pool.query(
        "INSERT INTO products(id,title,slug,base_price_irr,status) VALUES($1,'Product',$2,100000,'DRAFT')",
        [productId, `product-${suffix}`],
      );
      await pool.query(
        "INSERT INTO product_media(id,product_id,media_type,url,is_primary) VALUES($1,$2,'IMAGE','https://example.com/a.webp',TRUE)",
        [`media-a-${suffix}`, productId],
      );
      await assert.rejects(
        pool.query(
          "INSERT INTO product_media(id,product_id,media_type,url,is_primary) VALUES($1,$2,'IMAGE','https://example.com/b.webp',TRUE)",
          [`media-b-${suffix}`, productId],
        ),
        (error) => error?.code === "23505",
      );
    } finally {
      await pool.end();
    }
  },
);

test(
  "PostgreSQL transaction helper rolls back all writes on failure",
  { skip: !databaseUrl },
  async () => {
    const pool = await freshPool();
    const id = `rollback-${Date.now().toString(36)}`;
    try {
      await assert.rejects(
        withPostgresTransaction(pool, async (client) => {
          await client.query(
            "INSERT INTO users(id,email,password_salt,password_hash) VALUES($1,$2,'salt','hash')",
            [id, `${id}@example.com`],
          );
          throw new Error("force rollback");
        }),
        /force rollback/,
      );
      const result = await pool.query("SELECT id FROM users WHERE id=$1", [id]);
      assert.equal(result.rowCount, 0);
    } finally {
      await pool.end();
    }
  },
);