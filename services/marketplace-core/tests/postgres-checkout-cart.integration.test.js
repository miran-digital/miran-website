import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PostgresCartService } from "../postgres/cart-service.js";
import { PostgresCheckoutService } from "../postgres/checkout-service.js";
import { migratePostgres, openPostgresPool } from "../postgres/database.js";
import { PostgresLogisticsService } from "../postgres/logistics-service.js";
import { PostgresMarketplaceService } from "../postgres/marketplace-service.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

async function fixture() {
  if (!databaseUrl) throw new Error("POSTGRES_TEST_DATABASE_URL is required");
  const pool = openPostgresPool({ connectionString: databaseUrl, max: 6, applicationName: "miran-checkout-cart-test" });
  await migratePostgres(pool);
  const marketplace = new PostgresMarketplaceService(pool, { reservationMinutes: 15 });
  const cart = new PostgresCartService(pool);
  const logistics = new PostgresLogisticsService(pool);
  const checkout = new PostgresCheckoutService(pool, marketplace, cart, { reservationMinutes: 15 });
  const suffix = randomUUID().replaceAll("-", "");
  const customer = await marketplace.register({
    email: `checkout-cart-${suffix}@example.com`,
    password: "very-secure-pass-123",
  });
  const admin = await marketplace.register({
    email: `checkout-admin-${suffix}@example.com`,
    password: "very-secure-pass-123",
  });
  await pool.query("UPDATE users SET role='ADMIN' WHERE id=$1", [admin.id]);
  const address = await marketplace.addAddress(customer.id, {
    fullName: "Checkout Buyer",
    phone: "09120000000",
    province: "Tehran",
    city: "Tehran",
    addressLine: "Checkout street",
    postalCode: "1234567890",
    isDefault: true,
  });
  const productId = `checkout-cart-product-${suffix}`;
  await pool.query(
    `INSERT INTO products
     (id,title,slug,base_price_irr,discount_type,discount_value,status)
     VALUES($1,'Checkout Cart Product',$2,5000000,'PERCENTAGE',20,'PUBLISHED')`,
    [productId, `checkout-cart-product-${suffix}`],
  );
  await pool.query(
    "INSERT INTO inventory(product_id,stock_on_hand,stock_reserved) VALUES($1,3,0)",
    [productId],
  );
  const shipping = await logistics.create(admin.id, {
    code: `FAST_${suffix.slice(0, 10)}`,
    name: "ارسال سریع",
    priceIrr: 600_000,
    minDeliveryDays: 1,
    maxDeliveryDays: 2,
  });
  return { pool, marketplace, cart, logistics, checkout, customer, admin, address, productId, shipping, suffix };
}

test(
  "PostgreSQL checkout creates order from persistent cart with authoritative shipping and reserves inventory",
  { skip: !databaseUrl },
  async () => {
    const value = await fixture();
    try {
      await value.cart.merge(value.customer.id, [
        { productId: value.productId, quantity: 2, unitPriceMinor: 1, currency: "GBP" },
      ]);
      const order = await value.checkout.createOrderFromCart(value.customer.id, {
        addressId: value.address.id,
        shippingMethodCode: value.shipping.code,
        idempotencyKey: `cart-checkout-${value.suffix}`,
      });

      assert.equal(order.subtotalIrr, 10_000_000);
      assert.equal(order.discountIrr, 2_000_000);
      assert.equal(order.shippingIrr, 600_000);
      assert.equal(order.totalIrr, 8_600_000);
      assert.equal(order.shippingMethodCode, value.shipping.code);
      assert.equal(order.shippingMethodName, "ارسال سریع");

      const inventory = await value.pool.query(
        "SELECT stock_on_hand,stock_reserved FROM inventory WHERE product_id=$1",
        [value.productId],
      );
      assert.equal(inventory.rows[0].stock_on_hand, 3);
      assert.equal(inventory.rows[0].stock_reserved, 2);

      const stored = await value.pool.query(
        "SELECT shipping_method_code,shipping_method_name,shipping_irr,total_irr FROM orders WHERE id=$1",
        [order.id],
      );
      assert.equal(stored.rows[0].shipping_method_code, value.shipping.code);
      assert.equal(stored.rows[0].shipping_irr, 600_000);
      assert.equal(stored.rows[0].total_irr, 8_600_000);

      const repeated = await value.checkout.createOrderFromCart(value.customer.id, {
        addressId: value.address.id,
        shippingMethodCode: value.shipping.code,
        idempotencyKey: `cart-checkout-${value.suffix}`,
      });
      assert.equal(repeated.id, order.id);
      const reservationCount = await value.pool.query(
        "SELECT COUNT(*)::int AS count FROM inventory_reservations WHERE order_id=$1",
        [order.id],
      );
      assert.equal(reservationCount.rows[0].count, 1);
    } finally {
      await value.pool.end();
    }
  },
);

test(
  "PostgreSQL checkout blocks oversell from persistent carts",
  { skip: !databaseUrl },
  async () => {
    const value = await fixture();
    try {
      await value.cart.setLine(value.customer.id, value.productId, 3);
      const first = await value.checkout.createOrderFromCart(value.customer.id, {
        addressId: value.address.id,
        shippingMethodCode: value.shipping.code,
        idempotencyKey: `checkout-full-${value.suffix}`,
      });
      assert.equal(first.status, "PENDING_PAYMENT");

      const secondUser = await value.marketplace.register({
        email: `checkout-second-${value.suffix}@example.com`,
        password: "very-secure-pass-123",
      });
      const secondAddress = await value.marketplace.addAddress(secondUser.id, {
        fullName: "Second Buyer",
        phone: "09120000001",
        province: "Tehran",
        city: "Tehran",
        addressLine: "Second street",
        postalCode: "1234567891",
        isDefault: true,
      });
      await value.cart.setLine(secondUser.id, value.productId, 1);
      await assert.rejects(
        () => value.checkout.createOrderFromCart(secondUser.id, {
          addressId: secondAddress.id,
          shippingMethodCode: value.shipping.code,
          idempotencyKey: `checkout-over-${value.suffix}`,
        }),
        /Insufficient stock/,
      );
    } finally {
      await value.pool.end();
    }
  },
);

test(
  "paid order removes only purchased quantity from current active cart",
  { skip: !databaseUrl },
  async () => {
    const value = await fixture();
    try {
      await value.cart.setLine(value.customer.id, value.productId, 2);
      const order = await value.checkout.createOrderFromCart(value.customer.id, {
        addressId: value.address.id,
        shippingMethodCode: value.shipping.code,
        idempotencyKey: `checkout-cleanup-${value.suffix}`,
      });

      await value.cart.setLine(value.customer.id, value.productId, 3);
      await value.pool.query(
        "UPDATE orders SET status='PAID',updated_at=CURRENT_TIMESTAMP WHERE id=$1",
        [order.id],
      );

      const cart = await value.cart.get(value.customer.id);
      assert.equal(cart.lines.length, 1);
      assert.equal(cart.lines[0].quantity, 1);
    } finally {
      await value.pool.end();
    }
  },
);
