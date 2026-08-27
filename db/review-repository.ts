import type {
  CustomerReviewState,
  ProductReview,
  ReviewStatus,
} from "../features/reviews/review-types.ts";
import { getRuntimeEnv } from "../lib/runtime-env.ts";
import { notificationStatement } from "./customer-care-repository.ts";

type ReviewRow = {
  id: string;
  product_id: string;
  product_title: string;
  customer_email: string;
  customer_name: string;
  order_id: string;
  rating: number;
  title: string;
  body: string;
  status: ReviewStatus;
  moderated_by: string;
  moderated_at: string;
  moderation_note: string;
  created_at: string;
  updated_at: string;
};

const REVIEW_SELECT = `
  SELECT r.id, r.product_id, p.title AS product_title, r.customer_email,
         r.customer_name, r.order_id, r.rating, r.title, r.body, r.status,
         r.moderated_by, r.moderated_at, r.moderation_note, r.created_at,
         r.updated_at
    FROM product_reviews r
    JOIN products p ON p.id = r.product_id`;

export async function listApprovedProductReviews(
  productId: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const result = await database
    .prepare(
      `${REVIEW_SELECT}
        WHERE r.product_id = ? AND r.status = 'approved'
        ORDER BY r.created_at DESC LIMIT 100`,
    )
    .bind(productId)
    .all<ReviewRow>();
  return result.results.map(mapReview);
}

export async function listAdminProductReviews(databaseOverride?: D1Database) {
  const database = databaseOverride ?? await requireDatabase();
  const result = await database
    .prepare(
      `${REVIEW_SELECT}
        ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
                 r.created_at DESC LIMIT 500`,
    )
    .all<ReviewRow>();
  return result.results.map(mapReview);
}

export async function getCustomerReviewState(
  productId: string,
  customerEmail: string,
  databaseOverride?: D1Database,
): Promise<CustomerReviewState> {
  const database = databaseOverride ?? await requireDatabase();
  const email = customerEmail.trim().toLowerCase();
  const [reviewRow, eligibleRow] = await Promise.all([
    database
      .prepare(`${REVIEW_SELECT} WHERE r.product_id = ? AND r.customer_email = ? LIMIT 1`)
      .bind(productId, email)
      .first<ReviewRow>(),
    database
      .prepare(
        `SELECT 1 AS eligible
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = ? AND o.customer_email = ?
            AND o.status = 'shipped' AND o.payment_status = 'paid'
          LIMIT 1`,
      )
      .bind(productId, email)
      .first<{ eligible: number }>(),
  ]);
  return {
    eligible: eligibleRow?.eligible === 1,
    review: reviewRow ? mapReview(reviewRow) : null,
  };
}

