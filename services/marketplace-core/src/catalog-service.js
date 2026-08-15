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
          `SELECT p.*,i.stock_on_hand,i.stock_reserved
           FROM products p JOIN inventory i ON i.product_id=p.id
           ORDER BY p.updated_at DESC`,
        )
        .all()
        .map((product) => this.toManagedProduct(product));
    }
    if (actor.role !== "SELLER") fail("Seller or admin role required", "FORBIDDEN");
    return this.db
      .prepare(
        `SELECT p.*,i.stock_on_hand,i.stock_reserved
         FROM products p
         JOIN inventory i ON i.product_id=p.id
         JOIN sellers s ON s.id=p.seller_id
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
    if (!title) fail("Title is required");

    this.db
      .prepare(
        `UPDATE products
         SET title=?,description=?,base_price_irr=?,discount_type=?,discount_value=?,
             discount_starts_at=?,discount_ends_at=?,is_amazing=?,updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
      )
      .run(
        title,
        description,
        basePriceIrr,
        discountType,
        discountValue,
        input.discountStartsAt === undefined
          ? product.discount_starts_at
          : input.discountStartsAt || null,
        input.discountEndsAt === undefined
          ? product.discount_ends_at
          : input.discountEndsAt || null,
        input.isAmazing === undefined ? product.is_amazing : input.isAmazing ? 1 : 0,
        productId,
      );
    return this.getManaged(actorId, productId);
  }

  setPublished(actorId, productId, published) {
    this.requireManageable(actorId, productId);
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
        Number.isSafeInteger(input.sortOrder) ? input.sortOrder : 0,
        input.isPrimary ? 1 : 0,
      );
    return this.db.prepare("SELECT * FROM product_media WHERE id=?").get(id);
  }

  getManaged(actorId, productId) {
    this.requireManageable(actorId, productId);
    const product = this.db
      .prepare(
        `SELECT p.*,i.stock_on_hand,i.stock_reserved
         FROM products p JOIN inventory i ON i.product_id=p.id WHERE p.id=?`,
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
      stockOnHand: product.stock_on_hand,
      stockReserved: product.stock_reserved,
      discountType: product.discount_type,
      discountValue: product.discount_value,
      discountStartsAt: product.discount_starts_at,
      discountEndsAt: product.discount_ends_at,
    };
  }
}
