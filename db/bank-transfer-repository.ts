import { getRuntimeEnv } from "../lib/runtime-env.ts";
import type {
  BankTransferReceipt,
  BankTransferReceiptStatus,
} from "../features/orders/order-types.ts";

type ReceiptRow = {
  id: string;
  order_id: string;
  order_number: string;
  customer_email: string;
  customer_name: string;
  original_name: string;
  content_type: string;
  size: number;
  transfer_reference: string;
  customer_note: string;
  status: BankTransferReceiptStatus;
  reviewed_by: string;
  reviewed_at: string;
  review_note: string;
  created_at: string;
  updated_at: string;
  total_minor: number;
  currency: string;
};

const RECEIPT_SELECT = `
  SELECT r.id, r.order_id, o.order_number, r.customer_email,
         o.customer_name, r.original_name, r.content_type, r.size,
         r.transfer_reference, r.customer_note, r.status, r.reviewed_by,
         r.reviewed_at, r.review_note, r.created_at, r.updated_at,
         o.total_minor, o.currency
    FROM bank_transfer_receipts r
    JOIN orders o ON o.id = r.order_id`;

export async function createBankTransferReceipt(
  input: {
    orderId: string;
    customerEmail: string;
    storageKey: string;
    originalName: string;
    contentType: string;
    size: number;
    transferReference: string;
    customerNote: string;
    reviewHours: number;
  },
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const reviewUntil = new Date(
    Date.now() + Math.max(1, Math.min(72, input.reviewHours)) * 3_600_000,
  ).toISOString();
  const results = await database.batch([
    database
      .prepare(
        `INSERT INTO bank_transfer_receipts (
           id, order_id, customer_email, storage_key, original_name,
           content_type, size, transfer_reference, customer_note
         )
         SELECT ?, o.id, ?, ?, ?, ?, ?, ?, ?
           FROM orders o
          WHERE o.id = ? AND o.customer_email = ? AND o.status = 'new'
            AND o.currency = 'IRR' AND o.payment_status != 'paid'
            AND o.reservation_expires_at != ''
            AND o.reservation_expires_at > ?
            AND NOT EXISTS (
              SELECT 1 FROM bank_transfer_receipts existing
               WHERE existing.order_id = o.id AND existing.status = 'pending'
            )
            AND NOT EXISTS (
              SELECT 1 FROM payment_attempts attempt
               WHERE attempt.order_id = o.id AND attempt.status = 'pending'
            )`,
      )
      .bind(
        id,
        input.customerEmail.toLowerCase(),
        input.storageKey,
        input.originalName,
        input.contentType,
        input.size,
        input.transferReference,
        input.customerNote,
        input.orderId,
        input.customerEmail.toLowerCase(),
        now,
      ),
    database
      .prepare(
        `UPDATE orders
            SET payment_status = 'pending',
                reservation_expires_at = MAX(reservation_expires_at, ?),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'new'
            AND EXISTS (
              SELECT 1 FROM bank_transfer_receipts
               WHERE id = ? AND order_id = orders.id AND status = 'pending'
            )`,
      )
      .bind(reviewUntil, input.orderId, id),
    database
      .prepare(
        `INSERT INTO admin_audit_log (actor_email, action, subject_id)
         SELECT ?, 'bank-transfer.receipt-submitted', ?
          WHERE EXISTS (
            SELECT 1 FROM bank_transfer_receipts WHERE id = ?
          )`,
      )
      .bind(input.customerEmail.toLowerCase(), input.orderId, id),
  ]);
  if (changedRows(results[0]) !== 1 || changedRows(results[1]) !== 1) {
    const pending = await database
      .prepare(
        `SELECT id FROM bank_transfer_receipts
          WHERE order_id = ? AND status = 'pending' LIMIT 1`,
      )
      .bind(input.orderId)
      .first<{ id: string }>();
    throw new Error(pending ? "RECEIPT_PENDING" : "ORDER_NOT_PAYABLE");
  }
  return getReceiptById(id, database);
}

export async function listBankTransferReceipts(
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const result = await database
    .prepare(`${RECEIPT_SELECT} ORDER BY r.created_at DESC LIMIT 500`)
    .all<ReceiptRow>();
  return result.results.map(mapReceipt);
}

export async function listCustomerBankTransferReceipts(
  customerEmail: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const result = await database
    .prepare(
      `${RECEIPT_SELECT}
        WHERE r.customer_email = ? AND o.customer_email = ?
        ORDER BY r.created_at DESC LIMIT 100`,
    )
    .bind(customerEmail.trim().toLowerCase(), customerEmail.trim().toLowerCase())
    .all<ReceiptRow>();
  return result.results.map(mapReceipt);
}

