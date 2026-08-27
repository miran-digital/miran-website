import type {
  CustomerNotification,
  SupportMessage,
  SupportTicket,
  SupportTicketCategory,
  SupportTicketStatus,
} from "../features/customer-care/customer-care-types.ts";
import { getRuntimeEnv } from "../lib/runtime-env.ts";

type TicketRow = {
  id: string;
  ticket_number: string;
  customer_email: string;
  customer_name: string;
  order_id: string;
  order_number: string | null;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  ticket_id: string;
  author_role: "customer" | "admin";
  body: string;
  created_at: string;
};

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  read_at: string;
  created_at: string;
};

const TICKET_SELECT = `
  SELECT t.id, t.ticket_number, t.customer_email, t.customer_name, t.order_id,
         o.order_number, t.subject, t.category, t.status, t.created_at,
         t.updated_at
    FROM support_tickets t
    LEFT JOIN orders o ON o.id = t.order_id`;

const allowedTransitions: Record<SupportTicketStatus, readonly SupportTicketStatus[]> = {
  open: ["in_progress", "waiting_customer", "resolved", "closed"],
  in_progress: ["waiting_customer", "resolved", "closed"],
  waiting_customer: ["in_progress", "resolved", "closed"],
  resolved: ["open", "closed"],
  closed: [],
};

export async function listCustomerSupportTickets(
  customerEmail: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const email = customerEmail.trim().toLowerCase();
  const ticketResult = await database
    .prepare(`${TICKET_SELECT} WHERE t.customer_email = ? ORDER BY t.updated_at DESC LIMIT 50`)
    .bind(email)
    .all<TicketRow>();
  return attachMessages(database, ticketResult.results);
}

export async function listAdminSupportTickets(databaseOverride?: D1Database) {
  const database = databaseOverride ?? await requireDatabase();
  const ticketResult = await database
    .prepare(`${TICKET_SELECT} ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'waiting_customer' THEN 2 ELSE 3 END, t.updated_at DESC LIMIT 250`)
    .all<TicketRow>();
  return attachMessages(database, ticketResult.results);
}

