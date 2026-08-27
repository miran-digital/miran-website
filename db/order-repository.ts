import type {
  DeliveryMethod,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  StoreOrder,
} from "../features/orders/order-types.ts";
import { getRuntimeEnv } from "../lib/runtime-env.ts";

export type ValidatedOrderLine = {
  productId: string;
  variantId: string;
  sellerOfferId: string;
  selectionLabel: string;
  slug: string;
  sku: string;
  title: string;
  quantity: number;
  unitPriceMinor: number;
};

export type CreateOrderInput = {
  idempotencyKey: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  addressSourceId: string;
  addressLabel: string;
  addressLine: string;
  city: string;
  province: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
  deliveryMethod: DeliveryMethod;
  currency: string;
  deliveryMinor: number;
  reservationMinutes: number;
  lines: ValidatedOrderLine[];
};

type OrderRow = {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  reservation_expires_at: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  address_source_id: string;
  address_label: string;
  address_line: string;
  city: string;
  province: string;
  postcode: string;
  latitude_e6: number | null;
  longitude_e6: number | null;
  delivery_method: DeliveryMethod;
  currency: string;
  subtotal_minor: number;
  delivery_minor: number;
  total_minor: number;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string;
  seller_offer_id: string;
  selection_label: string;
  slug: string;
  sku: string;
  title: string;
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
};

type InventoryItemRow = Pick<
  ItemRow,
  "product_id" | "variant_id" | "seller_offer_id" | "quantity"
>;

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["packing", "cancelled"],
  packing: ["shipped", "cancelled"],
  shipped: [],
  cancelled: [],
  expired: [],
};

