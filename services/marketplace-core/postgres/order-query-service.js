function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function assert(condition, message, code = "INVALID_INPUT") {
  if (!condition) fail(message, code);
}

function safeLimit(value, fallback, max = 100) {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number)) return fallback;
  return Math.max(1, Math.min(max, number));
}

function safeOffset(value) {
  const number = Number(value ?? 0);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function money(value) {
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number >= 0, "Invalid stored monetary value", "CONFLICT");
  return number;
}

function mapSummary(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email ?? null,
    addressId: row.address_id,
    status: row.status,
    subtotalIrr: money(row.subtotal_irr),
    discountIrr: money(row.discount_irr),
    totalIrr: money(row.total_irr),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapItem(row) {
  return {
    id: row.id,
    productId: row.product_id,
    title: row.title_snapshot,
    unitBasePriceIrr: money(row.unit_base_price_irr),
    unitFinalPriceIrr: money(row.unit_final_price_irr),
    quantity: Number(row.quantity),
    lineTotalIrr: money(row.line_total_irr),
  };
}

export class PostgresOrderQueryService {
  constructor(pool) {
    this.pool = pool;
  }

  async requireAdmin(actorId) {
    const result = await this.pool.query(
      "SELECT role,status FROM users WHERE id=$1",
      [actorId],
    );
    const actor = result.rows[0];
    assert(actor && actor.status === "ACTIVE" && actor.role === "ADMIN", "Admin role required", "FORBIDDEN");
  }

  async itemsForOrder(orderId) {
    const result = await this.pool.query(
      `SELECT id,product_id,title_snapshot,unit_base_price_irr,
              unit_final_price_irr,quantity,line_total_irr
       FROM order_items
       WHERE order_id=$1
       ORDER BY id ASC`,
      [orderId],
    );
    return result.rows.map(mapItem);
  }

  async listMine(userId, options = {}) {
    const limit = safeLimit(options.limit, 50, 100);
    const offset = safeOffset(options.offset);
    const result = await this.pool.query(
      `SELECT * FROM orders
       WHERE user_id=$1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return Promise.all(
      result.rows.map(async (row) => ({
        ...mapSummary(row),
        items: await this.itemsForOrder(row.id),
      })),
    );
  }

  async getMine(userId, orderId) {
    const result = await this.pool.query(
      "SELECT * FROM orders WHERE id=$1 AND user_id=$2",
      [orderId, userId],
    );
    const row = result.rows[0];
    assert(row, "Order not found", "NOT_FOUND");
    return { ...mapSummary(row), items: await this.itemsForOrder(row.id) };
  }

  async listManaged(adminId, options = {}) {
    await this.requireAdmin(adminId);
    const limit = safeLimit(options.limit, 100, 200);
    const offset = safeOffset(options.offset);
    const status = options.status ? String(options.status).toUpperCase() : "";
    if (status) {
      assert(
        ["PENDING_PAYMENT", "PAID", "CANCELLED", "PAYMENT_FAILED"].includes(status),
        "Invalid order status filter",
      );
    }
    const values = [];
    let filter = "";
    if (status) {
      values.push(status);
      filter = `WHERE o.status=$${values.length}`;
    }
    values.push(limit, offset);
    const result = await this.pool.query(
      `SELECT o.*,u.email AS user_email
       FROM orders o
       JOIN users u ON u.id=o.user_id
       ${filter}
       ORDER BY o.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return Promise.all(
      result.rows.map(async (row) => ({
        ...mapSummary(row),
        items: await this.itemsForOrder(row.id),
      })),
    );
  }
}
