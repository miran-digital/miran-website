import assert from "node:assert/strict";
import test from "node:test";
import { startPostgresServer } from "../postgres/server.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

function originOf(server) {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unexpected server address");
  return `http://127.0.0.1:${address.port}`;
}

async function body(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function postJson(url, data, token = null) {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
}

test(
  "PostgreSQL HTTP checkout trusts product IDs and quantities but prices from the database",
  { skip: !databaseUrl },
  async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = databaseUrl;
    const runtime = await startPostgresServer({ port: 0, host: "127.0.0.1" });
    const origin = originOf(runtime.server);
    const suffix = Date.now().toString(36);
    try {
      const email = `checkout-http-${suffix}@example.com`;
      const register = await postJson(`${origin}/v1/auth/register`, {
        email,
        password: "very-secure-pass-123",
      });
      assert.equal(register.status, 201);
      const login = await postJson(`${origin}/v1/auth/login`, {
        email,
        password: "very-secure-pass-123",
      });
      assert.equal(login.status, 200);
      const session = await body(login);
      const token = session.token;

      const addressResponse = await postJson(
        `${origin}/v1/addresses`,
        {
          fullName: "Checkout Buyer",
          phone: "09120000000",
          province: "Tehran",
          city: "Tehran",
          addressLine: "Checkout street",
          postalCode: "1234567890",
          isDefault: true,
        },
        token,
      );
      const address = await body(addressResponse);
      assert.equal(addressResponse.status, 201);

      const productId = `http-product-${suffix}`;
      await runtime.pool.query(
        `INSERT INTO products
         (id,title,slug,base_price_irr,discount_type,discount_value,status,is_amazing)
         VALUES($1,'HTTP Product',$2,2000000,'PERCENTAGE',25,'PUBLISHED',TRUE)`,
        [productId, `http-product-${suffix}`],
      );
      await runtime.pool.query(
        "INSERT INTO inventory(product_id,stock_on_hand,stock_reserved) VALUES($1,3,0)",
        [productId],
      );

      const orderResponse = await postJson(
        `${origin}/v1/orders`,
        {
          addressId: address.id,
          idempotencyKey: `http-checkout-${suffix}`,
          items: [
            {
              productId,
              quantity: 2,
              clientPriceIrr: 1,
              currency: "GBP",
            },
          ],
          clientTotalIrr: 1,
        },
        token,
      );
      assert.equal(orderResponse.status, 201);
      const order = await body(orderResponse);
      assert.equal(order.status, "PENDING_PAYMENT");
      assert.equal(order.subtotalIrr, 4_000_000);
      assert.equal(order.discountIrr, 1_000_000);
      assert.equal(order.totalIrr, 3_000_000);

      const inventory = await runtime.pool.query(
        "SELECT stock_on_hand,stock_reserved FROM inventory WHERE product_id=$1",
        [productId],
      );
      assert.equal(inventory.rows[0].stock_on_hand, 3);
      assert.equal(inventory.rows[0].stock_reserved, 2);

      const history = await fetch(`${origin}/v1/orders`, {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(history.status, 200);
      const orders = await body(history);
      assert.ok(orders.some((item) => item.id === order.id));
    } finally {
      await runtime.close();
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  },
);
