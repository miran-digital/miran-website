import type {
  CustomerDirectoryEntry, CustomerDirectoryOptions, CustomerDirectoryPage,
  CustomerProfile, CustomerProfileOrder,
} from "../features/admin/customer-directory-types.ts";
import type { OrderItem } from "../features/orders/order-types.ts";
import { getRuntimeEnv } from "../lib/runtime-env.ts";
import type { SupabaseAdminUser } from "../lib/supabase-admin.ts";

// Each legacy identity is anchored to an existing primary key, never a raw email URL.
// No account, order, address or other production row is created by these SELECTs.
const DIRECTORY_CTE = `WITH records AS (
  SELECT lower(trim(email)) email, 'auth:' || auth_user_id customer_id,
    full_name, auth_user_id, provider, email_confirmed_at, created_at registered_at,
    last_seen_at, 1 identity_rank, 0 order_count, 0 address_count, 0 ticket_count, 0 review_count
  FROM customer_accounts
  UNION ALL
  SELECT lower(trim(json_extract(value, '$.email'))), 'auth:' || json_extract(value, '$.id'),
    COALESCE(json_extract(value, '$.fullName'), ''), json_extract(value, '$.id'), 'supabase',
    COALESCE(json_extract(value, '$.emailConfirmedAt'), ''), COALESCE(json_extract(value, '$.createdAt'), ''),
    '', 0, 0, 0, 0, 0 FROM json_each(?)
  UNION ALL
  SELECT lower(trim(customer_email)), 'order:' || id, customer_name, '', 'store', '',
    created_at, updated_at, 2, 1, 0, 0, 0 FROM orders
  UNION ALL
  SELECT lower(trim(owner_email)), 'address:' || id, '', '', 'store', '',
    created_at, updated_at, 3, 0, 1, 0, 0 FROM customer_addresses
  UNION ALL
  SELECT lower(trim(customer_email)), 'ticket:' || id, customer_name, '', 'store', '',
    created_at, updated_at, 4, 0, 0, 1, 0 FROM support_tickets
  UNION ALL
  SELECT lower(trim(customer_email)), 'review:' || id, customer_name, '', 'store', '',
    created_at, updated_at, 5, 0, 0, 0, 1 FROM product_reviews
  UNION ALL
  SELECT lower(trim(owner_email)), 'notification:' || id, '', '', 'store', '',
    created_at, created_at, 6, 0, 0, 0, 0 FROM customer_notifications
), ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY email ORDER BY identity_rank, registered_at, customer_id) identity_position
  FROM records WHERE email != ''
), totals AS (
  SELECT email, MIN(NULLIF(registered_at, '')) first_registered,
    MAX(NULLIF(last_seen_at, '')) last_activity,
    SUM(order_count) order_count, SUM(address_count) address_count,
    SUM(ticket_count) ticket_count, SUM(review_count) review_count,
    COALESCE(MAX(CASE WHEN auth_user_id != '' THEN NULLIF(full_name, '') END), MAX(NULLIF(full_name, ''))) known_name
  FROM ranked GROUP BY email
), directory AS (
  SELECT r.customer_id, r.email, COALESCE(NULLIF(r.full_name, ''), t.known_name, '') full_name,
    r.auth_user_id, r.provider, r.email_confirmed_at,
    COALESCE(CASE WHEN r.auth_user_id != '' THEN NULLIF(r.registered_at, '') END, t.first_registered, '') registered_at,
    COALESCE(t.last_activity, '') last_seen_at,
    t.order_count, t.address_count, t.ticket_count, t.review_count
  FROM ranked r JOIN totals t ON t.email = r.email WHERE r.identity_position = 1
)`;

type DirectoryRow = {
  customer_id: string; email: string; full_name: string; auth_user_id: string; provider: string;
  email_confirmed_at: string; registered_at: string; last_seen_at: string;
  order_count: number; address_count: number; ticket_count: number; review_count: number;
};

const sortSql: Record<CustomerDirectoryOptions["sort"], string> = {
  newest: "registered_at DESC, email ASC",
  oldest: "registered_at ASC, email ASC",
  name: "full_name COLLATE NOCASE ASC, email ASC",
  orders: "order_count DESC, email ASC",
  activity: "last_seen_at DESC, email ASC",
};

export async function queryAdminCustomerDirectory(
  options: CustomerDirectoryOptions,
  authUsers: readonly SupabaseAdminUser[] = [],
  databaseOverride?: D1Database,
): Promise<CustomerDirectoryPage> {
  const database = databaseOverride ?? await requireDatabase();
  const authJson = JSON.stringify(authUsers);
  const query = options.query.trim().toLowerCase().replaceAll("ي", "ی").replaceAll("ك", "ک").slice(0, 120);
  const filter = "WHERE instr(lower(replace(replace(full_name, 'ي', 'ی'), 'ك', 'ک')) || ' ' || email, ?) > 0";
  const count = await database.prepare(`${DIRECTORY_CTE} SELECT COUNT(*) count FROM directory ${filter}`)
    .bind(authJson, query).first<{ count: number }>();
  const total = Number(count?.count ?? 0);
  const pageSize = options.pageSize === 50 ? 50 : 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = boundedPage(options.page, totalPages);
  const rows = await database.prepare(
    `${DIRECTORY_CTE} SELECT * FROM directory ${filter} ORDER BY ${sortSql[options.sort] ?? sortSql.newest} LIMIT ? OFFSET ?`,
  ).bind(authJson, query, pageSize, (page - 1) * pageSize).all<DirectoryRow>();
  return { customers: rows.results.map(mapCustomer), total, page, pageSize, totalPages };
}

