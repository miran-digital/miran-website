import { randomUUID } from "node:crypto";
import { withPostgresTransaction } from "./database.js";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function assert(condition, message, code = "INVALID_INPUT") {
  if (!condition) fail(message, code);
}

function integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number >= min && number <= max, `Invalid ${label}`);
  return number;
}

function normalizeSlug(value, label = "slug") {
  const slug = String(value || "").trim().toLowerCase();
  assert(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug),
    `${label} must contain lowercase latin letters, digits and dashes only`,
  );
  return slug;
}

function validateUrl(value, label) {
  const url = String(value || "").trim();
  if (!url) return null;
  assert(url.length <= 1000, `${label} URL is too long`);
  assert(url.startsWith("/") || /^https:\/\//i.test(url), `${label} URL must be internal or HTTPS`);
  return url;
}

function validateDiscount(basePriceIrr, type, value) {
  const base = integer(basePriceIrr, "base price IRR");
  const discount = integer(value ?? 0, "discount value");
  assert(["NONE", "PERCENTAGE", "FIXED_IRR"].includes(type), "Invalid discount type");
  if (type === "PERCENTAGE") assert(discount <= 100, "Percentage discount cannot exceed 100");
  if (type === "FIXED_IRR") assert(discount <= base, "Fixed discount cannot exceed base price");
  return { base, discount };
}

function validateSchedule(startValue, endValue) {
  const start = startValue ? new Date(startValue) : null;
  const end = endValue ? new Date(endValue) : null;
  if (start) assert(!Number.isNaN(start.getTime()), "Invalid discount start time");
  if (end) assert(!Number.isNaN(end.getTime()), "Invalid discount end time");
  if (start && end) assert(end > start, "Discount end time must be after start time");
  return { start, end };
}

function arrayJson(value, max, label) {
  assert(Array.isArray(value) && value.length <= max, `Invalid ${label}`);
  return JSON.stringify(value);
}

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function productPrice(row, at = new Date()) {
  const baseIrr = integer(row.base_price_irr, "base price IRR");
  const startsAt = row.discount_starts_at ? new Date(row.discount_starts_at) : null;
  const endsAt = row.discount_ends_at ? new Date(row.discount_ends_at) : null;
  const active = (!startsAt || at >= startsAt) && (!endsAt || at < endsAt);
  if (!active || row.discount_type === "NONE") {
    return { baseIrr, finalIrr: baseIrr, discountIrr: 0 };
  }
  const value = integer(row.discount_value, "discount value");
  const discountIrr = row.discount_type === "PERCENTAGE"
    ? Math.floor((baseIrr * value) / 100)
    : Math.min(baseIrr, value);
  return { baseIrr, finalIrr: baseIrr - discountIrr, discountIrr };
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export class PostgresCatalogManagementService {
  constructor(pool) {
    this.pool = pool;
  }

  async actor(actorId, client = this.pool) {
    const result = await client.query(
      "SELECT id,role,status FROM users WHERE id=$1",
      [actorId],
    );
    const actor = result.rows[0];
    assert(actor && actor.status === "ACTIVE", "Actor not found", "FORBIDDEN");
    return actor;
  }

  async requireAdmin(actorId, client = this.pool) {
    const actor = await this.actor(actorId, client);
    assert(actor.role === "ADMIN", "Admin role required", "FORBIDDEN");
    return actor;
  }

  async approvedSellerForUser(userId, client = this.pool) {
    const result = await client.query(
      "SELECT * FROM sellers WHERE user_id=$1 AND status='APPROVED'",
      [userId],
    );
    assert(result.rows[0], "Approved seller required", "FORBIDDEN");
    return result.rows[0];
  }

  async requireManageable(actorId, productId, client = this.pool, { forUpdate = false } = {}) {
    const actor = await this.actor(actorId, client);
    const result = await client.query(
      `SELECT * FROM products WHERE id=$1${forUpdate ? " FOR UPDATE" : ""}`,
      [productId],
    );
    const product = result.rows[0];
    assert(product, "Product not found", "NOT_FOUND");
    if (actor.role === "ADMIN") return product;
    assert(actor.role === "SELLER", "Seller or admin role required", "FORBIDDEN");
    const seller = await client.query(
      `SELECT id FROM sellers
       WHERE id=$1 AND user_id=$2 AND status='APPROVED'`,
      [product.seller_id, actorId],
    );
    assert(seller.rowCount === 1, "Seller cannot manage this product", "FORBIDDEN");
    return product;
  }

  categoryShape(row) {
    return {
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      slug: row.slug,
      imageUrl: row.image_url,
      sortOrder: Number(row.sort_order || 0),
      description: row.description || "",
      ...(row.is_visible === undefined ? {} : { visible: Boolean(row.is_visible) }),
      ...(row.child_count === undefined ? {} : { childCount: Number(row.child_count || 0) }),
      ...(row.product_count === undefined ? {} : { productCount: Number(row.product_count || 0) }),
    };
  }

  async listCategoriesManaged(adminId) {
    await this.requireAdmin(adminId);
    const result = await this.pool.query(
      `SELECT c.*,
        (SELECT COUNT(*)::int FROM categories child WHERE child.parent_id=c.id) AS child_count,
        (SELECT COUNT(*)::int FROM products p WHERE p.category_id=c.id AND p.status<>'ARCHIVED') AS product_count
       FROM categories c
       ORDER BY c.sort_order ASC,c.name ASC`,
    );
    return result.rows.map((row) => this.categoryShape(row));
  }

  async createCategory(adminId, input) {
    await this.requireAdmin(adminId);
    const name = String(input.name || "").trim();
    assert(name && name.length <= 120, "Category name is required and must be at most 120 characters");
    const slug = normalizeSlug(input.slug, "Category slug");
    const parentId = input.parentId || null;
    if (parentId) await this.requireCategory(parentId);
    const imageUrl = validateUrl(input.imageUrl, "Category image");
    const sortOrder = integer(input.sortOrder ?? 0, "sort order", { max: 1_000_000 });
    try {
      const inserted = await this.pool.query(
        `INSERT INTO categories
         (id,parent_id,name,slug,image_url,description,sort_order,is_visible)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          randomUUID(),
          parentId,
          name,
          slug,
          imageUrl,
          String(input.description || "").slice(0, 2000),
          sortOrder,
          input.visible !== false,
        ],
      );
      return this.getCategoryManaged(adminId, inserted.rows[0].id);
    } catch (error) {
      if (error?.code === "23505") fail("Category slug already exists", "CONFLICT");
      throw error;
    }
  }

  async requireCategory(categoryId, client = this.pool) {
    const result = await client.query("SELECT * FROM categories WHERE id=$1", [categoryId]);
    assert(result.rows[0], "Category not found", "NOT_FOUND");
    return result.rows[0];
  }

  async getCategoryManaged(adminId, categoryId) {
    await this.requireAdmin(adminId);
    const result = await this.pool.query(
      `SELECT c.*,
        (SELECT COUNT(*)::int FROM categories child WHERE child.parent_id=c.id) AS child_count,
        (SELECT COUNT(*)::int FROM products p WHERE p.category_id=c.id AND p.status<>'ARCHIVED') AS product_count
       FROM categories c WHERE c.id=$1`,
      [categoryId],
    );
    assert(result.rows[0], "Category not found", "NOT_FOUND");
    return this.categoryShape(result.rows[0]);
  }

  async assertNoCategoryCycle(categoryId, candidateParentId) {
    const result = await this.pool.query(
      `WITH RECURSIVE ancestors AS (
         SELECT id,parent_id FROM categories WHERE id=$1
         UNION ALL
         SELECT c.id,c.parent_id
         FROM categories c
         JOIN ancestors a ON c.id=a.parent_id
       )
       SELECT 1 FROM ancestors WHERE id=$2 LIMIT 1`,
      [candidateParentId, categoryId],
    );
    assert(result.rowCount === 0, "Category hierarchy cycle is not allowed", "CONFLICT");
  }

  async updateCategory(adminId, categoryId, input) {
    await this.requireAdmin(adminId);
    const current = await this.requireCategory(categoryId);
    const name = input.name === undefined ? current.name : String(input.name).trim();
    assert(name && name.length <= 120, "Invalid category name");
    const slug = input.slug === undefined ? current.slug : normalizeSlug(input.slug, "Category slug");
    const parentId = input.parentId === undefined ? current.parent_id : input.parentId || null;
    if (parentId) {
      assert(parentId !== categoryId, "Category cannot be its own parent", "CONFLICT");
      await this.requireCategory(parentId);
      await this.assertNoCategoryCycle(categoryId, parentId);
    }
    const imageUrl = input.imageUrl === undefined
      ? current.image_url
      : validateUrl(input.imageUrl, "Category image");
    const description = input.description === undefined
      ? current.description
      : String(input.description || "").slice(0, 2000);
    const sortOrder = input.sortOrder === undefined
      ? Number(current.sort_order)
      : integer(input.sortOrder, "sort order", { max: 1_000_000 });
    const visible = input.visible === undefined ? current.is_visible : Boolean(input.visible);
    try {
      await this.pool.query(
        `UPDATE categories
         SET parent_id=$1,name=$2,slug=$3,image_url=$4,description=$5,
             sort_order=$6,is_visible=$7,updated_at=CURRENT_TIMESTAMP
         WHERE id=$8`,
        [parentId, name, slug, imageUrl, description, sortOrder, visible, categoryId],
      );
    } catch (error) {
      if (error?.code === "23505") fail("Category slug already exists", "CONFLICT");
      throw error;
    }
    return this.getCategoryManaged(adminId, categoryId);
  }

  async removeCategory(adminId, categoryId) {
    await this.requireAdmin(adminId);
    return withPostgresTransaction(this.pool, async (client) => {
      const category = await client.query(
        "SELECT id FROM categories WHERE id=$1 FOR UPDATE",
        [categoryId],
      );
      assert(category.rowCount === 1, "Category not found", "NOT_FOUND");
      const children = await client.query(
        "SELECT 1 FROM categories WHERE parent_id=$1 LIMIT 1",
        [categoryId],
      );
      assert(children.rowCount === 0, "Category has child categories", "CONFLICT");
      const products = await client.query(
        "SELECT 1 FROM products WHERE category_id=$1 LIMIT 1",
        [categoryId],
      );
      assert(products.rowCount === 0, "Category is used by products", "CONFLICT");
      await client.query("DELETE FROM categories WHERE id=$1", [categoryId]);
      return { deleted: true, id: categoryId };
    });
  }

  async createProduct(actorId, input) {
    return withPostgresTransaction(this.pool, async (client) => {
      const actor = await this.actor(actorId, client);
      assert(["ADMIN", "SELLER"].includes(actor.role), "Seller or admin role required", "FORBIDDEN");
      let sellerId = input.sellerId || null;
      if (actor.role === "SELLER") {
        sellerId = (await this.approvedSellerForUser(actorId, client)).id;
      } else if (sellerId) {
        const seller = await client.query(
          "SELECT id FROM sellers WHERE id=$1 AND status='APPROVED'",
          [sellerId],
        );
        assert(seller.rowCount === 1, "Approved seller required", "FORBIDDEN");
      }

      const title = String(input.title || "").trim();
      assert(title && title.length <= 180, "Title is required");
      const slug = normalizeSlug(input.slug, "Product slug");
      const brand = String(input.brand || "").trim();
      assert(brand.length <= 120, "Brand is too long");
      const categoryId = input.categoryId || null;
      if (categoryId) await this.requireCategory(categoryId, client);
      const discountType = input.discountType || "NONE";
      const { base, discount } = validateDiscount(
        Number(input.basePriceIrr),
        discountType,
        Number(input.discountValue || 0),
      );
      const { start, end } = validateSchedule(input.discountStartsAt, input.discountEndsAt);
      const stockOnHand = integer(input.stockOnHand ?? 0, "stock", { max: 2_000_000_000 });
      const status = input.status || "DRAFT";
      assert(["DRAFT", "PUBLISHED"].includes(status), "New product status must be DRAFT or PUBLISHED");
      const highlightsJson = arrayJson(input.highlights ?? [], 20, "highlights");
      const specificationsJson = arrayJson(input.specifications ?? [], 50, "specifications");
      const id = randomUUID();
      try {
        await client.query(
          `INSERT INTO products
           (id,seller_id,category_id,title,slug,description,brand,highlights_json,specifications_json,
            base_price_irr,discount_type,discount_value,discount_starts_at,discount_ends_at,is_amazing,status)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            id,
            sellerId,
            categoryId,
            title,
            slug,
            String(input.description || "").slice(0, 10_000),
            brand,
            highlightsJson,
            specificationsJson,
            base,
            discountType,
            discount,
            start,
            end,
            Boolean(input.isAmazing),
            status,
          ],
        );
      } catch (error) {
        if (error?.code === "23505") fail("Product slug already exists", "CONFLICT");
        throw error;
      }
      await client.query(
        "INSERT INTO inventory(product_id,stock_on_hand,stock_reserved) VALUES($1,$2,0)",
        [id, stockOnHand],
      );
      await this.audit(client, actorId, "PRODUCT_CREATED", id, { status, sellerId });
      return this.getManaged(actorId, id, client);
    });
  }

  async listManaged(actorId) {
    const actor = await this.actor(actorId);
    let result;
    if (actor.role === "ADMIN") {
      result = await this.pool.query(
        `SELECT p.*,i.stock_on_hand,i.stock_reserved,c.name AS category_name,c.slug AS category_slug
         FROM products p
         JOIN inventory i ON i.product_id=p.id
         LEFT JOIN categories c ON c.id=p.category_id
         ORDER BY p.updated_at DESC`,
      );
    } else {
      assert(actor.role === "SELLER", "Seller or admin role required", "FORBIDDEN");
      result = await this.pool.query(
        `SELECT p.*,i.stock_on_hand,i.stock_reserved,c.name AS category_name,c.slug AS category_slug
         FROM products p
         JOIN inventory i ON i.product_id=p.id
         JOIN sellers s ON s.id=p.seller_id
         LEFT JOIN categories c ON c.id=p.category_id
         WHERE s.user_id=$1 AND s.status='APPROVED'
         ORDER BY p.updated_at DESC`,
        [actorId],
      );
    }
    return Promise.all(result.rows.map((row) => this.toManagedProduct(row)));
  }

  async media(productId, client = this.pool) {
    const result = await client.query(
      `SELECT id,media_type,url,sort_order,is_primary,storage_key,mime_type,size_bytes,sha256,created_at
       FROM product_media
       WHERE product_id=$1
       ORDER BY is_primary DESC,sort_order ASC,created_at ASC`,
      [productId],
    );
    return result.rows.map((row) => ({
      ...row,
      sort_order: Number(row.sort_order || 0),
      is_primary: Boolean(row.is_primary),
      size_bytes: row.size_bytes === null ? null : Number(row.size_bytes),
      created_at: iso(row.created_at),
    }));
  }

  async toManagedProduct(row, client = this.pool) {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      pricing: productPrice(row),
      currency: "IRR",
      inStock: Number(row.stock_on_hand) - Number(row.stock_reserved) > 0,
      availableQuantity: Math.max(0, Number(row.stock_on_hand) - Number(row.stock_reserved)),
      isAmazing: Boolean(row.is_amazing),
      media: await this.media(row.id, client),
      status: row.status,
      sellerId: row.seller_id,
      categoryId: row.category_id,
      categoryName: row.category_name || null,
      categorySlug: row.category_slug || null,
      brand: row.brand || "",
      highlights: parseArray(row.highlights_json),
      specifications: parseArray(row.specifications_json),
      stockOnHand: Number(row.stock_on_hand),
      stockReserved: Number(row.stock_reserved),
      discountType: row.discount_type,
      discountValue: Number(row.discount_value),
      discountStartsAt: iso(row.discount_starts_at),
      discountEndsAt: iso(row.discount_ends_at),
    };
  }

  async getManaged(actorId, productId, client = this.pool) {
    await this.requireManageable(actorId, productId, client);
    const result = await client.query(
      `SELECT p.*,i.stock_on_hand,i.stock_reserved,c.name AS category_name,c.slug AS category_slug
       FROM products p
       JOIN inventory i ON i.product_id=p.id
       LEFT JOIN categories c ON c.id=p.category_id
       WHERE p.id=$1`,
      [productId],
    );
    assert(result.rows[0], "Product not found", "NOT_FOUND");
    return this.toManagedProduct(result.rows[0], client);
  }

  async updateProduct(actorId, productId, input) {
    return withPostgresTransaction(this.pool, async (client) => {
      const current = await this.requireManageable(actorId, productId, client, { forUpdate: true });
      const title = input.title === undefined ? current.title : String(input.title).trim();
      assert(title && title.length <= 180, "Title is required");
      const description = input.description === undefined
        ? current.description
        : String(input.description || "").slice(0, 10_000);
      const brand = input.brand === undefined ? current.brand : String(input.brand || "").trim();
      assert(brand.length <= 120, "Brand is too long");
      const categoryId = input.categoryId === undefined ? current.category_id : input.categoryId || null;
      if (categoryId) await this.requireCategory(categoryId, client);
      const basePriceIrr = input.basePriceIrr === undefined
        ? Number(current.base_price_irr)
        : Number(input.basePriceIrr);
      const discountType = input.discountType ?? current.discount_type;
      const discountValue = input.discountValue === undefined
        ? Number(current.discount_value)
        : Number(input.discountValue);
      const { base, discount } = validateDiscount(basePriceIrr, discountType, discountValue);
      const startsAt = input.discountStartsAt === undefined
        ? current.discount_starts_at
        : input.discountStartsAt || null;
      const endsAt = input.discountEndsAt === undefined
        ? current.discount_ends_at
        : input.discountEndsAt || null;
      const schedule = validateSchedule(startsAt, endsAt);
      const highlightsJson = input.highlights === undefined
        ? current.highlights_json
        : arrayJson(input.highlights, 20, "highlights");
      const specificationsJson = input.specifications === undefined
        ? current.specifications_json
        : arrayJson(input.specifications, 50, "specifications");
      await client.query(
        `UPDATE products
         SET title=$1,description=$2,brand=$3,category_id=$4,base_price_irr=$5,
             discount_type=$6,discount_value=$7,discount_starts_at=$8,discount_ends_at=$9,
             is_amazing=$10,highlights_json=$11,specifications_json=$12,updated_at=CURRENT_TIMESTAMP
         WHERE id=$13`,
        [
          title,
          description,
          brand,
          categoryId,
          base,
          discountType,
          discount,
          schedule.start,
          schedule.end,
          input.isAmazing === undefined ? current.is_amazing : Boolean(input.isAmazing),
          highlightsJson,
          specificationsJson,
          productId,
        ],
      );
      await this.audit(client, actorId, "PRODUCT_UPDATED", productId, {});
      return this.getManaged(actorId, productId, client);
    });
  }

  async setPublished(actorId, productId, published) {
    return withPostgresTransaction(this.pool, async (client) => {
      const product = await this.requireManageable(actorId, productId, client, { forUpdate: true });
      const inventory = await client.query(
        "SELECT stock_on_hand FROM inventory WHERE product_id=$1 FOR UPDATE",
        [productId],
      );
      assert(inventory.rows[0], "Inventory not found", "CONFLICT");
      if (published) assert(product.title && product.slug, "Product title and slug are required", "CONFLICT");
      const next = published ? "PUBLISHED" : "DRAFT";
      await client.query(
        "UPDATE products SET status=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2",
        [next, productId],
      );
      await this.audit(client, actorId, published ? "PRODUCT_PUBLISHED" : "PRODUCT_UNPUBLISHED", productId, {});
      return this.getManaged(actorId, productId, client);
    });
  }

  async setArchived(actorId, productId, archived = true) {
    return withPostgresTransaction(this.pool, async (client) => {
      const product = await this.requireManageable(actorId, productId, client, { forUpdate: true });
      const nextStatus = archived ? "ARCHIVED" : "DRAFT";
      await client.query(
        "UPDATE products SET status=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2",
        [nextStatus, productId],
      );
      await this.audit(client, actorId, archived ? "PRODUCT_ARCHIVED" : "PRODUCT_RESTORED", productId, {
        previousStatus: product.status,
        nextStatus,
      });
      return { id: productId, status: nextStatus };
    });
  }

  async setInventory(actorId, productId, stockOnHand) {
    const stock = integer(stockOnHand, "stock", { max: 2_000_000_000 });
    return withPostgresTransaction(this.pool, async (client) => {
      await this.requireManageable(actorId, productId, client);
      const inventory = await client.query(
        "SELECT * FROM inventory WHERE product_id=$1 FOR UPDATE",
        [productId],
      );
      const current = inventory.rows[0];
      assert(current, "Inventory not found", "NOT_FOUND");
      assert(stock >= Number(current.stock_reserved), "Stock cannot be lower than reserved quantity", "CONFLICT");
      await client.query(
        `UPDATE inventory
         SET stock_on_hand=$1,version=version+1,updated_at=CURRENT_TIMESTAMP
         WHERE product_id=$2`,
        [stock, productId],
      );
      await this.audit(client, actorId, "INVENTORY_UPDATED", productId, { stockOnHand: stock });
      return this.getManaged(actorId, productId, client);
    });
  }

  async addMedia(actorId, productId, input) {
    return withPostgresTransaction(this.pool, async (client) => {
      await this.requireManageable(actorId, productId, client);
      assert(["IMAGE", "VIDEO"].includes(input.mediaType), "Invalid media type");
      const url = validateUrl(input.url, "Media");
      assert(url, "Media URL is required");
      const sortOrder = integer(input.sortOrder ?? 0, "media sort order", { max: 1_000_000 });
      if (input.isPrimary && input.mediaType === "IMAGE") {
        await client.query(
          "UPDATE product_media SET is_primary=FALSE WHERE product_id=$1 AND media_type='IMAGE'",
          [productId],
        );
      }
      const inserted = await client.query(
        `INSERT INTO product_media(id,product_id,media_type,url,sort_order,is_primary)
         VALUES($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [randomUUID(), productId, input.mediaType, url, sortOrder, Boolean(input.isPrimary)],
      );
      await this.audit(client, actorId, "PRODUCT_MEDIA_ADDED", productId, {
        mediaId: inserted.rows[0].id,
      });
      return inserted.rows[0];
    });
  }

  async removeMedia(actorId, productId, mediaId) {
    return withPostgresTransaction(this.pool, async (client) => {
      await this.requireManageable(actorId, productId, client);
      const media = await client.query(
        "SELECT * FROM product_media WHERE id=$1 AND product_id=$2 FOR UPDATE",
        [mediaId, productId],
      );
      const current = media.rows[0];
      assert(current, "Product media not found", "NOT_FOUND");
      await client.query("DELETE FROM product_media WHERE id=$1", [mediaId]);
      if (current.media_type === "IMAGE" && current.is_primary) {
        const replacement = await client.query(
          `SELECT id FROM product_media
           WHERE product_id=$1 AND media_type='IMAGE'
           ORDER BY sort_order ASC,created_at ASC
           LIMIT 1
           FOR UPDATE`,
          [productId],
        );
        if (replacement.rows[0]) {
          await client.query(
            "UPDATE product_media SET is_primary=TRUE WHERE id=$1",
            [replacement.rows[0].id],
          );
        }
      }
      await this.audit(client, actorId, "PRODUCT_MEDIA_REMOVED", productId, { mediaId });
      return { deleted: true, id: mediaId, productId };
    });
  }

  async audit(client, actorId, action, productId, details) {
    await client.query(
      `INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,details_json)
       VALUES($1,$2,$3,'PRODUCT',$4,$5)`,
      [randomUUID(), actorId, action, productId, JSON.stringify(details || {})],
    );
  }
}
