import { randomUUID } from "node:crypto";
import { priceProduct } from "./core.js";
import { transaction } from "./database.js";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireActor(db, actorId) {
  const actor = db
    .prepare("SELECT id,role,status FROM users WHERE id=?")
    .get(actorId);
  if (!actor || actor.status !== "ACTIVE") fail("Actor not found", "FORBIDDEN");
  return actor;
}

function validateDiscount(basePriceIrr, type, value) {
  if (!Number.isSafeInteger(basePriceIrr) || basePriceIrr < 0) {
    fail("Price must be an integer IRR amount");
  }
  if (!["NONE", "PERCENTAGE", "FIXED_IRR"].includes(type)) {
    fail("Invalid discount type");
  }
  if (!Number.isSafeInteger(value) || value < 0) fail("Invalid discount value");
  if (type === "PERCENTAGE" && value > 100) {
    fail("Percentage discount cannot exceed 100");
  }
  if (type === "FIXED_IRR" && value > basePriceIrr) {
    fail("Fixed discount cannot exceed base price");
  }
}

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function validateArray(value, max, label) {
  if (!Array.isArray(value) || value.length > max) fail(`Invalid ${label}`);
  return JSON.stringify(value);
}

function validateSchedule(startValue, endValue) {
  const start = startValue ? new Date(startValue) : null;
  const end = endValue ? new Date(endValue) : null;
  if (start && Number.isNaN(start.getTime())) fail("Invalid discount start time");
  if (end && Number.isNaN(end.getTime())) fail("Invalid discount end time");
  if (start && end && end <= start) fail("Discount end time must be after start time");
}

export class CatalogService {
  constructor(db) {
    this.db = db;
  }

