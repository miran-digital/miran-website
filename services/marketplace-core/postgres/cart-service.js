import { randomUUID } from "node:crypto";
import { withPostgresTransaction } from "./database.js";

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

function normalizeItems(items) {
  assert(Array.isArray(items), "Cart items must be an array");
  assert(items.length <= 100, "Cart contains too many lines");
  const combined = new Map();
  for (const item of items) {
    const productId = String(item?.productId || "").trim();
    const quantity = Number(item?.quantity);
    assert(productId, "Product id is required");
    assert(Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 1000, "Cart quantity is invalid");
    combined.set(productId, Math.min(1000, (combined.get(productId) || 0) + quantity));
  }
  return [...combined.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

export class PostgresCartService {
  constructor(pool) {
    this.pool = pool;
  }

  async ensureCart(userId, client = this.pool) {
    const existing = await client.query(
      "SELECT id FROM carts WHERE user_id=$1 AND status='ACTIVE' LIMIT 1",
      [userId],
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const id = randomUUID();
    const inserted = await client.query(
      `INSERT INTO carts(id,user_id,status)
       VALUES($1,$2,'ACTIVE')
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [id, userId],
    );
    if (inserted.rows[0]) return inserted.rows[0].id;

    const resolved = await client.query(
      "SELECT id FROM carts WHERE user_id=$1 AND status='ACTIVE' LIMIT 1",
      [userId],
    );
    assert(resolved.rows[0], "Active cart could not be resolved", "CONFLICT");
    return resolved.rows[0].id;
  }

  async get(userId, { now = new Date() } = {}) {
    const cartId = await this.ensureCart(userId);
    const result = await this.pool.query(
      `SELECT ci.product_id,ci.quantity,
              p.slug,p.title,p.status,p.base_price_irr,p.discount_type,p.discount_value,
              p.discount_starts_at,p.discount_ends_at,
              i.stock_on_hand,i.stock_reserved,
              media.url AS primary_image_url
       FROM cart_items ci
       JOIN products p ON p.id=ci.product_id
       JOIN inventory i ON i.product_id=p.id
       LEFT JOIN LATERAL (
         SELECT pm.url
         FROM product_media pm
         WHERE pm.product_id=p.id AND pm.media_type='IMAGE'
         ORDER BY pm.is_primary DESC,pm.sort_order ASC,pm.created_at ASC
         LIMIT 1
       ) media ON TRUE
       WHERE ci.cart_id=$1
       ORDER BY ci.created_at ASC,ci.product_id ASC`,
      [cartId],
    );

    let subtotalIrr = 0;
    let discountIrr = 0;
    let totalIrr = 0;
    let itemCount = 0;
    const lines = result.rows.map((row) => {
      const pricing = priceProduct(row, now);
      const availableQuantity = Math.max(0, Number(row.stock_on_hand) - Number(row.stock_reserved));
      const quantity = Number(row.quantity);
      const available = row.status === "PUBLISHED" && availableQuantity >= quantity;
      itemCount += quantity;
      subtotalIrr += pricing.baseIrr * quantity;
      discountIrr += pricing.discountIrr * quantity;
      totalIrr += pricing.finalIrr * quantity;
      return {
        productId: row.product_id,
        slug: row.slug,
        title: row.title,
        quantity,
        pricing,
        currency: "IRR",
        available,
        availableQuantity,
        primaryImageUrl: row.primary_image_url || null,
      };
    });

    return {
      id: cartId,
      lines,
      itemCount,
      subtotalIrr,
      discountIrr,
      totalIrr,
      currency: "IRR",
    };
  }

  async merge(userId, items) {
    const normalized = normalizeItems(items);
    if (normalized.length === 0) return this.get(userId);

    await withPostgresTransaction(this.pool, async (client) => {
      const cartId = await this.ensureCart(userId, client);
      for (const item of normalized) {
        const product = await client.query(
          "SELECT id FROM products WHERE id=$1 AND status='PUBLISHED'",
          [item.productId],
        );
        assert(product.rowCount === 1, "Published product not found", "NOT_FOUND");
        await client.query(
          `INSERT INTO cart_items(cart_id,product_id,quantity)
           VALUES($1,$2,$3)
           ON CONFLICT (cart_id,product_id)
           DO UPDATE SET quantity=LEAST(1000,cart_items.quantity+EXCLUDED.quantity),updated_at=CURRENT_TIMESTAMP`,
          [cartId, item.productId, item.quantity],
        );
      }
      await client.query("UPDATE carts SET updated_at=CURRENT_TIMESTAMP WHERE id=$1", [cartId]);
    });
    return this.get(userId);
  }

  async setLine(userId, productId, quantity) {
    const normalizedProductId = String(productId || "").trim();
    const normalizedQuantity = Number(quantity);
    assert(normalizedProductId, "Product id is required");
    assert(Number.isSafeInteger(normalizedQuantity) && normalizedQuantity >= 0 && normalizedQuantity <= 1000, "Cart quantity is invalid");

    await withPostgresTransaction(this.pool, async (client) => {
      const cartId = await this.ensureCart(userId, client);
      if (normalizedQuantity === 0) {
        await client.query("DELETE FROM cart_items WHERE cart_id=$1 AND product_id=$2", [cartId, normalizedProductId]);
      } else {
        const product = await client.query(
          "SELECT id FROM products WHERE id=$1 AND status='PUBLISHED'",
          [normalizedProductId],
        );
        assert(product.rowCount === 1, "Published product not found", "NOT_FOUND");
        await client.query(
          `INSERT INTO cart_items(cart_id,product_id,quantity)
           VALUES($1,$2,$3)
           ON CONFLICT (cart_id,product_id)
           DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=CURRENT_TIMESTAMP`,
          [cartId, normalizedProductId, normalizedQuantity],
        );
      }
      await client.query("UPDATE carts SET updated_at=CURRENT_TIMESTAMP WHERE id=$1", [cartId]);
    });
    return this.get(userId);
  }

  async removeLine(userId, productId) {
    return this.setLine(userId, productId, 0);
  }

  async clear(userId) {
    await withPostgresTransaction(this.pool, async (client) => {
      const cartId = await this.ensureCart(userId, client);
      await client.query("DELETE FROM cart_items WHERE cart_id=$1", [cartId]);
      await client.query("UPDATE carts SET updated_at=CURRENT_TIMESTAMP WHERE id=$1", [cartId]);
    });
    return this.get(userId);
  }
}