export async function createOrderRecord(
  input: CreateOrderInput,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  await releaseExpiredReservations(database);
  const existing = await database
    .prepare(
      "SELECT id FROM orders WHERE idempotency_key = ? AND customer_email = ? LIMIT 1",
    )
    .bind(input.idempotencyKey, input.customerEmail.toLowerCase())
    .first<{ id: string }>();
  if (existing) return getOrderById(existing.id, database);

  const subtotalMinor = input.lines.reduce(
    (sum, line) => sum + line.unitPriceMinor * line.quantity,
    0,
  );
  const id = crypto.randomUUID();
  const orderNumber = makeOrderNumber();
  const reservationExpiresAt = new Date(
    Date.now() + Math.max(5, Math.min(120, input.reservationMinutes)) * 60_000,
  ).toISOString();
  const statements = [
    database
      .prepare(
        `INSERT INTO orders (
           id, order_number, idempotency_key, status, payment_status,
           reservation_expires_at, customer_name, customer_email,
           customer_phone, address_source_id, address_label, address_line, city,
           province, postcode, latitude_e6, longitude_e6, delivery_method,
           currency, subtotal_minor, delivery_minor, total_minor, created_at,
           updated_at
         ) VALUES (?, ?, ?, 'new', 'not_collected', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .bind(
        id,
        orderNumber,
        input.idempotencyKey,
        reservationExpiresAt,
        input.customerName,
        input.customerEmail.toLowerCase(),
        input.customerPhone,
        input.addressSourceId,
        input.addressLabel,
        input.addressLine,
        input.city,
        input.province,
        input.postcode,
        coordinateToInteger(input.latitude),
        coordinateToInteger(input.longitude),
        input.deliveryMethod,
        input.currency,
        subtotalMinor,
        input.deliveryMinor,
        subtotalMinor + input.deliveryMinor,
      ),
    ...input.lines.flatMap((line) => inventoryReservationStatements(database, id, line)),
    database
      .prepare(
        `INSERT INTO admin_audit_log (actor_email, action, subject_id)
         VALUES (?, ?, ?)`,
      )
      .bind(input.customerEmail.toLowerCase(), "order.created", id),
  ];
  let batchResults: D1Result<unknown>[];
  try {
    batchResults = await database.batch(statements);
  } catch (error) {
    const raced = await database
      .prepare(
        "SELECT id FROM orders WHERE idempotency_key = ? AND customer_email = ? LIMIT 1",
      )
      .bind(input.idempotencyKey, input.customerEmail.toLowerCase())
      .first<{ id: string }>();
    if (raced) return getOrderById(raced.id, database);
    throw error;
  }
  const order = await getOrderById(id, database);
  const inventoryResults = batchResults.slice(1, 1 + input.lines.length * 2);
  const reservationFailed = input.lines.some((_, index) =>
    getChangedRows(inventoryResults[index * 2]) !== 1 ||
    getChangedRows(inventoryResults[index * 2 + 1]) !== 1
  );
  if (reservationFailed || order.items.length !== input.lines.length) {
    await rollbackIncompleteOrder(database, id);
    throw new Error("OUT_OF_STOCK");
  }
  return order;
}

export async function listCustomerOrders(
  customerEmail: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const email = customerEmail.trim().toLowerCase();
  await releaseExpiredReservations(database);
  const [orderResult, itemResult] = await Promise.all([
    database
      .prepare(
        `SELECT id, order_number, status, payment_status,
                reservation_expires_at, customer_name, customer_email,
                customer_phone, address_source_id, address_label, address_line,
                city, province, postcode, latitude_e6, longitude_e6,
                delivery_method, currency, subtotal_minor, delivery_minor,
                total_minor, created_at, updated_at
           FROM orders
          WHERE customer_email = ?
          ORDER BY created_at DESC
          LIMIT 50`,
      )
      .bind(email)
      .all<OrderRow>(),
    database
      .prepare(
        `SELECT id, order_id, product_id, variant_id, seller_offer_id,
                selection_label, slug, sku, title, quantity, unit_price_minor,
                line_total_minor
           FROM order_items
          WHERE order_id IN (
            SELECT id FROM orders WHERE customer_email = ?
            ORDER BY created_at DESC LIMIT 50
          )
          ORDER BY rowid ASC
          LIMIT 1000`,
      )
      .bind(email)
      .all<ItemRow>(),
  ]);
  const itemsByOrder = groupItems(itemResult.results);
  return orderResult.results.map((row) =>
    mapOrder(row, itemsByOrder.get(row.id) ?? []),
  );
}

export async function listOrders() {
  const database = await requireDatabase();
  await releaseExpiredReservations(database);
  const [orderResult, itemResult] = await Promise.all([
    database
      .prepare(
        `SELECT id, order_number, status, payment_status,
                reservation_expires_at, customer_name, customer_email,
                customer_phone, address_source_id, address_label, address_line,
                city, province, postcode, latitude_e6, longitude_e6,
                delivery_method, currency, subtotal_minor, delivery_minor, total_minor,
                created_at, updated_at
           FROM orders
          ORDER BY created_at DESC
          LIMIT 250`,
      )
      .all<OrderRow>(),
    database
      .prepare(
        `SELECT id, order_id, product_id, variant_id, seller_offer_id,
                selection_label, slug, sku, title, quantity, unit_price_minor,
                line_total_minor
           FROM order_items
          ORDER BY rowid ASC
          LIMIT 5000`,
      )
      .all<ItemRow>(),
  ]);
  const itemsByOrder = groupItems(itemResult.results);
  return orderResult.results.map((row) =>
    mapOrder(row, itemsByOrder.get(row.id) ?? []),
  );
}

export async function updateOrderStatus(
  id: string,
  nextStatus: OrderStatus,
  actorEmail: string,
) {
  const database = await requireDatabase();
  await releaseExpiredReservations(database);
  const current = await database
    .prepare("SELECT status FROM orders WHERE id = ? LIMIT 1")
    .bind(id)
    .first<{ status: OrderStatus }>();
  if (!current) throw new Error("ORDER_NOT_FOUND");
  if (!transitions[current.status].includes(nextStatus)) {
    throw new Error("INVALID_TRANSITION");
  }
  const itemResult = await database
    .prepare(
      `SELECT product_id, variant_id, seller_offer_id, quantity
         FROM order_items WHERE order_id = ?`,
    )
    .bind(id)
    .all<InventoryItemRow>();

  const inventoryStatements = itemResult.results.map((item) =>
    inventoryReleaseStatement(database, item, nextStatus === "shipped"),
  );

  await database.batch([
    ...(nextStatus === "cancelled" || nextStatus === "shipped"
      ? inventoryStatements
      : []),
    database
      .prepare(
        `UPDATE orders
            SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      )
      .bind(nextStatus, id),
    database
      .prepare(
        `INSERT INTO admin_audit_log (actor_email, action, subject_id)
         VALUES (?, ?, ?)`,
      )
      .bind(actorEmail, `order.${nextStatus}`, id),
  ]);
  return getOrderById(id, database);
}