  listPublished({ limit = 24, offset = 0 } = {}) {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 24));
    const safeOffset = Math.max(0, Number(offset) || 0);
    return this.db
      .prepare(
        `SELECT p.*,i.stock_on_hand,i.stock_reserved
         FROM products p
         JOIN inventory i ON i.product_id=p.id
         WHERE p.status='PUBLISHED'
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(safeLimit, safeOffset)
      .map((product) => this.toPublicProduct(product));
  }

  getPublished(idOrSlug) {
    const product = this.db
      .prepare(
        `SELECT p.*,i.stock_on_hand,i.stock_reserved
         FROM products p
         JOIN inventory i ON i.product_id=p.id
         WHERE p.status='PUBLISHED' AND (p.id=? OR p.slug=?)`,
      )
      .get(idOrSlug, idOrSlug);
    if (!product) fail("Product not found", "NOT_FOUND");
    return this.toPublicProduct(product);
  }

  listManaged(actorId) {
    const actor = requireActor(this.db, actorId);
    if (actor.role === "ADMIN") {
      return this.db
        .prepare(
          `SELECT p.*,i.stock_on_hand,i.stock_reserved,c.name AS category_name,c.slug AS category_slug
           FROM products p
           JOIN inventory i ON i.product_id=p.id
           LEFT JOIN categories c ON c.id=p.category_id
           ORDER BY p.updated_at DESC`,
        )
        .all()
        .map((product) => this.toManagedProduct(product));
    }
    if (actor.role !== "SELLER") fail("Seller or admin role required", "FORBIDDEN");
    return this.db
      .prepare(
        `SELECT p.*,i.stock_on_hand,i.stock_reserved,c.name AS category_name,c.slug AS category_slug
         FROM products p
         JOIN inventory i ON i.product_id=p.id
         JOIN sellers s ON s.id=p.seller_id
         LEFT JOIN categories c ON c.id=p.category_id
         WHERE s.user_id=? AND s.status='APPROVED'
         ORDER BY p.updated_at DESC`,
      )
      .all(actorId)
      .map((product) => this.toManagedProduct(product));
  }

  updateProduct(actorId, productId, input) {
    const product = this.requireManageable(actorId, productId);
    const basePriceIrr = input.basePriceIrr ?? Number(product.base_price_irr);
    const discountType = input.discountType ?? product.discount_type;
    const discountValue = input.discountValue ?? Number(product.discount_value);
    validateDiscount(basePriceIrr, discountType, discountValue);

    const title = input.title === undefined ? product.title : String(input.title).trim();
    const description = input.description === undefined ? product.description : String(input.description);
    const brand = input.brand === undefined ? product.brand : String(input.brand || "").trim();
    if (!title || title.length > 180) fail("Title is required");
    if (brand.length > 120) fail("Brand is too long");

    const categoryId = input.categoryId === undefined ? product.category_id : input.categoryId || null;
    if (categoryId) {
      const category = this.db.prepare("SELECT id FROM categories WHERE id=?").get(categoryId);
      if (!category) fail("Category not found", "NOT_FOUND");
    }

    const startsAt = input.discountStartsAt === undefined
      ? product.discount_starts_at
      : input.discountStartsAt || null;
    const endsAt = input.discountEndsAt === undefined
      ? product.discount_ends_at
      : input.discountEndsAt || null;
    validateSchedule(startsAt, endsAt);

    const highlightsJson = input.highlights === undefined
      ? product.highlights_json
      : validateArray(input.highlights, 20, "highlights");
    const specificationsJson = input.specifications === undefined
      ? product.specifications_json
      : validateArray(input.specifications, 50, "specifications");

    this.db
      .prepare(
        `UPDATE products
         SET title=?,description=?,brand=?,category_id=?,base_price_irr=?,discount_type=?,discount_value=?,
             discount_starts_at=?,discount_ends_at=?,is_amazing=?,highlights_json=?,specifications_json=?,
             updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
      )
      .run(
        title,
        description,
        brand,
        categoryId,
        basePriceIrr,
        discountType,
        discountValue,
        startsAt,
        endsAt,
        input.isAmazing === undefined ? product.is_amazing : input.isAmazing ? 1 : 0,
        highlightsJson,
        specificationsJson,
        productId,
      );
    return this.getManaged(actorId, productId);
  }

  setPublished(actorId, productId, published) {
    const product = this.requireManageable(actorId, productId);
    if (published) {
      if (!product.title || !product.slug) fail("Product title and slug are required", "CONFLICT");
      const inventory = this.db.prepare("SELECT stock_on_hand FROM inventory WHERE product_id=?").get(productId);
      if (!inventory) fail("Inventory not found", "CONFLICT");
    }
    this.db
      .prepare("UPDATE products SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(published ? "PUBLISHED" : "DRAFT", productId);
    return this.getManaged(actorId, productId);
  }

  setInventory(actorId, productId, stockOnHand) {
    this.requireManageable(actorId, productId);
    if (!Number.isSafeInteger(stockOnHand) || stockOnHand < 0) {
      fail("Stock must be a non-negative integer");
    }
    return transaction(this.db, () => {
      const inventory = this.db
        .prepare("SELECT * FROM inventory WHERE product_id=?")
        .get(productId);
      if (!inventory) fail("Inventory not found", "NOT_FOUND");
      if (stockOnHand < inventory.stock_reserved) {
        fail("Stock cannot be lower than reserved quantity", "CONFLICT");
      }
      this.db
        .prepare(
          "UPDATE inventory SET stock_on_hand=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE product_id=?",
        )
        .run(stockOnHand, productId);
      return this.getManaged(actorId, productId);
    });
  }

  addMedia(actorId, productId, input) {
    this.requireManageable(actorId, productId);
    if (!["IMAGE", "VIDEO"].includes(input.mediaType)) fail("Invalid media type");
    const url = String(input.url || "").trim();
    if (!url.startsWith("/") && !/^https:\/\//i.test(url)) {
      fail("Media URL must be an internal path or HTTPS URL");
    }
    if (url.length > 1000) fail("Media URL is too long");
    const sortOrder = Number(input.sortOrder || 0);
    if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) {
      fail("Invalid media sort order");
    }
    const id = randomUUID();
    if (input.isPrimary && input.mediaType === "IMAGE") {
      this.db
        .prepare("UPDATE product_media SET is_primary=0 WHERE product_id=? AND media_type='IMAGE'")
        .run(productId);
    }
    this.db
      .prepare(
        "INSERT INTO product_media (id,product_id,media_type,url,sort_order,is_primary) VALUES (?,?,?,?,?,?)",
      )
      .run(
        id,
        productId,
        input.mediaType,
        url,
        sortOrder,
        input.isPrimary ? 1 : 0,
      );
    return this.db.prepare("SELECT * FROM product_media WHERE id=?").get(id);
  }

  getManaged(actorId, productId) {
    this.requireManageable(actorId, productId);
    const product = this.db
      .prepare(
        `SELECT p.*,i.stock_on_hand,i.stock_reserved,c.name AS category_name,c.slug AS category_slug
         FROM products p
         JOIN inventory i ON i.product_id=p.id
         LEFT JOIN categories c ON c.id=p.category_id
         WHERE p.id=?`,
      )
      .get(productId);
    return this.toManagedProduct(product);
  }

  requireManageable(actorId, productId) {
    const actor = requireActor(this.db, actorId);
    const product = this.db.prepare("SELECT * FROM products WHERE id=?").get(productId);
    if (!product) fail("Product not found", "NOT_FOUND");
    if (actor.role === "ADMIN") return product;
    if (actor.role !== "SELLER") fail("Seller or admin role required", "FORBIDDEN");
    const seller = this.db
      .prepare("SELECT * FROM sellers WHERE id=? AND user_id=? AND status='APPROVED'")
      .get(product.seller_id, actorId);
    if (!seller) fail("Seller cannot manage this product", "FORBIDDEN");
    return product;
  }

  toPublicProduct(product) {
    const pricing = priceProduct(product);
    const media = this.db
      .prepare(
        "SELECT id,media_type,url,sort_order,is_primary FROM product_media WHERE product_id=? ORDER BY is_primary DESC,sort_order ASC,created_at ASC",
      )
      .all(product.id);
    return {
      id: product.id,
      slug: product.slug,
      title: product.title,
      description: product.description,
      pricing,
      currency: "IRR",
      inStock: product.stock_on_hand - product.stock_reserved > 0,
      availableQuantity: Math.max(0, product.stock_on_hand - product.stock_reserved),
      isAmazing: Boolean(product.is_amazing),
      media,
    };
  }

  toManagedProduct(product) {
    return {
      ...this.toPublicProduct(product),
      status: product.status,
      sellerId: product.seller_id,
      categoryId: product.category_id,
      categoryName: product.category_name || null,
      categorySlug: product.category_slug || null,
      brand: product.brand || "",
      highlights: parseArray(product.highlights_json),
      specifications: parseArray(product.specifications_json),
      stockOnHand: product.stock_on_hand,
      stockReserved: product.stock_reserved,
      discountType: product.discount_type,
      discountValue: product.discount_value,
      discountStartsAt: product.discount_starts_at,
      discountEndsAt: product.discount_ends_at,
    };
  }
}