export async function reviewBankTransferReceipt(
  input: {
    id: string;
    status: "approved" | "rejected";
    actorEmail: string;
    reviewNote: string;
  },
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const current = await getReceiptById(input.id, database);
  if (!current) throw new Error("RECEIPT_NOT_FOUND");
  if (current.status === input.status) return current;
  if (current.status !== "pending") throw new Error("RECEIPT_ALREADY_REVIEWED");

  const now = new Date().toISOString();
  const actorEmail = input.actorEmail.trim().toLowerCase();
  const approvalGuard = input.status === "approved"
    ? `AND EXISTS (
         SELECT 1 FROM orders o
          WHERE o.id = bank_transfer_receipts.order_id
            AND o.status = 'new' AND o.currency = 'IRR'
            AND o.payment_status != 'paid'
            AND o.reservation_expires_at != ''
            AND o.reservation_expires_at > ?
       )`
    : "";
  const receiptUpdate = database
    .prepare(
      `UPDATE bank_transfer_receipts
          SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending' ${approvalGuard}`,
    );
  const boundReceiptUpdate = input.status === "approved"
    ? receiptUpdate.bind(
        input.status,
        actorEmail,
        now,
        input.reviewNote,
        input.id,
        now,
      )
    : receiptUpdate.bind(
        input.status,
        actorEmail,
        now,
        input.reviewNote,
        input.id,
      );
  const orderUpdate = input.status === "approved"
    ? database
        .prepare(
          `UPDATE orders
              SET payment_status = 'paid', status = 'confirmed',
                  reservation_expires_at = '', updated_at = CURRENT_TIMESTAMP
            WHERE id = (
              SELECT order_id FROM bank_transfer_receipts
               WHERE id = ? AND status = 'approved'
                 AND reviewed_by = ? AND reviewed_at = ?
            ) AND status = 'new'`,
        )
        .bind(input.id, actorEmail, now)
    : database
        .prepare(
          `UPDATE orders
              SET payment_status = 'failed', updated_at = CURRENT_TIMESTAMP
            WHERE id = (
              SELECT order_id FROM bank_transfer_receipts
               WHERE id = ? AND status = 'rejected'
                 AND reviewed_by = ? AND reviewed_at = ?
            ) AND status = 'new' AND payment_status != 'paid'`,
        )
        .bind(input.id, actorEmail, now);
  const results = await database.batch([
    boundReceiptUpdate,
    orderUpdate,
    database
      .prepare(
        `INSERT INTO admin_audit_log (actor_email, action, subject_id)
         SELECT ?, ?, order_id FROM bank_transfer_receipts
          WHERE id = ? AND status = ? AND reviewed_by = ? AND reviewed_at = ?`,
      )
      .bind(
        actorEmail,
        `bank-transfer.receipt-${input.status}`,
        input.id,
        input.status,
        actorEmail,
        now,
      ),
  ]);
  if (
    changedRows(results[0]) !== 1 ||
    (input.status === "approved" && changedRows(results[1]) !== 1)
  ) {
    throw new Error(input.status === "approved" ? "ORDER_NOT_PAYABLE" : "RECEIPT_REVIEW_FAILED");
  }
  return getReceiptById(input.id, database);
}

export async function getBankTransferReceiptFile(
  id: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  return database
    .prepare(
      `SELECT storage_key, original_name, content_type
         FROM bank_transfer_receipts WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<{
      storage_key: string;
      original_name: string;
      content_type: string;
    }>();
}

export async function hasPendingBankTransferReceipt(
  orderId: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const row = await database
    .prepare(
      `SELECT 1 AS pending FROM bank_transfer_receipts
        WHERE order_id = ? AND status = 'pending' LIMIT 1`,
    )
    .bind(orderId)
    .first<{ pending: number }>();
  return row?.pending === 1;
}

async function getReceiptById(id: string, database: D1Database) {
  const row = await database
    .prepare(`${RECEIPT_SELECT} WHERE r.id = ? LIMIT 1`)
    .bind(id)
    .first<ReceiptRow>();
  return row ? mapReceipt(row) : null;
}

function mapReceipt(row: ReceiptRow): BankTransferReceipt {
  return {
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    originalName: row.original_name,
    contentType: row.content_type,
    size: row.size,
    transferReference: row.transfer_reference,
    customerNote: row.customer_note,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalMinor: row.total_minor,
    currency: row.currency,
  };
}

function changedRows(result: D1Result<unknown> | undefined) {
  return Number(result?.meta?.changes ?? 0);
}

async function requireDatabase() {
  const bindings = await getRuntimeEnv<{ DB?: D1Database }>();
  if (!bindings.DB) throw new Error("DATABASE_UNAVAILABLE");
  return bindings.DB;
}