export async function createSupportTicket(
  input: {
    customerEmail: string;
    customerName: string;
    subject: string;
    category: SupportTicketCategory;
    orderNumber: string;
    body: string;
  },
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const email = input.customerEmail.trim().toLowerCase();
  const recent = await database
    .prepare(
      `SELECT COUNT(*) AS count FROM support_tickets
        WHERE customer_email = ? AND created_at >= datetime('now', '-1 day')`,
    )
    .bind(email)
    .first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= 5) throw new Error("SUPPORT_RATE_LIMIT");

  let orderId = "";
  if (input.orderNumber) {
    const order = await database
      .prepare(
        `SELECT id FROM orders
          WHERE order_number = ? AND customer_email = ? LIMIT 1`,
      )
      .bind(input.orderNumber, email)
      .first<{ id: string }>();
    if (!order) throw new Error("ORDER_NOT_FOUND");
    orderId = order.id;
  }

  const id = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const ticketNumber = createTicketNumber();
  await database.batch([
    database
      .prepare(
        `INSERT INTO support_tickets (
           id, ticket_number, customer_email, customer_name, order_id,
           subject, category, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
      )
      .bind(
        id,
        ticketNumber,
        email,
        input.customerName,
        orderId,
        input.subject,
        input.category,
      ),
    database
      .prepare(
        `INSERT INTO support_messages (
           id, ticket_id, author_email, author_role, body
         ) VALUES (?, ?, ?, 'customer', ?)`,
      )
      .bind(messageId, id, email, input.body),
    database
      .prepare(
        `INSERT INTO admin_audit_log (actor_email, action, subject_id)
         VALUES (?, 'support.ticket-created', ?)`,
      )
      .bind(email, id),
  ]);
  return getOwnedTicket(database, id, email);
}

export async function replyToCustomerSupportTicket(
  customerEmail: string,
  ticketId: string,
  body: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const email = customerEmail.trim().toLowerCase();
  const ticket = await database
    .prepare(
      `SELECT status FROM support_tickets
        WHERE id = ? AND customer_email = ? LIMIT 1`,
    )
    .bind(ticketId, email)
    .first<{ status: SupportTicketStatus }>();
  if (!ticket) throw new Error("SUPPORT_NOT_FOUND");
  if (ticket.status === "closed") throw new Error("SUPPORT_CLOSED");
  const recent = await database
    .prepare(
      `SELECT COUNT(*) AS count FROM support_messages
        WHERE ticket_id = ? AND author_email = ?
          AND created_at >= datetime('now', '-1 day')`,
    )
    .bind(ticketId, email)
    .first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= 20) throw new Error("SUPPORT_RATE_LIMIT");
  await database.batch([
    database
      .prepare(
        `INSERT INTO support_messages (
           id, ticket_id, author_email, author_role, body
         ) VALUES (?, ?, ?, 'customer', ?)`,
      )
      .bind(crypto.randomUUID(), ticketId, email, body),
    database
      .prepare(
        `UPDATE support_tickets SET status = 'open', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND customer_email = ? AND status != 'closed'`,
      )
      .bind(ticketId, email),
    database
      .prepare(
        `INSERT INTO admin_audit_log (actor_email, action, subject_id)
         VALUES (?, 'support.customer-replied', ?)`,
      )
      .bind(email, ticketId),
  ]);
  return getOwnedTicket(database, ticketId, email);
}

export async function updateAdminSupportTicket(
  input: {
    ticketId: string;
    status: SupportTicketStatus;
    reply: string;
    actorEmail: string;
  },
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const current = await database
    .prepare(
      `SELECT status, customer_email, ticket_number FROM support_tickets
        WHERE id = ? LIMIT 1`,
    )
    .bind(input.ticketId)
    .first<{
      status: SupportTicketStatus;
      customer_email: string;
      ticket_number: string;
    }>();
  if (!current) throw new Error("SUPPORT_NOT_FOUND");
  if (
    input.status !== current.status &&
    !allowedTransitions[current.status].includes(input.status)
  ) {
    throw new Error("SUPPORT_INVALID_TRANSITION");
  }
  if (!input.reply && input.status === current.status) {
    throw new Error("SUPPORT_NO_CHANGES");
  }
  if (current.status === "closed" && input.reply) {
    throw new Error("SUPPORT_INVALID_TRANSITION");
  }
  const actorEmail = input.actorEmail.trim().toLowerCase();
  const statements = [
    ...(input.reply
      ? [
          database
            .prepare(
              `INSERT INTO support_messages (
                 id, ticket_id, author_email, author_role, body
               ) VALUES (?, ?, ?, 'admin', ?)`,
            )
            .bind(crypto.randomUUID(), input.ticketId, actorEmail, input.reply),
        ]
      : []),
    database
      .prepare(
        `UPDATE support_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      )
      .bind(input.status, input.ticketId),
    notificationStatement(database, {
      ownerEmail: current.customer_email,
      type: "support",
      title: `به‌روزرسانی تیکت ${current.ticket_number}`,
      body: input.reply || supportStatusNotification(input.status),
      href: "/account#support",
    }),
    database
      .prepare(
        `INSERT INTO admin_audit_log (actor_email, action, subject_id)
         VALUES (?, 'support.admin-updated', ?)`,
      )
      .bind(actorEmail, input.ticketId),
  ];
  await database.batch(statements);
  return getAdminTicket(database, input.ticketId);
}

export async function deleteAdminSupportTicket(
  ticketId: string,
  actorEmail: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const current = await database
    .prepare("SELECT id FROM support_tickets WHERE id = ? LIMIT 1")
    .bind(ticketId)
    .first<{ id: string }>();
  if (!current) throw new Error("SUPPORT_NOT_FOUND");
  await database.batch([
    database.prepare("DELETE FROM support_messages WHERE ticket_id = ?").bind(ticketId),
    database.prepare("DELETE FROM support_tickets WHERE id = ?").bind(ticketId),
    database
      .prepare("INSERT INTO admin_audit_log (actor_email, action, subject_id) VALUES (?, 'support.deleted', ?)")
      .bind(actorEmail.trim().toLowerCase(), ticketId),
  ]);
  return { deleted: true as const };
}