export async function getOrderReceiptStorageKeys(
  id: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const result = await database
    .prepare("SELECT storage_key FROM bank_transfer_receipts WHERE order_id = ?")
    .bind(id)
    .all<{ storage_key: string }>();
  return result.results.map((row) => row.storage_key);
}

export async function deleteOrderRecord(
  id: string,
  actorEmail: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const current = await database
    .prepare("SELECT id, status FROM orders WHERE id = ? LIMIT 1")
    .bind(id)
    .first<{ id: string; status: OrderStatus }>();
  if (!current) throw new Error("ORDER_NOT_FOUND");
  const items = await database
    .prepare(
      `SELECT product_id, variant_id, seller_offer_id, quantity
         FROM order_items WHERE order_id = ?`,
    )
    .bind(id)
    .all<InventoryItemRow>();
  const reservationIsHeld = ["new", "confirmed", "packing"].includes(current.status);
  await database.batch([
    ...(reservationIsHeld
      ? items.results.map((item) => inventoryReleaseStatement(database, item, false))
      : []),
    database.prepare("UPDATE support_tickets SET order_id = '', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?").bind(id),
    database.prepare("DELETE FROM product_reviews WHERE order_id = ?").bind(id),
    database.prepare("DELETE FROM bank_transfer_receipts WHERE order_id = ?").bind(id),
    database.prepare("DELETE FROM payment_attempts WHERE order_id = ?").bind(id),
    database.prepare("DELETE FROM order_items WHERE order_id = ?").bind(id),
    database.prepare("DELETE FROM orders WHERE id = ?").bind(id),
    database
      .prepare("INSERT INTO admin_audit_log (actor_email, action, subject_id) VALUES (?, 'order.deleted', ?)")
      .bind(actorEmail.trim().toLowerCase(), id),
  ]);
  return { deleted: true as const };
}

export async function getOrderByNumberForPayment(
  orderNumber: string,
  customerEmail: string,
) {
  const database = await requireDatabase();
  await releaseExpiredReservations(database);
  const row = await database
    .prepare(
      `SELECT id FROM orders
        WHERE order_number = ? AND customer_email = ?
        LIMIT 1`,
    )
    .bind(orderNumber, customerEmail.toLowerCase())
    .first<{ id: string }>();
  return row ? getOrderById(row.id, database) : null;
}

export async function recordPaymentAttempt(input: {
  orderId: string;
  provider: string;
  amountMinor: number;
  authority?: string;
  status?: "pending" | "failed";
}, databaseOverride?: D1Database) {
  const database = databaseOverride ?? await requireDatabase();
  const id = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO payment_attempts
         (id, order_id, provider, authority, status, amount_minor)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.orderId,
      input.provider,
      input.authority ?? "",
      input.status ?? "pending",
      input.amountMinor,
    )
    .run();
  return id;
}

export async function getReusablePendingPaymentAttempt(
  orderId: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  await database
    .prepare(
      `UPDATE payment_attempts
          SET status = 'failed', updated_at = CURRENT_TIMESTAMP
        WHERE order_id = ? AND status = 'pending' AND authority = ''
          AND created_at <= datetime('now', '-5 minutes')`,
    )
    .bind(orderId)
    .run();
  return database
    .prepare(
      `SELECT id, authority
         FROM payment_attempts
        WHERE order_id = ? AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    .bind(orderId)
    .first<{ id: string; authority: string }>();
}

export async function updatePaymentAuthority(
  attemptId: string,
  authority: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  await database.batch([
    database
      .prepare(
        `UPDATE payment_attempts
            SET authority = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      )
      .bind(authority, attemptId),
    database
      .prepare(
        `UPDATE orders
            SET payment_status = 'pending', updated_at = CURRENT_TIMESTAMP
          WHERE id = (
            SELECT order_id FROM payment_attempts WHERE id = ? LIMIT 1
          ) AND status = 'new'`,
      )
      .bind(attemptId),
  ]);
}

