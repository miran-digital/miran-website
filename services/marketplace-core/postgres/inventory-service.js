import { randomUUID } from "node:crypto";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function assert(condition, message, code = "INVALID_INPUT") {
  if (!condition) fail(message, code);
}

function integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  assert(
    Number.isSafeInteger(number) && number >= min && number <= max,
    `${label} is invalid`,
  );
  return number;
}

/**
 * Logical owner for PostgreSQL inventory commands during Phase 2.
 *
 * The database remains physically shared for now, but reservation lifecycle and
 * stock mutations must flow through this class so Inventory can later be
 * extracted without teaching Checkout/Payment/Catalog about table internals.
 *
 * Methods that accept `client` are intentionally transaction-aware: callers
 * keep their order/payment transaction atomic while Inventory owns its writes.
 */
export class PostgresInventoryService {
  constructor(pool) {
    this.pool = pool;
  }

  async createProductInventory(client, productId, stockOnHand = 0) {
    const stock = integer(stockOnHand, "stock", { max: 2_000_000_000 });
    const result = await client.query(
      `INSERT INTO inventory(product_id,stock_on_hand,stock_reserved)
       VALUES($1,$2,0)
       RETURNING *`,
      [productId, stock],
    );
    return result.rows[0];
  }

  async lock(client, productId) {
    const result = await client.query(
      "SELECT * FROM inventory WHERE product_id=$1 FOR UPDATE",
      [productId],
    );
    const inventory = result.rows[0];
    assert(inventory, "Inventory not found", "NOT_FOUND");
    return inventory;
  }

  availableQuantity(inventory) {
    return Math.max(
      0,
      Number(inventory.stock_on_hand) - Number(inventory.stock_reserved),
    );
  }

  async assertAvailable(client, productId, quantity) {
    const requested = integer(quantity, "quantity", { min: 1, max: 1000 });
    const inventory = await this.lock(client, productId);
    assert(
      this.availableQuantity(inventory) >= requested,
      "Insufficient stock",
      "OUT_OF_STOCK",
    );
    return inventory;
  }

  async setStockOnHand(client, productId, stockOnHand) {
    const stock = integer(stockOnHand, "stock", { max: 2_000_000_000 });
    const current = await this.lock(client, productId);
    assert(
      stock >= Number(current.stock_reserved),
      "Stock cannot be lower than reserved quantity",
      "CONFLICT",
    );
    const updated = await client.query(
      `UPDATE inventory
       SET stock_on_hand=$1,version=version+1,updated_at=CURRENT_TIMESTAMP
       WHERE product_id=$2
       RETURNING *`,
      [stock, productId],
    );
    return updated.rows[0];
  }

  async reserve(client, { orderId, productId, quantity, expiresAt }) {
    const requested = integer(quantity, "quantity", { min: 1, max: 1000 });
    const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    assert(!Number.isNaN(expiry.getTime()), "Reservation expiry is invalid");

    const reserved = await client.query(
      `UPDATE inventory
       SET stock_reserved=stock_reserved+$1,
           version=version+1,
           updated_at=CURRENT_TIMESTAMP
       WHERE product_id=$2 AND stock_on_hand-stock_reserved >= $1
       RETURNING *`,
      [requested, productId],
    );
    assert(reserved.rowCount === 1, "Insufficient stock", "OUT_OF_STOCK");

    const reservation = await client.query(
      `INSERT INTO inventory_reservations
       (id,order_id,product_id,quantity,status,expires_at)
       VALUES($1,$2,$3,$4,'ACTIVE',$5)
       RETURNING *`,
      [randomUUID(), orderId, productId, requested, expiry],
    );
    return reservation.rows[0];
  }

  async lockActiveReservations(client, orderId) {
    const result = await client.query(
      `SELECT * FROM inventory_reservations
       WHERE order_id=$1 AND status='ACTIVE'
       ORDER BY product_id,id
       FOR UPDATE`,
      [orderId],
    );
    return result.rows;
  }

  async lockExpiredReservations(client, now = new Date()) {
    const at = now instanceof Date ? now : new Date(now);
    assert(!Number.isNaN(at.getTime()), "Maintenance time is invalid");
    const result = await client.query(
      `SELECT * FROM inventory_reservations
       WHERE status='ACTIVE' AND expires_at <= $1
       ORDER BY product_id,id
       FOR UPDATE`,
      [at],
    );
    return result.rows;
  }

  async extendActiveReservations(client, orderId, expiresAt) {
    const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    assert(!Number.isNaN(expiry.getTime()), "Reservation expiry is invalid");
    const result = await client.query(
      `UPDATE inventory_reservations
       SET expires_at=$1
       WHERE order_id=$2 AND status='ACTIVE'`,
      [expiry, orderId],
    );
    return result.rowCount;
  }

  async releaseReservations(client, reservations) {
    let released = 0;
    for (const reservation of reservations) {
      const quantity = integer(reservation.quantity, "reservation quantity", {
        min: 1,
        max: 2_000_000_000,
      });
      const updated = await client.query(
        `UPDATE inventory
         SET stock_reserved=stock_reserved-$1,
             version=version+1,
             updated_at=CURRENT_TIMESTAMP
         WHERE product_id=$2 AND stock_reserved >= $1`,
        [quantity, reservation.product_id],
      );
      assert(
        updated.rowCount === 1,
        "Inventory reservation invariant violated",
        "CONFLICT",
      );
      const marked = await client.query(
        `UPDATE inventory_reservations
         SET status='RELEASED'
         WHERE id=$1 AND status='ACTIVE'`,
        [reservation.id],
      );
      assert(
        marked.rowCount === 1,
        "Inventory reservation state changed before release",
        "CONFLICT",
      );
      released += 1;
    }
    return released;
  }

  async consumeReservations(client, reservations) {
    let consumed = 0;
    for (const reservation of reservations) {
      const quantity = integer(reservation.quantity, "reservation quantity", {
        min: 1,
        max: 2_000_000_000,
      });
      const updated = await client.query(
        `UPDATE inventory
         SET stock_on_hand=stock_on_hand-$1,
             stock_reserved=stock_reserved-$1,
             version=version+1,
             updated_at=CURRENT_TIMESTAMP
         WHERE product_id=$2
           AND stock_reserved >= $1
           AND stock_on_hand >= $1`,
        [quantity, reservation.product_id],
      );
      assert(updated.rowCount === 1, "Inventory invariant violated", "CONFLICT");
      const marked = await client.query(
        `UPDATE inventory_reservations
         SET status='CONSUMED'
         WHERE id=$1 AND status='ACTIVE'`,
        [reservation.id],
      );
      assert(
        marked.rowCount === 1,
        "Inventory reservation state changed before consume",
        "CONFLICT",
      );
      consumed += 1;
    }
    return consumed;
  }
}
