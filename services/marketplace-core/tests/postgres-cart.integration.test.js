import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PostgresCartService } from "../postgres/cart-service.js";
import { migratePostgres, openPostgresPool } from "../postgres/database.js";
import { PostgresMarketplaceService } from "../postgres/marketplace-service.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

async function fixture() {
  if (!databaseUrl) throw new Error("POSTGRES_TEST_DATABASE_URL is required");
  const pool = openPostgresPool({ connectionString: databaseUrl, max: 5, applicationName: "miran-cart-test" });
  await migratePostgres(pool);
  const marketplace = new PostgresMarketplaceService(pool);
  const cart = new PostgresCartService(pool);
  const suffix = randomUUID().replaceAll("-", "");
  const user = await marketplace.register({
    email: `cart-${suffix}@example.com`,
    password: "very-secure-pass-123",
  });
  const productId = `cart-product-${suffix}`;
  await pool.query(
    `INSERT INTO products
     (id,title,slug,base_price_irr,discount_type,discount_value,status)
     VALUES($1,'Cart Product',$2,1000000,'PERCENTAGE',10,'PUBLISHED')`,
    [productId, `cart-product-${suffix}`],
  );
  await pool.query(
    "INSERT INTO inventory(product_id,stock_on_hand,stock_reserved) VALUES($1,5,0)",
    [productId],
  );
  return { pool, marketplace, cart, user, productId, suffix };
}

test(
  "PostgreSQL cart persists product ids and quantities but derives price and stock from database",
  { skip: !databaseUrl },
  async () => {
    const value = await fixture();
    try {
      const merged = await value.cart.merge(value.user.id, [
        { productId: value.productId, quantity: 2, unitPriceMinor: 1, currency: "GBP" },
      ]);
      assert.equal(merged.itemCount, 2);
      assert.equal(merged.totalIrr, 1_800_000);
      assert.equal(merged.lines[0].pricing.finalIrr, 900_000);
      assert.equal(merged.lines[0].currency, "IRR");
      assert.equal(merged.lines[0].availableQuantity, 5);

      const loaded = await value.cart.get(value.user.id);
      assert.equal(loaded.id, merged.id);
      assert.equal(loaded.lines[0].quantity, 2);

      await value.pool.query(
        "UPDATE products SET base_price_irr=2000000,discount_type='NONE',discount_value=0 WHERE id=$1",
        [value.productId],
      );
      const repriced = await value.cart.get(value.user.id);
      assert.equal(repriced.totalIrr, 4_000_000);
      assert.equal(repriced.lines[0].pricing.finalIrr, 2_000_000);
    } finally {
      await value.pool.end();
    }
  },
);

test(
  "PostgreSQL cart rejects unpublished products and keeps carts isolated per user",
  { skip: !databaseUrl },
  async () => {
    const value = await fixture();
    try {
      await value.cart.setLine(value.user.id, value.productId, 1);
      const second = await value.marketplace.register({
        email: `cart-second-${value.suffix}@example.com`,
        password: "very-secure-pass-123",
      });
      const otherCart = await value.cart.get(second.id);
      assert.equal(otherCart.itemCount, 0);

      const draftId = `draft-${value.suffix}`;
      await value.pool.query(
        "INSERT INTO products(id,title,slug,base_price_irr,status) VALUES($1,'Draft',$2,500000,'DRAFT')",
        [draftId, `draft-${value.suffix}`],
      );
      await value.pool.query(
        "INSERT INTO inventory(product_id,stock_on_hand,stock_reserved) VALUES($1,2,0)",
        [draftId],
      );
      await assert.rejects(
        () => value.cart.setLine(value.user.id, draftId, 1),
        /Published product not found/,
      );
    } finally {
      await value.pool.end();
    }
  },
);