export async function getPaymentAttemptForCallback(
  authority: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  return database
    .prepare(
      `SELECT pa.id, pa.order_id, pa.amount_minor, pa.status,
              pa.provider_reference, o.order_number, o.payment_status
         FROM payment_attempts pa
         JOIN orders o ON o.id = pa.order_id
        WHERE pa.authority = ?
        ORDER BY pa.created_at DESC
        LIMIT 1`,
    )
    .bind(authority)
    .first<{
      id: string;
      order_id: string;
      amount_minor: number;
      status: "pending" | "paid" | "failed";
      provider_reference: string;
      order_number: string;
      payment_status: PaymentStatus;
    }>();
}

export async function completePayment(input: {
  authority: string;
  providerReference: string;
}, databaseOverride?: D1Database) {
  const database = databaseOverride ?? await requireDatabase();
  const attempt = await database
    .prepare(
      `SELECT id, order_id, status FROM payment_attempts
        WHERE authority = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(input.authority)
    .first<{ id: string; order_id: string; status: string }>();
  if (!attempt) throw new Error("PAYMENT_ATTEMPT_NOT_FOUND");
  if (attempt.status === "paid") return getOrderById(attempt.order_id, database);
  if (attempt.status !== "pending") throw new Error("PAYMENT_ATTEMPT_NOT_PENDING");
  await database.batch([
    database
      .prepare(
        `UPDATE payment_attempts
            SET status = 'paid', provider_reference = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      )
      .bind(input.providerReference, attempt.id),
    database
      .prepare(
        `UPDATE orders
            SET payment_status = 'paid', status = 'confirmed',
                reservation_expires_at = '', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'new'`,
      )
      .bind(attempt.order_id),
    database
      .prepare(
        `INSERT OR IGNORE INTO admin_audit_log (actor_email, action, subject_id)
         VALUES ('payment-provider', 'order.paid', ?)`,
      )
      .bind(attempt.order_id),
  ]);
  return getOrderById(attempt.order_id, database);
}

export async function failPaymentAttempt(
  authority: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  await database.batch([
    database
      .prepare(
        `UPDATE orders
            SET payment_status = 'failed', updated_at = CURRENT_TIMESTAMP
          WHERE id = (
            SELECT order_id FROM payment_attempts
             WHERE authority = ? AND status = 'pending' LIMIT 1
          ) AND status = 'new'`,
      )
      .bind(authority),
    database
      .prepare(
        `UPDATE payment_attempts
            SET status = 'failed', updated_at = CURRENT_TIMESTAMP
          WHERE authority = ? AND status = 'pending'`,
      )
      .bind(authority),
  ]);
}

export async function failPaymentAttemptById(
  attemptId: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  await database
    .prepare(
      `UPDATE payment_attempts
          SET status = 'failed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'`,
    )
    .bind(attemptId)
    .run();
}

