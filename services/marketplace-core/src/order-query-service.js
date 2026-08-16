function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export class OrderQueryService {
  constructor(db) {
    this.db = db;
  }

  listMine(userId, { limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    return this.db
      .prepare(
        `SELECT id,status,subtotal_irr,discount_irr,total_irr,created_at,updated_at
         FROM orders
         WHERE user_id=?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(userId, safeLimit, safeOffset)
      .map((order) => this.summary(order));
  }

  getMine(userId, orderId) {
    const order = this.db
      .prepare(
        `SELECT o.*,a.label AS address_label,a.full_name,a.phone,a.province,a.city,a.address_line,a.postal_code
         FROM orders o
         JOIN addresses a ON a.id=o.address_id
         WHERE o.id=? AND o.user_id=?`,
      )
      .get(orderId, userId);
    if (!order) fail("Order not found", "NOT_FOUND");

    const items = this.db
      .prepare(
        `SELECT id,product_id,title_snapshot,unit_base_price_irr,unit_final_price_irr,quantity,line_total_irr
         FROM order_items
         WHERE order_id=?
         ORDER BY rowid ASC`,
      )
      .all(orderId)
      .map((item) => ({
        id: item.id,
        productId: item.product_id,
        title: item.title_snapshot,
        unitBasePriceIrr: Number(item.unit_base_price_irr),
        unitFinalPriceIrr: Number(item.unit_final_price_irr),
        quantity: Number(item.quantity),
        lineTotalIrr: Number(item.line_total_irr),
      }));

    const payments = this.db
      .prepare(
        `SELECT id,provider,amount_irr,status,authority,reference_id,created_at,updated_at
         FROM payments
         WHERE order_id=?
         ORDER BY created_at DESC`,
      )
      .all(orderId)
      .map((payment) => ({
        id: payment.id,
        provider: payment.provider,
        amountIrr: Number(payment.amount_irr),
        status: payment.status,
        authority: payment.authority,
        referenceId: payment.reference_id,
        createdAt: payment.created_at,
        updatedAt: payment.updated_at,
      }));

    return {
      ...this.summary(order),
      address: {
        label: order.address_label,
        fullName: order.full_name,
        phone: order.phone,
        province: order.province,
        city: order.city,
        addressLine: order.address_line,
        postalCode: order.postal_code,
      },
      items,
      payments,
    };
  }

  listManaged(actorId, { limit = 100, offset = 0, status = null } = {}) {
    const actor = this.db.prepare("SELECT role,status FROM users WHERE id=?").get(actorId);
    if (!actor || actor.status !== "ACTIVE" || actor.role !== "ADMIN") {
      fail("Admin role required", "FORBIDDEN");
    }
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
    const safeOffset = Math.max(0, Number(offset) || 0);
    if (status) {
      return this.db
        .prepare(
          `SELECT o.id,o.user_id,u.email,o.status,o.subtotal_irr,o.discount_irr,o.total_irr,o.created_at,o.updated_at
           FROM orders o JOIN users u ON u.id=o.user_id
           WHERE o.status=?
           ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
        )
        .all(String(status), safeLimit, safeOffset)
        .map((order) => ({ ...this.summary(order), userId: order.user_id, email: order.email }));
    }
    return this.db
      .prepare(
        `SELECT o.id,o.user_id,u.email,o.status,o.subtotal_irr,o.discount_irr,o.total_irr,o.created_at,o.updated_at
         FROM orders o JOIN users u ON u.id=o.user_id
         ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(safeLimit, safeOffset)
      .map((order) => ({ ...this.summary(order), userId: order.user_id, email: order.email }));
  }

  summary(order) {
    return {
      id: order.id,
      status: order.status,
      subtotalIrr: Number(order.subtotal_irr),
      discountIrr: Number(order.discount_irr),
      totalIrr: Number(order.total_irr),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
  }
}
