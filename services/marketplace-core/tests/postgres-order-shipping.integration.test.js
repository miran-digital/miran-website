import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PostgresCartService } from "../postgres/cart-service.js";
import { PostgresCheckoutService } from "../postgres/checkout-service.js";
import { migratePostgres, openPostgresPool } from "../postgres/database.js";
import { PostgresLogisticsService } from "../postgres/logistics-service.js";
import { PostgresMarketplaceService } from "../postgres/marketplace-service.js";
import { PostgresOrderQueryService } from "../postgres/order-query-service.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

test(
  "order history keeps shipping snapshot after shipping method changes",
  { skip: !databaseUrl },
  async () => {
    const pool = openPostgresPool({ connectionString: databaseUrl, max: 6, applicationName: "miran-order-shipping-test" });
    try {
      await migratePostgres(pool);
      const marketplace = new PostgresMarketplaceService(pool);
      const cart = new PostgresCartService(pool);
      const logistics = new PostgresLogisticsService(pool);
      const checkout = new PostgresCheckoutService(pool, marketplace, cart);
      const orders = new PostgresOrderQueryService(pool);
      const suffix = randomUUID().replaceAll("-", "");
      const buyer = await marketplace.register({
        email: `order-shipping-${suffix}@example.com`,
        password: "very-secure-pass-123",
      });
      const admin = await marketplace.register({
        email: `order-shipping-admin-${suffix}@example.com`,
        password: "very-secure-pass-123",
      });
      await pool.query("UPDATE users SET role='ADMIN' WHERE id=$1", [admin.id]);
      const address = await marketplace.addAddress(buyer.id, {
        fullName: "Snapshot Buyer",
        phone: "09120000000",
        province: "Tehran",
        city: "Tehran",
        addressLine: "Snapshot street",
        postalCode: "1234567890",
        isDefault: true,
      });
      const productId = `snapshot-product-${suffix}`;
      await pool.query(
        "INSERT INTO products(id,title,slug,base_price_irr,status) VALUES($1,'Snapshot Product',$2,2000000,'PUBLISHED')",
        [productId, `snapshot-product-${suffix}`],
      );
      await pool.query(
        "INSERT INTO inventory(product_id,stock_on_hand,stock_reserved) VALUES($1,2,0)",
        [productId],
      );
      const method = await logistics.create(admin.id, {
        code: `SNAP_${suffix.slice(0, 10)}`,
        name: "ارسال اولیه",
        priceIrr: 300_000,
      });
      await cart.setLine(buyer.id, productId, 1);
      const order = await checkout.createOrderFromCart(buyer.id, {
        addressId: address.id,
        shippingMethodCode: method.code,
        idempotencyKey: `snapshot-${suffix}`,
      });

      await logistics.update(admin.id, method.id, { name: "ارسال تغییر یافته", priceIrr: 900_000 });
      const detail = await orders.getMine(buyer.id, order.id);
      assert.equal(detail.shippingMethodName, "ارسال اولیه");
      assert.equal(detail.shippingIrr, 300_000);
      assert.equal(detail.totalIrr, 2_300_000);
      assert.equal(detail.address.fullName, "Snapshot Buyer");
      assert.deepEqual(detail.payments, []);
    } finally {
      await pool.end();
    }
  },
);