async function getOrderById(id: string, database?: D1Database) {
  const db = database ?? (await requireDatabase());
  const row = await db
    .prepare(
      `SELECT id, order_number, status, payment_status,
              reservation_expires_at, customer_name, customer_email,
              customer_phone, address_source_id, address_label, address_line,
              city, province, postcode, latitude_e6, longitude_e6,
              delivery_method, currency, subtotal_minor, delivery_minor, total_minor,
              created_at, updated_at
         FROM orders WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<OrderRow>();
  if (!row) throw new Error("ORDER_NOT_FOUND");
  const itemResult = await db
    .prepare(
      `SELECT id, order_id, product_id, variant_id, seller_offer_id,
              selection_label, slug, sku, title, quantity, unit_price_minor,
              line_total_minor
         FROM order_items WHERE order_id = ? ORDER BY rowid ASC`,
    )
    .bind(id)
    .all<ItemRow>();
  return mapOrder(row, itemResult.results);
}

function inventoryReservationStatements(
  database: D1Database,
  orderId: string,
  line: ValidatedOrderLine,
) {
  const itemId = crypto.randomUUID();
  const commonBinds = [
    itemId,
    orderId,
    line.variantId,
    line.sellerOfferId,
    line.selectionLabel,
    line.slug,
    line.sku,
    line.title,
    line.quantity,
    line.unitPriceMinor,
    line.unitPriceMinor * line.quantity,
  ];
  if (line.variantId) {
    return [
      database
        .prepare(
          `INSERT INTO order_items (
             id, order_id, product_id, variant_id, seller_offer_id,
             selection_label, slug, sku, title, quantity, unit_price_minor,
             line_total_minor
           ) SELECT ?, ?, product_id, ?, ?, ?, ?, ?, ?, ?, ?, ?
               FROM product_variants
              WHERE id = ? AND product_id = ? AND visible = 1
                AND stock_quantity - reserved_quantity >= ?`,
        )
        .bind(...commonBinds, line.variantId, line.productId, line.quantity),
      database
        .prepare(
          `UPDATE product_variants
              SET reserved_quantity = reserved_quantity + ?,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND product_id = ? AND visible = 1
              AND stock_quantity - reserved_quantity >= ?`,
        )
        .bind(line.quantity, line.variantId, line.productId, line.quantity),
    ];
  }
  if (line.sellerOfferId) {
    return [
      database
        .prepare(
          `INSERT INTO order_items (
             id, order_id, product_id, variant_id, seller_offer_id,
             selection_label, slug, sku, title, quantity, unit_price_minor,
             line_total_minor
           ) SELECT ?, ?, product_id, ?, ?, ?, ?, ?, ?, ?, ?, ?
               FROM seller_offers
              WHERE id = ? AND product_id = ? AND visible = 1
                AND stock_quantity - reserved_quantity >= ?`,
        )
        .bind(...commonBinds, line.sellerOfferId, line.productId, line.quantity),
      database
        .prepare(
          `UPDATE seller_offers
              SET reserved_quantity = reserved_quantity + ?,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND product_id = ? AND visible = 1
              AND stock_quantity - reserved_quantity >= ?`,
        )
        .bind(line.quantity, line.sellerOfferId, line.productId, line.quantity),
    ];
  }
  return [
    database
      .prepare(
        `INSERT INTO order_items (
           id, order_id, product_id, variant_id, seller_offer_id,
           selection_label, slug, sku, title, quantity, unit_price_minor,
           line_total_minor
         ) SELECT ?, ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?
             FROM products
            WHERE id = ? AND visible = 1
              AND stock_quantity - reserved_quantity >= ?`,
      )
      .bind(...commonBinds, line.productId, line.quantity),
    database
      .prepare(
        `UPDATE products
            SET reserved_quantity = reserved_quantity + ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND visible = 1
            AND stock_quantity - reserved_quantity >= ?`,
      )
      .bind(line.quantity, line.productId, line.quantity),
  ];
}

async function rollbackIncompleteOrder(database: D1Database, orderId: string) {
  const itemResult = await database
    .prepare(
      `SELECT product_id, variant_id, seller_offer_id, quantity
         FROM order_items WHERE order_id = ?`,
    )
    .bind(orderId)
    .all<InventoryItemRow>();
  await database.batch([
    ...itemResult.results.map((item) =>
      inventoryReleaseStatement(database, item, false),
    ),
    database.prepare("DELETE FROM order_items WHERE order_id = ?").bind(orderId),
    database.prepare("DELETE FROM orders WHERE id = ?").bind(orderId),
    database
      .prepare(
        `INSERT INTO admin_audit_log (actor_email, action, subject_id)
         VALUES ('inventory-system', 'order.inventory_rejected', ?)`,
      )
      .bind(orderId),
  ]);
}

function inventoryReleaseStatement(
  database: D1Database,
  item: InventoryItemRow,
  deductStock: boolean,
) {
  const setSql = deductStock
    ? `stock_quantity = MAX(0, stock_quantity - ?),
       reserved_quantity = MAX(0, reserved_quantity - ?)`
    : "reserved_quantity = MAX(0, reserved_quantity - ?)";
  const quantities = deductStock
    ? [item.quantity, item.quantity]
    : [item.quantity];
  if (item.variant_id) {
    return database
      .prepare(
        `UPDATE product_variants SET ${setSql}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND product_id = ?`,
      )
      .bind(...quantities, item.variant_id, item.product_id);
  }
  if (item.seller_offer_id) {
    return database
      .prepare(
        `UPDATE seller_offers SET ${setSql}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND product_id = ?`,
      )
      .bind(...quantities, item.seller_offer_id, item.product_id);
  }
  return database
    .prepare(
      `UPDATE products SET ${setSql}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
    )
    .bind(...quantities, item.product_id);
}

