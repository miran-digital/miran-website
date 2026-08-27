import { getRuntimeEnv } from "../lib/runtime-env.ts";

export type CustomerAccountInput = {
  authUserId: string;
  email: string;
  fullName?: string | null;
  provider?: string;
  emailConfirmedAt?: string | null;
  createdAt?: string | null;
};

export type AdminCustomerSummary = {
  email: string;
  fullName: string;
  authUserId: string;
  provider: string;
  emailConfirmedAt: string;
  registeredAt: string;
  lastSeenAt: string;
  orderCount: number;
  addressCount: number;
  ticketCount: number;
  reviewCount: number;
};

type CustomerSummaryRow = {
  email: string;
  full_name: string;
  auth_user_id: string;
  provider: string;
  email_confirmed_at: string;
  registered_at: string;
  last_seen_at: string;
  order_count: number;
  address_count: number;
  ticket_count: number;
  review_count: number;
};

export async function upsertCustomerAccount(
  input: CustomerAccountInput,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const authUserId = input.authUserId.trim().slice(0, 160);
  const email = input.email.trim().toLowerCase().slice(0, 200);
  if (!authUserId || !/^\S+@\S+\.\S+$/.test(email)) return;
  await database.batch([
    database
      .prepare("DELETE FROM customer_accounts WHERE lower(email) = ? AND auth_user_id != ?")
      .bind(email, authUserId),
    database.prepare(
      `INSERT INTO customer_accounts (
         auth_user_id, email, full_name, provider, email_confirmed_at,
         created_at, last_seen_at
       ) VALUES (?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
       ON CONFLICT(auth_user_id) DO UPDATE SET
         email = excluded.email,
         full_name = CASE WHEN excluded.full_name != '' THEN excluded.full_name ELSE customer_accounts.full_name END,
         provider = excluded.provider,
         email_confirmed_at = CASE WHEN excluded.email_confirmed_at != '' THEN excluded.email_confirmed_at ELSE customer_accounts.email_confirmed_at END,
         last_seen_at = CURRENT_TIMESTAMP`,
    ).bind(
      authUserId,
      email,
      (input.fullName ?? "").trim().slice(0, 120),
      (input.provider ?? "supabase").trim().slice(0, 40) || "supabase",
      (input.emailConfirmedAt ?? "").trim().slice(0, 40),
      (input.createdAt ?? "").trim().slice(0, 40),
    ),
  ]);
}

export async function listAdminCustomers(databaseOverride?: D1Database) {
  const database = databaseOverride ?? await requireDatabase();
  const result = await database
    .prepare(
      `WITH known_emails AS (
         SELECT lower(email) AS email FROM customer_accounts
         UNION SELECT lower(customer_email) FROM orders
         UNION SELECT lower(owner_email) FROM customer_addresses
         UNION SELECT lower(customer_email) FROM support_tickets
         UNION SELECT lower(customer_email) FROM product_reviews
         UNION SELECT lower(owner_email) FROM customer_notifications
       )
       SELECT e.email,
              COALESCE(a.full_name,
                (SELECT customer_name FROM orders o WHERE lower(o.customer_email) = e.email ORDER BY o.created_at DESC LIMIT 1),
                (SELECT customer_name FROM support_tickets t WHERE lower(t.customer_email) = e.email ORDER BY t.updated_at DESC LIMIT 1),
                '') AS full_name,
              COALESCE(a.auth_user_id, '') AS auth_user_id,
              COALESCE(a.provider, 'store') AS provider,
              COALESCE(a.email_confirmed_at, '') AS email_confirmed_at,
              COALESCE(a.created_at,
                (SELECT MIN(o.created_at) FROM orders o WHERE lower(o.customer_email) = e.email),
                (SELECT MIN(t.created_at) FROM support_tickets t WHERE lower(t.customer_email) = e.email),
                '') AS registered_at,
              COALESCE(a.last_seen_at,
                (SELECT MAX(o.updated_at) FROM orders o WHERE lower(o.customer_email) = e.email),
                (SELECT MAX(t.updated_at) FROM support_tickets t WHERE lower(t.customer_email) = e.email),
                '') AS last_seen_at,
              (SELECT COUNT(*) FROM orders o WHERE lower(o.customer_email) = e.email) AS order_count,
              (SELECT COUNT(*) FROM customer_addresses ca WHERE lower(ca.owner_email) = e.email) AS address_count,
              (SELECT COUNT(*) FROM support_tickets t WHERE lower(t.customer_email) = e.email) AS ticket_count,
              (SELECT COUNT(*) FROM product_reviews r WHERE lower(r.customer_email) = e.email) AS review_count
         FROM known_emails e
         LEFT JOIN customer_accounts a ON lower(a.email) = e.email
        WHERE e.email != ''
        ORDER BY COALESCE(a.last_seen_at, registered_at) DESC, e.email ASC
        LIMIT 1000`,
    )
    .all<CustomerSummaryRow>();
  return result.results.map((row): AdminCustomerSummary => ({
    email: row.email,
    fullName: row.full_name,
    authUserId: row.auth_user_id,
    provider: row.provider,
    emailConfirmedAt: row.email_confirmed_at,
    registeredAt: row.registered_at,
    lastSeenAt: row.last_seen_at,
    orderCount: Number(row.order_count),
    addressCount: Number(row.address_count),
    ticketCount: Number(row.ticket_count),
    reviewCount: Number(row.review_count),
  }));
}