export async function listCustomerNotifications(
  customerEmail: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const result = await database
    .prepare(
      `SELECT id, type, title, body, href, read_at, created_at
         FROM customer_notifications
        WHERE owner_email = ? ORDER BY created_at DESC LIMIT 100`,
    )
    .bind(customerEmail.trim().toLowerCase())
    .all<NotificationRow>();
  return result.results.map(mapNotification);
}

export async function markCustomerNotificationsRead(
  customerEmail: string,
  notificationId?: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const email = customerEmail.trim().toLowerCase();
  if (notificationId) {
    const result = await database
      .prepare(
        `UPDATE customer_notifications SET read_at = CURRENT_TIMESTAMP
          WHERE id = ? AND owner_email = ? AND read_at = ''`,
      )
      .bind(notificationId, email)
      .run();
    if (Number(result.meta?.changes ?? 0) === 0) {
      const owned = await database
        .prepare(
          `SELECT 1 AS owned FROM customer_notifications
            WHERE id = ? AND owner_email = ? LIMIT 1`,
        )
        .bind(notificationId, email)
        .first<{ owned: number }>();
      if (!owned) throw new Error("NOTIFICATION_NOT_FOUND");
    }
  } else {
    await database
      .prepare(
        `UPDATE customer_notifications SET read_at = CURRENT_TIMESTAMP
          WHERE owner_email = ? AND read_at = ''`,
      )
      .bind(email)
      .run();
  }
  return listCustomerNotifications(email, database);
}

export function notificationStatement(
  database: D1Database,
  input: {
    ownerEmail: string;
    type: string;
    title: string;
    body: string;
    href: string;
  },
) {
  return database
    .prepare(
      `INSERT INTO customer_notifications (
         id, owner_email, type, title, body, href
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.ownerEmail.trim().toLowerCase(),
      input.type,
      input.title,
      input.body,
      input.href,
    );
}

async function attachMessages(database: D1Database, rows: TicketRow[]) {
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => "?").join(",");
  const messageResult = await database
    .prepare(
      `SELECT id, ticket_id, author_role, body, created_at
         FROM support_messages
        WHERE ticket_id IN (${placeholders})
        ORDER BY created_at ASC, rowid ASC LIMIT 5000`,
    )
    .bind(...rows.map((row) => row.id))
    .all<MessageRow>();
  const grouped = new Map<string, SupportMessage[]>();
  for (const row of messageResult.results) {
    const messages = grouped.get(row.ticket_id) ?? [];
    messages.push(mapMessage(row));
    grouped.set(row.ticket_id, messages);
  }
  return rows.map((row) => mapTicket(row, grouped.get(row.id) ?? []));
}

async function getOwnedTicket(database: D1Database, id: string, email: string) {
  const result = await database
    .prepare(`${TICKET_SELECT} WHERE t.id = ? AND t.customer_email = ? LIMIT 1`)
    .bind(id, email)
    .all<TicketRow>();
  return (await attachMessages(database, result.results))[0] ?? null;
}

async function getAdminTicket(database: D1Database, id: string) {
  const result = await database
    .prepare(`${TICKET_SELECT} WHERE t.id = ? LIMIT 1`)
    .bind(id)
    .all<TicketRow>();
  return (await attachMessages(database, result.results))[0] ?? null;
}

function mapTicket(row: TicketRow, messages: SupportMessage[]): SupportTicket {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    orderId: row.order_id,
    orderNumber: row.order_number ?? "",
    subject: row.subject,
    category: row.category,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages,
  };
}

function mapMessage(row: MessageRow): SupportMessage {
  return {
    id: row.id,
    authorRole: row.author_role,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapNotification(row: NotificationRow): CustomerNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

function supportStatusNotification(status: SupportTicketStatus) {
  return status === "resolved"
    ? "درخواست شما حل‌شده علامت‌گذاری شد."
    : status === "closed"
      ? "این تیکت بسته شد."
      : status === "waiting_customer"
        ? "پشتیبانی منتظر پاسخ شماست."
        : "وضعیت درخواست پشتیبانی شما به‌روزرسانی شد.";
}

function createTicketNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `MS-SUP-${date}-${random}`;
}

async function requireDatabase() {
  const bindings = await getRuntimeEnv<{ DB?: D1Database }>();
  if (!bindings.DB) throw new Error("DATABASE_UNAVAILABLE");
  return bindings.DB;
}