export async function submitProductReview(
  input: {
    productId: string;
    customerEmail: string;
    customerName: string;
    rating: number;
    title: string;
    body: string;
  },
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  if (
    !input.productId ||
    !Number.isInteger(input.rating) ||
    input.rating < 1 ||
    input.rating > 5 ||
    input.body.trim().length < 10 ||
    input.body.length > 1_500 ||
    input.title.length > 120
  ) {
    throw new Error("REVIEW_INVALID");
  }
  const email = input.customerEmail.trim().toLowerCase();
  const eligibleOrder = await database
    .prepare(
      `SELECT o.id
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = ? AND o.customer_email = ?
          AND o.status = 'shipped' AND o.payment_status = 'paid'
        ORDER BY o.updated_at DESC LIMIT 1`,
    )
    .bind(input.productId, email)
    .first<{ id: string }>();
  if (!eligibleOrder) throw new Error("REVIEW_NOT_ELIGIBLE");
  const existing = await database
    .prepare(
      `SELECT id, status FROM product_reviews
        WHERE product_id = ? AND customer_email = ? LIMIT 1`,
    )
    .bind(input.productId, email)
    .first<{ id: string; status: ReviewStatus }>();
  if (existing && existing.status !== "rejected") {
    throw new Error("REVIEW_EXISTS");
  }
  const id = existing?.id ?? crypto.randomUUID();
  const statements = existing
    ? [
        database
          .prepare(
            `UPDATE product_reviews
                SET rating = ?, title = ?, body = ?, status = 'pending',
                    customer_name = ?, order_id = ?, moderated_by = '',
                    moderated_at = '', moderation_note = '',
                    updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND customer_email = ? AND status = 'rejected'`,
          )
          .bind(
            input.rating,
            input.title,
            input.body,
            input.customerName,
            eligibleOrder.id,
            id,
            email,
          ),
      ]
    : [
        database
          .prepare(
            `INSERT INTO product_reviews (
               id, product_id, customer_email, customer_name, order_id,
               rating, title, body, status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          )
          .bind(
            id,
            input.productId,
            email,
            input.customerName,
            eligibleOrder.id,
            input.rating,
            input.title,
            input.body,
          ),
      ];
  await database.batch([
    ...statements,
    database
      .prepare(
        `INSERT INTO admin_audit_log (actor_email, action, subject_id)
         VALUES (?, 'review.submitted', ?)`,
      )
      .bind(email, id),
  ]);
  return getReviewById(database, id);
}

export async function moderateProductReview(
  input: {
    reviewId: string;
    status: "approved" | "rejected";
    moderationNote: string;
    actorEmail: string;
  },
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const current = await database
    .prepare(
      `SELECT customer_email, product_id, status FROM product_reviews
        WHERE id = ? LIMIT 1`,
    )
    .bind(input.reviewId)
    .first<{
      customer_email: string;
      product_id: string;
      status: ReviewStatus;
    }>();
  if (!current) throw new Error("REVIEW_NOT_FOUND");
  if (current.status === input.status) return getReviewById(database, input.reviewId);
  if (current.status !== "pending") throw new Error("REVIEW_ALREADY_MODERATED");
  const actorEmail = input.actorEmail.trim().toLowerCase();
  const productSlug = await getProductSlug(database, current.product_id);
  const result = await database.batch([
    database
      .prepare(
        `UPDATE product_reviews
            SET status = ?, moderated_by = ?, moderated_at = ?,
                moderation_note = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'pending'`,
      )
      .bind(
        input.status,
        actorEmail,
        new Date().toISOString(),
        input.moderationNote,
        input.reviewId,
      ),
    notificationStatement(database, {
      ownerEmail: current.customer_email,
      type: "review",
      title: input.status === "approved" ? "دیدگاه شما منتشر شد" : "دیدگاه شما نیازمند اصلاح است",
      body: input.moderationNote || (input.status === "approved" ? "دیدگاه شما پس از بررسی در صفحه محصول منتشر شد." : "دیدگاه رد شد و می‌توانید پس از اصلاح دوباره ارسال کنید."),
      href: `/product/${encodeURIComponent(productSlug)}#reviews`,
    }),
    database
      .prepare(
        `INSERT INTO admin_audit_log (actor_email, action, subject_id)
         VALUES (?, ?, ?)`,
      )
      .bind(actorEmail, `review.${input.status}`, input.reviewId),
  ]);
  if (Number(result[0]?.meta?.changes ?? 0) !== 1) {
    throw new Error("REVIEW_ALREADY_MODERATED");
  }
  return getReviewById(database, input.reviewId);
}

export async function deleteProductReview(
  reviewId: string,
  actorEmail: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const current = await database
    .prepare("SELECT id FROM product_reviews WHERE id = ? LIMIT 1")
    .bind(reviewId)
    .first<{ id: string }>();
  if (!current) throw new Error("REVIEW_NOT_FOUND");
  await database.batch([
    database.prepare("DELETE FROM product_reviews WHERE id = ?").bind(reviewId),
    database
      .prepare("INSERT INTO admin_audit_log (actor_email, action, subject_id) VALUES (?, 'review.deleted', ?)")
      .bind(actorEmail.trim().toLowerCase(), reviewId),
  ]);
  return { deleted: true as const };
}

async function getReviewById(database: D1Database, id: string) {
  const row = await database
    .prepare(`${REVIEW_SELECT} WHERE r.id = ? LIMIT 1`)
    .bind(id)
    .first<ReviewRow>();
  if (!row) throw new Error("REVIEW_NOT_FOUND");
  return mapReview(row);
}

async function getProductSlug(database: D1Database, productId: string) {
  const row = await database
    .prepare("SELECT slug FROM products WHERE id = ? LIMIT 1")
    .bind(productId)
    .first<{ slug: string }>();
  return row?.slug ?? "";
}

function mapReview(row: ReviewRow): ProductReview {
  return {
    id: row.id,
    productId: row.product_id,
    productTitle: row.product_title,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    orderId: row.order_id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    status: row.status,
    moderatedBy: row.moderated_by,
    moderatedAt: row.moderated_at,
    moderationNote: row.moderation_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requireDatabase() {
  const bindings = await getRuntimeEnv<{ DB?: D1Database }>();
  if (!bindings.DB) throw new Error("DATABASE_UNAVAILABLE");
  return bindings.DB;
}