export async function getCustomerDeletionBlockers(
  emailAddress: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const email = emailAddress.trim().toLowerCase();
  const row = await database
    .prepare("SELECT COUNT(*) AS count FROM orders WHERE lower(customer_email) = ?")
    .bind(email)
    .first<{ count: number }>();
  return { orderCount: Number(row?.count ?? 0) };
}

export async function listCustomerReceiptStorageKeys(
  emailAddress: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const result = await database
    .prepare("SELECT storage_key FROM bank_transfer_receipts WHERE lower(customer_email) = ?")
    .bind(emailAddress.trim().toLowerCase())
    .all<{ storage_key: string }>();
  return result.results.map((row) => row.storage_key);
}

export async function deleteCustomerStoreData(
  emailAddress: string,
  actorEmail: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const email = emailAddress.trim().toLowerCase();
  const blockers = await getCustomerDeletionBlockers(email, database);
  if (blockers.orderCount > 0) throw new Error("CUSTOMER_HAS_ORDERS");
  const exists = await database
    .prepare(
      `SELECT 1 AS found FROM customer_accounts WHERE lower(email) = ?
       UNION SELECT 1 FROM customer_addresses WHERE lower(owner_email) = ?
       UNION SELECT 1 FROM support_tickets WHERE lower(customer_email) = ?
       UNION SELECT 1 FROM product_reviews WHERE lower(customer_email) = ?
       LIMIT 1`,
    )
    .bind(email, email, email, email)
    .first<{ found: number }>();
  if (!exists) throw new Error("CUSTOMER_NOT_FOUND");
  await database.batch([
    database.prepare("DELETE FROM support_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE lower(customer_email) = ?)").bind(email),
    database.prepare("DELETE FROM support_tickets WHERE lower(customer_email) = ?").bind(email),
    database.prepare("DELETE FROM product_reviews WHERE lower(customer_email) = ?").bind(email),
    database.prepare("DELETE FROM customer_notifications WHERE lower(owner_email) = ?").bind(email),
    database.prepare("DELETE FROM customer_addresses WHERE lower(owner_email) = ?").bind(email),
    database.prepare("DELETE FROM bank_transfer_receipts WHERE lower(customer_email) = ?").bind(email),
    database.prepare("DELETE FROM customer_accounts WHERE lower(email) = ?").bind(email),
    database.prepare("UPDATE admin_audit_log SET actor_email = 'deleted-customer' WHERE lower(actor_email) = ?").bind(email),
    database.prepare("INSERT INTO admin_audit_log (actor_email, action, subject_id) VALUES (?, 'customer.store-data-deleted', 'customer-account')").bind(actorEmail.trim().toLowerCase()),
  ]);
  return { deleted: true as const };
}

async function requireDatabase() {
  const bindings = await getRuntimeEnv<{ DB?: D1Database }>();
  if (!bindings.DB) throw new Error("DATABASE_UNAVAILABLE");
  return bindings.DB;
}
