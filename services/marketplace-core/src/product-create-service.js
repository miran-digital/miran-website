import { randomUUID } from "node:crypto";
import { transaction } from "./database.js";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function actorFor(db, actorId) {
  const actor = db.prepare("SELECT id,role,status FROM users WHERE id=?").get(actorId);
  if (!actor || actor.status !== "ACTIVE" || !["ADMIN", "SELLER"].includes(actor.role)) {
    fail("Seller or admin role required", "FORBIDDEN");
  }
  return actor;
}

function slug(value) {
  const result = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)) fail("Invalid product slug");
  return result;
}

function jsonArray(value, name, maxItems) {
  const items = value === undefined ? [] : value;
  if (!Array.isArray(items) || items.length > maxItems) fail(`Invalid ${name}`);
  return JSON.stringify(items);
}

export class ProductCreateService {
  constructor(db) {
    this.db = db;
  }

  create(actorId, input) {
    const actor = actorFor(this.db, actorId);
    const title = String(input.title || "").trim();
    if (!title || title.length > 180) fail("Product title is required");
    const productSlug = slug(input.slug);
    const brand = String(input.brand || "").trim();
    if (brand.length > 120) fail("Brand is too long");

    const basePriceIrr = Number(input.basePriceIrr);
    if (!Number.isSafeInteger(basePriceIrr) || basePriceIrr < 0) fail("Price must be integer IRR");
    const discountType = input.discountType || "NONE";
    const discountValue = Number(input.discountValue || 0);
    if (!["NONE", "PERCENTAGE", "FIXED_IRR"].includes(discountType)) fail("Invalid discount type");
    if (!Number.isSafeInteger(discountValue) || discountValue < 0) fail("Invalid discount value");
    if (discountType === "PERCENTAGE" && discountValue > 100) fail("Percentage discount cannot exceed 100");
    if (discountType === "FIXED_IRR" && discountValue > basePriceIrr) fail("Fixed discount cannot exceed price");

    const stockOnHand = Number(input.stockOnHand || 0);
    if (!Number.isSafeInteger(stockOnHand) || stockOnHand < 0) fail("Stock must be non-negative integer");

    const categoryId = input.categoryId || null;
    if (categoryId) {
      const category = this.db.prepare("SELECT id FROM categories WHERE id=?").get(categoryId);
      if (!category) fail("Category not found", "NOT_FOUND");
    }

    let sellerId = input.sellerId || null;
    if (actor.role === "SELLER") {
      const seller = this.db.prepare("SELECT id FROM sellers WHERE user_id=? AND status='APPROVED'").get(actorId);
      if (!seller) fail("Approved seller required", "FORBIDDEN");
      sellerId = seller.id;
    } else if (sellerId) {
      const seller = this.db.prepare("SELECT id FROM sellers WHERE id=? AND status='APPROVED'").get(sellerId);
      if (!seller) fail("Approved seller not found", "FORBIDDEN");
    }

    const status = input.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
    const id = randomUUID();
    const highlightsJson = jsonArray(input.highlights, "highlights", 20);
    const specificationsJson = jsonArray(input.specifications, "specifications", 50);

    return transaction(this.db, () => {
      this.db.prepare(
        `INSERT INTO products (
          id,seller_id,category_id,title,slug,description,base_price_irr,
          discount_type,discount_value,discount_starts_at,discount_ends_at,is_amazing,
          status,brand,highlights_json,specifications_json
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        sellerId,
        categoryId,
        title,
        productSlug,
        String(input.description || "").slice(0, 10_000),
        basePriceIrr,
        discountType,
        discountValue,
        input.discountStartsAt || null,
        input.discountEndsAt || null,
        input.isAmazing ? 1 : 0,
        status,
        brand,
        highlightsJson,
        specificationsJson,
      );
      this.db.prepare("INSERT INTO inventory (product_id,stock_on_hand,stock_reserved) VALUES (?,?,0)").run(id, stockOnHand);
      this.db.prepare("INSERT INTO audit_log (id,actor_user_id,action,entity_type,entity_id,details_json) VALUES (?,?,?,?,?,?)")
        .run(randomUUID(), actorId, "PRODUCT_CREATED", "PRODUCT", id, JSON.stringify({ status, categoryId, sellerId }));
      return this.db.prepare("SELECT * FROM products WHERE id=?").get(id);
    });
  }
}