export async function readAdminCustomerProfile(
  customerId: string,
  pages: { ordersPage?: number; activityPage?: number } = {},
  authUsers: readonly SupabaseAdminUser[] = [],
  databaseOverride?: D1Database,
): Promise<CustomerProfile | null> {
  const database = databaseOverride ?? await requireDatabase();
  const email = await resolveCustomerEmail(database, customerId, authUsers);
  if (!email) return null;
  const row = await database.prepare(`${DIRECTORY_CTE} SELECT * FROM directory WHERE email = ? LIMIT 1`)
    .bind(JSON.stringify(authUsers), email).first<DirectoryRow>();
  if (!row) return null;
  const customer = mapCustomer(row);
  const ordersPages = Math.max(1, Math.ceil(customer.orderCount / 25));
  const activityPages = Math.max(1, Math.ceil(Math.max(customer.ticketCount, customer.reviewCount) / 25));
  const ordersPage = boundedPage(pages.ordersPage, ordersPages);
  const activityPage = boundedPage(pages.activityPage, activityPages);
  const orderIdsQuery = "SELECT id FROM orders WHERE lower(trim(customer_email)) = ? ORDER BY created_at DESC, id DESC LIMIT 25 OFFSET ?";
  const orderOffset = (ordersPage - 1) * 25;
  const activityOffset = (activityPage - 1) * 25;
  const [addresses, orders, items, payments, totals, phones, tickets, reviews] = await Promise.all([
    database.prepare(`SELECT id, label, recipient_name, phone, address_line, city, province, postcode, is_default
      FROM customer_addresses WHERE lower(trim(owner_email)) = ? ORDER BY is_default DESC, updated_at DESC`)
      .bind(email).all<{ id: string; label: string; recipient_name: string; phone: string; address_line: string; city: string; province: string; postcode: string; is_default: number }>(),
    database.prepare(`SELECT id, order_number, status, payment_status, created_at, customer_phone, address_line, city, province,
      delivery_method, currency, total_minor FROM orders WHERE id IN (${orderIdsQuery}) ORDER BY created_at DESC, id DESC`)
      .bind(email, orderOffset).all<{ id: string; order_number: string; status: CustomerProfileOrder["status"]; payment_status: CustomerProfileOrder["paymentStatus"]; created_at: string; customer_phone: string; address_line: string; city: string; province: string; delivery_method: CustomerProfileOrder["deliveryMethod"]; currency: string; total_minor: number }>(),
    database.prepare(`SELECT id, order_id, product_id, variant_id, seller_offer_id, selection_label, slug, sku, title,
      quantity, unit_price_minor, line_total_minor FROM order_items WHERE order_id IN (${orderIdsQuery}) ORDER BY rowid`)
      .bind(email, orderOffset).all<{ id: string; order_id: string; product_id: string; variant_id: string; seller_offer_id: string; selection_label: string; slug: string; sku: string; title: string; quantity: number; unit_price_minor: number; line_total_minor: number }>(),
    database.prepare(`SELECT order_id, provider, provider_reference, status, created_at FROM payment_attempts
      WHERE order_id IN (${orderIdsQuery}) ORDER BY created_at DESC`)
      .bind(email, orderOffset).all<{ order_id: string; provider: string; provider_reference: string; status: string; created_at: string }>(),
    database.prepare(`SELECT COALESCE(SUM(CASE WHEN currency = 'IRR' THEN total_minor ELSE 0 END), 0) paid_rial,
      COALESCE(SUM(CASE WHEN currency != 'IRR' THEN 1 ELSE 0 END), 0) legacy_count
      FROM orders WHERE lower(trim(customer_email)) = ? AND payment_status = 'paid'`)
      .bind(email).first<{ paid_rial: number; legacy_count: number }>(),
    database.prepare(`SELECT DISTINCT customer_phone phone FROM orders WHERE lower(trim(customer_email)) = ? AND trim(customer_phone) != ''
      UNION SELECT DISTINCT phone FROM customer_addresses WHERE lower(trim(owner_email)) = ? AND trim(phone) != ''`)
      .bind(email, email).all<{ phone: string }>(),
    database.prepare(`SELECT id, ticket_number, subject, status, created_at, updated_at FROM support_tickets
      WHERE lower(trim(customer_email)) = ? ORDER BY created_at DESC, id DESC LIMIT 25 OFFSET ?`)
      .bind(email, activityOffset).all<{ id: string; ticket_number: string; subject: string; status: string; created_at: string; updated_at: string }>(),
    database.prepare(`SELECT r.id, COALESCE(p.title, '') product_title, r.title, r.body, r.rating, r.status, r.created_at
      FROM product_reviews r LEFT JOIN products p ON p.id = r.product_id
      WHERE lower(trim(r.customer_email)) = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 25 OFFSET ?`)
      .bind(email, activityOffset).all<{ id: string; product_title: string; title: string; body: string; rating: number; status: string; created_at: string }>(),
  ]);
  const orderItems = new Map<string, OrderItem[]>();
  for (const item of items.results) {
    const mapped: OrderItem = { id: item.id, productId: item.product_id, variantId: item.variant_id,
      sellerOfferId: item.seller_offer_id, selectionLabel: item.selection_label, slug: item.slug, sku: item.sku,
      title: item.title, quantity: item.quantity, unitPriceMinor: item.unit_price_minor, lineTotalMinor: item.line_total_minor };
    orderItems.set(item.order_id, [...(orderItems.get(item.order_id) ?? []), mapped]);
  }
  return {
    customer, ordersPage, ordersPages, activityPage, activityPages,
    phoneNumbers: phones.results.map((phone) => phone.phone),
    paidTotalRial: Number(totals?.paid_rial ?? 0), legacyPaidOrderCount: Number(totals?.legacy_count ?? 0),
    addresses: addresses.results.map((address) => ({ id: address.id, label: address.label,
      recipientName: address.recipient_name, phone: address.phone, addressLine: address.address_line,
      city: address.city, province: address.province, postcode: address.postcode, isDefault: address.is_default === 1 })),
    orders: orders.results.map((order) => ({ id: order.id, orderNumber: order.order_number, status: order.status,
      paymentStatus: order.payment_status, createdAt: order.created_at, deliveryMethod: order.delivery_method,
      deliveryAddress: [order.province, order.city, order.address_line].filter(Boolean).join("، "),
      currency: order.currency, totalMinor: order.total_minor, items: orderItems.get(order.id) ?? [],
      payments: payments.results.filter((payment) => payment.order_id === order.id).map((payment) => ({
        provider: payment.provider, reference: payment.provider_reference, status: payment.status, createdAt: payment.created_at,
      })),
    })),
    tickets: tickets.results.map((ticket) => ({ id: ticket.id, number: ticket.ticket_number, subject: ticket.subject,
      status: ticket.status, createdAt: ticket.created_at, updatedAt: ticket.updated_at })),
    reviews: reviews.results.map((review) => ({ id: review.id, productTitle: review.product_title, title: review.title,
      body: review.body, rating: review.rating, status: review.status, createdAt: review.created_at })),
  };
}

