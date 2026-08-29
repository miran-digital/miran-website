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

type CustomerAccountSummaryRow = {
  email: string;
  full_name: string;
  auth_user_id: string;
  provider: string;
  email_confirmed_at: string;
  registered_at: string;
  last_seen_at: string;
};

type CustomerActivitySummaryRow = {
  email: string;
  full_name?: string;
  registered_at: string;
  last_seen_at: string;
  item_count: number;
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
  const accounts = await database.prepare(
    `SELECT lower(email) AS email,
            COALESCE(full_name, '') AS full_name,
            COALESCE(auth_user_id, '') AS auth_user_id,
            COALESCE(provider, 'store') AS provider,
            COALESCE(email_confirmed_at, '') AS email_confirmed_at,
            COALESCE(created_at, '') AS registered_at,
            COALESCE(last_seen_at, '') AS last_seen_at
       FROM customer_accounts
      WHERE trim(email) != ''
      LIMIT 1000`,
  ).all<CustomerAccountSummaryRow>();
  const orders = await database.prepare(
    `SELECT lower(customer_email) AS email,
            COALESCE(MAX(NULLIF(customer_name, '')), '') AS full_name,
            COALESCE(MIN(created_at), '') AS registered_at,
            COALESCE(MAX(updated_at), '') AS last_seen_at,
            COUNT(*) AS item_count
       FROM orders
      WHERE trim(customer_email) != ''
      GROUP BY lower(customer_email)
      LIMIT 1000`,
  ).all<CustomerActivitySummaryRow>();
  const addresses = await database.prepare(
    `SELECT lower(owner_email) AS email,
            COALESCE(MIN(created_at), '') AS registered_at,
            COALESCE(MAX(updated_at), '') AS last_seen_at,
            COUNT(*) AS item_count
       FROM customer_addresses
      WHERE trim(owner_email) != ''
      GROUP BY lower(owner_email)
      LIMIT 1000`,
  ).all<CustomerActivitySummaryRow>();
  const tickets = await database.prepare(
    `SELECT lower(customer_email) AS email,
            COALESCE(MAX(NULLIF(customer_name, '')), '') AS full_name,
            COALESCE(MIN(created_at), '') AS registered_at,
            COALESCE(MAX(updated_at), '') AS last_seen_at,
            COUNT(*) AS item_count
       FROM support_tickets
      WHERE trim(customer_email) != ''
      GROUP BY lower(customer_email)
      LIMIT 1000`,
  ).all<CustomerActivitySummaryRow>();
  const reviews = await database.prepare(
    `SELECT lower(customer_email) AS email,
            COALESCE(MAX(NULLIF(customer_name, '')), '') AS full_name,
            COALESCE(MIN(created_at), '') AS registered_at,
            COALESCE(MAX(updated_at), '') AS last_seen_at,
            COUNT(*) AS item_count
       FROM product_reviews
      WHERE trim(customer_email) != ''
      GROUP BY lower(customer_email)
      LIMIT 1000`,
  ).all<CustomerActivitySummaryRow>();
  const notifications = await database.prepare(
    `SELECT lower(owner_email) AS email,
            COALESCE(MIN(created_at), '') AS registered_at,
            COALESCE(MAX(created_at), '') AS last_seen_at,
            COUNT(*) AS item_count
       FROM customer_notifications
      WHERE trim(owner_email) != ''
      GROUP BY lower(owner_email)
      LIMIT 1000`,
  ).all<CustomerActivitySummaryRow>();

  const customers = new Map<string, AdminCustomerSummary>();
  const getCustomer = (emailAddress: string) => {
    const email = emailAddress.trim().toLowerCase();
    if (!email) return null;
    const existing = customers.get(email);
    if (existing) return existing;
    const created: AdminCustomerSummary = {
      email,
      fullName: "",
      authUserId: "",
      provider: "store",
      emailConfirmedAt: "",
      registeredAt: "",
      lastSeenAt: "",
      orderCount: 0,
      addressCount: 0,
      ticketCount: 0,
      reviewCount: 0,
    };
    customers.set(email, created);
    return created;
  };
  const mergeActivity = (
    rows: CustomerActivitySummaryRow[],
    countKey?: "orderCount" | "addressCount" | "ticketCount" | "reviewCount",
  ) => {
    for (const row of rows) {
      const customer = getCustomer(row.email);
      if (!customer) continue;
      if (!customer.fullName && row.full_name) customer.fullName = row.full_name;
      customer.registeredAt = earliestTimestamp(customer.registeredAt, row.registered_at);
      customer.lastSeenAt = latestTimestamp(customer.lastSeenAt, row.last_seen_at);
      if (countKey) customer[countKey] = Number(row.item_count);
    }
  };

  for (const row of accounts.results) {
    const customer = getCustomer(row.email);
    if (!customer) continue;
    customer.fullName = row.full_name;
    customer.authUserId = row.auth_user_id;
    customer.provider = row.provider;
    customer.emailConfirmedAt = row.email_confirmed_at;
    customer.registeredAt = row.registered_at;
    customer.lastSeenAt = row.last_seen_at;
  }
  mergeActivity(orders.results, "orderCount");
  mergeActivity(addresses.results, "addressCount");
  mergeActivity(tickets.results, "ticketCount");
  mergeActivity(reviews.results, "reviewCount");
  mergeActivity(notifications.results);

  return [...customers.values()]
    .sort((left, right) => {
      const leftActivity = left.lastSeenAt || left.registeredAt;
      const rightActivity = right.lastSeenAt || right.registeredAt;
      return rightActivity.localeCompare(leftActivity) || left.email.localeCompare(right.email);
    })
    .slice(0, 1000);
}

function earliestTimestamp(current: string, candidate: string) {
  if (!current) return candidate;
  if (!candidate) return current;
  return candidate < current ? candidate : current;
}

function latestTimestamp(current: string, candidate: string) {
  if (!current) return candidate;
  if (!candidate) return current;
  return candidate > current ? candidate : current;
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