async function releaseExpiredReservations(database: D1Database) {
  const expired = await database
    .prepare(
      `SELECT id FROM orders
        WHERE status = 'new' AND payment_status != 'paid'
          AND reservation_expires_at != '' AND reservation_expires_at <= ?
        LIMIT 100`,
    )
    .bind(new Date().toISOString())
    .all<{ id: string }>();
  for (const order of expired.results) {
    const items = await database
      .prepare(
        `SELECT product_id, variant_id, seller_offer_id, quantity
           FROM order_items WHERE order_id = ?`,
      )
      .bind(order.id)
      .all<InventoryItemRow>();
    await database.batch([
      ...items.results.map((item) => inventoryReleaseStatement(database, item, false)),
      database
        .prepare(
          `UPDATE orders
              SET status = 'expired', payment_status = 'failed',
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'new'`,
        )
        .bind(order.id),
      database
        .prepare(
          `INSERT INTO admin_audit_log (actor_email, action, subject_id)
           VALUES ('inventory-system', 'order.expired', ?)`,
        )
        .bind(order.id),
    ]);
  }
}

function groupItems(rows: ItemRow[]) {
  const grouped = new Map<string, ItemRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.order_id) ?? [];
    current.push(row);
    grouped.set(row.order_id, current);
  }
  return grouped;
}

function mapOrder(row: OrderRow, itemRows: ItemRow[]): StoreOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    paymentStatus: row.payment_status,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    addressSourceId: row.address_source_id,
    addressLabel: row.address_label,
    addressLine: row.address_line,
    city: row.city,
    province: row.province,
    postcode: row.postcode,
    latitude: coordinateFromInteger(row.latitude_e6),
    longitude: coordinateFromInteger(row.longitude_e6),
    deliveryMethod: row.delivery_method,
    currency: row.currency,
    subtotalMinor: row.subtotal_minor,
    deliveryMinor: row.delivery_minor,
    totalMinor: row.total_minor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reservationExpiresAt: row.reservation_expires_at,
    items: itemRows.map(mapItem),
  };
}

function mapItem(row: ItemRow): OrderItem {
  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id,
    sellerOfferId: row.seller_offer_id,
    selectionLabel: row.selection_label,
    slug: row.slug,
    sku: row.sku,
    title: row.title,
    quantity: row.quantity,
    unitPriceMinor: row.unit_price_minor,
    lineTotalMinor: row.line_total_minor,
  };
}

function makeOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `MS-${date}-${random}`;
}

function coordinateToInteger(value: number | null) {
  return value === null || !Number.isFinite(value)
    ? null
    : Math.round(value * 1_000_000);
}

function coordinateFromInteger(value: number | null) {
  return value === null ? null : value / 1_000_000;
}

function getChangedRows(result: D1Result<unknown> | undefined) {
  return Number(result?.meta?.changes ?? 0);
}

async function requireDatabase() {
  const bindings = await getRuntimeEnv<{ DB?: D1Database }>();
  if (!bindings.DB) throw new Error("DATABASE_UNAVAILABLE");
  return bindings.DB;
}
