import { randomUUID } from "node:crypto";
import { withPostgresTransaction } from "./database.js";
import { PostgresInventoryService } from "./inventory-service.js";
import { quoteShippingMethod } from "./logistics-service.js";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function assert(condition, message, code = "INVALID_INPUT") {
  if (!condition) fail(message, code);
}

function money(value, field = "money") {
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number >= 0, `${field} is invalid`);
  return number;
}

function priceProduct(row, at = new Date()) {
  const baseIrr = money(row.base_price_irr, "base price");
  const start = row.discount_starts_at ? new Date(row.discount_starts_at) : null;
  const end = row.discount_ends_at ? new Date(row.discount_ends_at) : null;
  const active = (!start || at >= start) && (!end || at < end);
  if (!active || row.discount_type === "NONE") {
    return { baseIrr, finalIrr: baseIrr, discountIrr: 0 };
  }
  const value = money(row.discount_value, "discount");
  let discountIrr = 0;
  if (row.discount_type === "PERCENTAGE") {
    assert(value <= 100, "Percentage discount cannot exceed 100");
    discountIrr = Math.floor((baseIrr * value) / 100);
  } else if (row.discount_type === "FIXED_IRR") {
    discountIrr = Math.min(baseIrr, value);
  }
  return {
    baseIrr,
    finalIrr: Math.max(0, baseIrr - discountIrr),
    discountIrr,
  };
}

function mapOrder(row) {
  return {
    id: row.id,
    userId: row.user_id,
    addressId: row.address_id,
    status: row.status,
    subtotalIrr: money(row.subtotal_irr, "subtotal"),
    discountIrr: money(row.discount_irr, "discount"),
    shippingIrr: money(row.shipping_irr || 0, "shipping"),
    totalIrr: money(row.total_irr, "total"),
    shippingMethodCode: row.shipping_method_code || null,
    shippingMethodName: row.shipping_method_name || null,
  };
}

export class PostgresCheckoutService {
  constructor(
    pool,
    marketplace,
    cart,
    { reservationMinutes = 30, inventory = new PostgresInventoryService(pool) } = {},
  ) {
    this.pool = pool;
    this.marketplace = marketplace;
    this.cart = cart;
    this.inventory = inventory;
    this.reservationMinutes = reservationMinutes;
  }

  async createOrderFromCart(
    userId,
    { addressId, shippingMethodCode, idempotencyKey, now = new Date() },
  ) {
    assert(String(idempotencyKey || "").length >= 8, "Idempotency key is required");
    assert(String(addressId || "").trim(), "Address is required");
    assert(String(shippingMethodCode || "").trim(), "Shipping method is required");
    await this.marketplace.releaseExpiredReservations(now);

    return withPostgresTransaction(this.pool, async (client) => {
      const existing = await client.query(
        "SELECT * FROM orders WHERE user_id=$1 AND idempotency_key=$2",
        [userId, String(idempotencyKey)],
      );
      if (existing.rows[0]) return mapOrder(existing.rows[0]);

      const address = await client.query(
        "SELECT id FROM addresses WHERE id=$1 AND user_id=$2",
        [addressId, userId],
      );
      assert(address.rowCount === 1, "Address not found", "NOT_FOUND");

      const cartResult = await client.query(
        "SELECT id FROM carts WHERE user_id=$1 AND status='ACTIVE' LIMIT 1 FOR UPDATE",
        [userId],
      );
      const cartId = cartResult.rows[0]?.id;
      assert(cartId, "Cart is empty", "CONFLICT");

      const items = await client.query(
        `SELECT ci.product_id,ci.quantity
         FROM cart_items ci
         WHERE ci.cart_id=$1
         ORDER BY ci.product_id ASC
         FOR UPDATE`,
        [cartId],
      );
      assert(items.rowCount > 0, "Cart is empty", "CONFLICT");
      assert(items.rowCount <= 100, "Cart contains too many lines");

      let subtotalIrr = 0;
      let discountIrr = 0;
      let merchandiseTotalIrr = 0;
      const lines = [];

      for (const item of items.rows) {
        const quantity = Number(item.quantity);
        assert(
          Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 1000,
          "Cart quantity is invalid",
        );
        const locked = await client.query(
          `SELECT p.*
           FROM products p
           WHERE p.id=$1 AND p.status='PUBLISHED'
           FOR UPDATE`,
          [item.product_id],
        );
        const product = locked.rows[0];
        assert(product, "Published product not found", "NOT_FOUND");
        await this.inventory.assertAvailable(client, product.id, quantity);
        const pricing = priceProduct(product, now);
        subtotalIrr += pricing.baseIrr * quantity;
        discountIrr += pricing.discountIrr * quantity;
        merchandiseTotalIrr += pricing.finalIrr * quantity;
        assert(
          Number.isSafeInteger(subtotalIrr) &&
            Number.isSafeInteger(discountIrr) &&
            Number.isSafeInteger(merchandiseTotalIrr),
          "Order total exceeds supported integer range",
        );
        lines.push({ product, pricing, quantity });
      }

      const shipping = await quoteShippingMethod(client, {
        userId,
        addressId,
        methodCode: shippingMethodCode,
        merchandiseTotalIrr,
      });
      const totalIrr = merchandiseTotalIrr + shipping.shippingIrr;
      assert(Number.isSafeInteger(totalIrr), "Order total exceeds supported integer range");

      const orderId = randomUUID();
      const inserted = await client.query(
        `INSERT INTO orders
         (id,user_id,address_id,idempotency_key,status,subtotal_irr,discount_irr,total_irr,
          shipping_method_code,shipping_method_name,shipping_irr)
         VALUES($1,$2,$3,$4,'PENDING_PAYMENT',$5,$6,$7,$8,$9,$10)
         ON CONFLICT (user_id,idempotency_key) DO NOTHING
         RETURNING *`,
        [
          orderId,
          userId,
          addressId,
          String(idempotencyKey),
          subtotalIrr,
          discountIrr,
          totalIrr,
          shipping.code,
          shipping.name,
          shipping.shippingIrr,
        ],
      );
      if (!inserted.rows[0]) {
        const duplicate = await client.query(
          "SELECT * FROM orders WHERE user_id=$1 AND idempotency_key=$2",
          [userId, String(idempotencyKey)],
        );
        assert(duplicate.rows[0], "Idempotent order could not be resolved", "CONFLICT");
        return mapOrder(duplicate.rows[0]);
      }

      const expiresAt = new Date(now.getTime() + this.reservationMinutes * 60_000);
      for (const line of lines) {
        await this.inventory.reserve(client, {
          orderId,
          productId: line.product.id,
          quantity: line.quantity,
          expiresAt,
        });
        await client.query(
          `INSERT INTO order_items
           (id,order_id,product_id,title_snapshot,unit_base_price_irr,unit_final_price_irr,quantity,line_total_irr)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            randomUUID(),
            orderId,
            line.product.id,
            line.product.title,
            line.pricing.baseIrr,
            line.pricing.finalIrr,
            line.quantity,
            line.pricing.finalIrr * line.quantity,
          ],
        );
      }

      await client.query(
        `INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,details_json)
         VALUES($1,$2,'ORDER_CREATED_FROM_CART','ORDER',$3,$4)`,
        [
          randomUUID(),
          userId,
          orderId,
          JSON.stringify({
            subtotalIrr,
            discountIrr,
            merchandiseTotalIrr,
            shippingIrr: shipping.shippingIrr,
            totalIrr,
            shippingMethodCode: shipping.code,
            cartId,
          }),
        ],
      );
      return mapOrder(inserted.rows[0]);
    });
  }
}
