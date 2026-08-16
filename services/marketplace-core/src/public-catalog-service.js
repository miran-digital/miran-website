import { priceProduct } from "./core.js";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export class PublicCatalogService {
  constructor(db) {
    this.db = db;
  }

  listCategories() {
    return this.db.prepare(
      `SELECT id,parent_id,name,slug,image_url,sort_order,description
       FROM categories
       WHERE is_visible=1
       ORDER BY sort_order ASC,name ASC`,
    ).all().map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      slug: row.slug,
      imageUrl: row.image_url,
      sortOrder: Number(row.sort_order || 0),
      description: row.description || "",
    }));
  }

  listProducts({ limit = 24, offset = 0, categorySlug = null, amazingOnly = false, query = "" } = {}) {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 24));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const filters = ["p.status='PUBLISHED'"];
    const args = [];
    if (categorySlug) {
      filters.push("c.slug=?");
      args.push(String(categorySlug));
    }
    if (amazingOnly) filters.push("p.is_amazing=1");
    const normalizedQuery = String(query || "").trim();
    if (normalizedQuery) {
      filters.push("(p.title LIKE ? OR p.brand LIKE ? OR p.description LIKE ?)");
      const term = `%${normalizedQuery}%`;
      args.push(term, term, term);
    }
    args.push(safeLimit, safeOffset);
    return this.db.prepare(
      `SELECT p.*,i.stock_on_hand,i.stock_reserved,
              c.slug AS category_slug,c.name AS category_name,c.description AS category_description
       FROM products p
       JOIN inventory i ON i.product_id=p.id
       LEFT JOIN categories c ON c.id=p.category_id
       WHERE ${filters.join(" AND ")}
       ORDER BY p.is_amazing DESC,p.updated_at DESC,p.created_at DESC
       LIMIT ? OFFSET ?`,
    ).all(...args).map((row) => this.toProduct(row));
  }

  getProduct(idOrSlug) {
    const row = this.db.prepare(
      `SELECT p.*,i.stock_on_hand,i.stock_reserved,
              c.slug AS category_slug,c.name AS category_name,c.description AS category_description
       FROM products p
       JOIN inventory i ON i.product_id=p.id
       LEFT JOIN categories c ON c.id=p.category_id
       WHERE p.status='PUBLISHED' AND (p.id=? OR p.slug=?)`,
    ).get(idOrSlug, idOrSlug);
    if (!row) fail("Product not found", "NOT_FOUND");
    return this.toProduct(row);
  }

  toProduct(row) {
    const pricing = priceProduct(row);
    const media = this.db.prepare(
      `SELECT id,media_type,url,sort_order,is_primary
       FROM product_media
       WHERE product_id=?
       ORDER BY is_primary DESC,sort_order ASC,created_at ASC`,
    ).all(row.id).map((item) => ({
      id: item.id,
      type: item.media_type,
      url: item.url,
      sortOrder: Number(item.sort_order || 0),
      isPrimary: Boolean(item.is_primary),
    }));
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      brand: row.brand || "Miran",
      category: row.category_id ? {
        id: row.category_id,
        slug: row.category_slug,
        name: row.category_name,
        description: row.category_description || "",
      } : null,
      pricing,
      currency: "IRR",
      inStock: Number(row.stock_on_hand) - Number(row.stock_reserved) > 0,
      availableQuantity: Math.max(0, Number(row.stock_on_hand) - Number(row.stock_reserved)),
      isAmazing: Boolean(row.is_amazing),
      highlights: parseArray(row.highlights_json),
      specifications: parseArray(row.specifications_json),
      media,
      publishedAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