async function resolveCustomerEmail(database: D1Database, customerId: string, authUsers: readonly SupabaseAdminUser[]) {
  const separator = customerId.indexOf(":");
  const kind = customerId.slice(0, separator);
  const id = customerId.slice(separator + 1);
  if (separator < 1 || !id || id.length > 160 || Array.from(id).some((character) => character.charCodeAt(0) < 32)) return null;
  const sources: Record<string, [string, string, string]> = {
    auth: ["customer_accounts", "auth_user_id", "email"],
    order: ["orders", "id", "customer_email"],
    address: ["customer_addresses", "id", "owner_email"],
    ticket: ["support_tickets", "id", "customer_email"],
    review: ["product_reviews", "id", "customer_email"],
    notification: ["customer_notifications", "id", "owner_email"],
  };
  const source = Object.hasOwn(sources, kind) ? sources[kind] : null;
  if (!source) return null;
  const [table, key, emailColumn] = source;
  const row = await database.prepare(`SELECT lower(trim(${emailColumn})) email FROM ${table} WHERE ${key} = ? LIMIT 1`)
    .bind(id).first<{ email: string }>();
  return row?.email ?? (kind === "auth" ? authUsers.find((user) => user.id === id)?.email.trim().toLowerCase() : null) ?? null;
}

function mapCustomer(row: DirectoryRow): CustomerDirectoryEntry {
  return { customerId: row.customer_id, email: row.email, fullName: row.full_name, authUserId: row.auth_user_id,
    provider: row.provider, emailConfirmedAt: row.email_confirmed_at, registeredAt: row.registered_at,
    lastSeenAt: row.last_seen_at, orderCount: Number(row.order_count), addressCount: Number(row.address_count),
    ticketCount: Number(row.ticket_count), reviewCount: Number(row.review_count) };
}

function boundedPage(value: number | undefined, pages: number) {
  return Math.min(pages, Math.max(1, Number.isSafeInteger(value) ? value! : 1));
}

async function requireDatabase() {
  const { DB } = await getRuntimeEnv<{ DB?: D1Database }>();
  if (!DB) throw new Error("D1_UNAVAILABLE");
  return DB;
}
