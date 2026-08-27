import { getRuntimeEnv } from "../lib/runtime-env.ts";

export type ProductEngagementSummary = {
  ratingAverage: number | null;
  reviewCount: number;
  questionCount: number;
};

export type ProductPriceHistoryEntry = {
  id: string;
  productId: string;
  sourceType: "product" | "variant" | "seller_offer";
  sourceId: string;
  previousPriceMinor: number;
  newPriceMinor: number;
  previousCompareAtPriceMinor: number;
  newCompareAtPriceMinor: number;
  currency: "IRR";
  changedAt: string;
};

export async function getProductEngagementSummary(
  productId: string,
  databaseOverride?: D1Database,
): Promise<ProductEngagementSummary> {
  const database = databaseOverride ?? await requireDatabase();
  const id = productId.trim().slice(0, 120);
  const [reviews, questions] = await Promise.all([
    database
      .prepare(
        `SELECT AVG(rating) AS rating_average, COUNT(*) AS review_count
           FROM product_reviews
          WHERE product_id = ? AND status = 'approved'`,
      )
      .bind(id)
      .first<{ rating_average: number | null; review_count: number }>(),
    database
      .prepare(
        `SELECT COUNT(*) AS question_count
           FROM product_questions
          WHERE product_id = ? AND status = 'published'`,
      )
      .bind(id)
      .first<{ question_count: number }>(),
  ]);
  const reviewCount = Number(reviews?.review_count ?? 0);
  return {
    ratingAverage: reviewCount > 0 ? Number(reviews?.rating_average ?? 0) : null,
    reviewCount,
    questionCount: Number(questions?.question_count ?? 0),
  };
}

export async function listProductPriceHistory(
  productId: string,
  limit = 100,
  databaseOverride?: D1Database,
): Promise<ProductPriceHistoryEntry[]> {
  const database = databaseOverride ?? await requireDatabase();
  const result = await database
    .prepare(
      `SELECT id, product_id, source_type, source_id,
              previous_price_minor, new_price_minor,
              previous_compare_at_price_minor, new_compare_at_price_minor,
              currency, changed_at
         FROM product_price_history
        WHERE product_id = ?
        ORDER BY changed_at DESC, rowid DESC
        LIMIT ?`,
    )
    .bind(productId.trim().slice(0, 120), Math.max(1, Math.min(500, Math.trunc(limit))))
    .all<{
      id: string;
      product_id: string;
      source_type: ProductPriceHistoryEntry["sourceType"];
      source_id: string;
      previous_price_minor: number;
      new_price_minor: number;
      previous_compare_at_price_minor: number;
      new_compare_at_price_minor: number;
      currency: string;
      changed_at: string;
    }>();
  return result.results.map((row) => ({
    id: row.id,
    productId: row.product_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    previousPriceMinor: row.previous_price_minor,
    newPriceMinor: row.new_price_minor,
    previousCompareAtPriceMinor: row.previous_compare_at_price_minor,
    newCompareAtPriceMinor: row.new_compare_at_price_minor,
    currency: "IRR",
    changedAt: row.changed_at,
  }));
}

async function requireDatabase() {
  const bindings = await getRuntimeEnv<{ DB?: D1Database }>();
  if (!bindings.DB) throw new Error("پایگاه‌داده فروشگاه در دسترس نیست.");
  return bindings.DB;
}
