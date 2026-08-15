import { randomUUID } from "node:crypto";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireAdmin(db, actorId) {
  const actor = db.prepare("SELECT id,role,status FROM users WHERE id=?").get(actorId);
  if (!actor || actor.status !== "ACTIVE" || actor.role !== "ADMIN") {
    fail("Admin role required", "FORBIDDEN");
  }
  return actor;
}

function normalizeSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail("Category slug must contain lowercase latin letters, digits and dashes only");
  }
  return slug;
}

export class CategoryService {
  constructor(db) {
    this.db = db;
  }

  listPublic() {
    return this.db
      .prepare(
        `SELECT id,parent_id,name,slug,image_url,sort_order
         FROM categories
         WHERE is_visible=1
         ORDER BY sort_order ASC,name ASC`,
      )
      .all()
      .map((row) => this.toCategory(row));
  }

  listManaged(actorId) {
    requireAdmin(this.db, actorId);
    return this.db
      .prepare(
        `SELECT c.*,
          (SELECT COUNT(*) FROM categories child WHERE child.parent_id=c.id) AS child_count,
          (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.status<>'ARCHIVED') AS product_count
         FROM categories c
         ORDER BY c.sort_order ASC,c.name ASC`,
      )
      .all()
      .map((row) => ({
        ...this.toCategory(row),
        visible: Boolean(row.is_visible),
        childCount: Number(row.child_count || 0),
        productCount: Number(row.product_count || 0),
      }));
  }

  create(actorId, input) {
    requireAdmin(this.db, actorId);
    const name = String(input.name || "").trim();
    if (!name || name.length > 120) fail("Category name is required and must be at most 120 characters");
    const slug = normalizeSlug(input.slug);
    const parentId = input.parentId || null;
    if (parentId) this.requireCategory(parentId);
    const imageUrl = this.validateImageUrl(input.imageUrl);
    const sortOrder = this.validateSortOrder(input.sortOrder);
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO categories (id,parent_id,name,slug,image_url,sort_order,is_visible)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(id, parentId, name, slug, imageUrl, sortOrder, input.visible === false ? 0 : 1);
    return this.getManaged(actorId, id);
  }

  update(actorId, categoryId, input) {
    requireAdmin(this.db, actorId);
    const current = this.requireCategory(categoryId);
    const name = input.name === undefined ? current.name : String(input.name).trim();
    if (!name || name.length > 120) fail("Invalid category name");
    const slug = input.slug === undefined ? current.slug : normalizeSlug(input.slug);
    const parentId = input.parentId === undefined ? current.parent_id : input.parentId || null;
    if (parentId) {
      if (parentId === categoryId) fail("Category cannot be its own parent", "CONFLICT");
      this.requireCategory(parentId);
      this.assertNoCycle(categoryId, parentId);
    }
    const imageUrl = input.imageUrl === undefined ? current.image_url : this.validateImageUrl(input.imageUrl);
    const sortOrder = input.sortOrder === undefined ? current.sort_order : this.validateSortOrder(input.sortOrder);
    const visible = input.visible === undefined ? current.is_visible : input.visible ? 1 : 0;
    this.db
      .prepare(
        `UPDATE categories
         SET parent_id=?,name=?,slug=?,image_url=?,sort_order=?,is_visible=?,updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
      )
      .run(parentId, name, slug, imageUrl, sortOrder, visible, categoryId);
    return this.getManaged(actorId, categoryId);
  }

  remove(actorId, categoryId) {
    requireAdmin(this.db, actorId);
    this.requireCategory(categoryId);
    const children = this.db.prepare("SELECT COUNT(*) AS n FROM categories WHERE parent_id=?").get(categoryId).n;
    if (children > 0) fail("Category has child categories", "CONFLICT");
    const products = this.db.prepare("SELECT COUNT(*) AS n FROM products WHERE category_id=?").get(categoryId).n;
    if (products > 0) fail("Category is used by products", "CONFLICT");
    this.db.prepare("DELETE FROM categories WHERE id=?").run(categoryId);
    return { deleted: true, id: categoryId };
  }

  getManaged(actorId, categoryId) {
    requireAdmin(this.db, actorId);
    const row = this.db
      .prepare(
        `SELECT c.*,
          (SELECT COUNT(*) FROM categories child WHERE child.parent_id=c.id) AS child_count,
          (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.status<>'ARCHIVED') AS product_count
         FROM categories c WHERE c.id=?`,
      )
      .get(categoryId);
    if (!row) fail("Category not found", "NOT_FOUND");
    return {
      ...this.toCategory(row),
      visible: Boolean(row.is_visible),
      childCount: Number(row.child_count || 0),
      productCount: Number(row.product_count || 0),
    };
  }

  requireCategory(id) {
    const row = this.db.prepare("SELECT * FROM categories WHERE id=?").get(id);
    if (!row) fail("Category not found", "NOT_FOUND");
    return row;
  }

  assertNoCycle(categoryId, candidateParentId) {
    let currentId = candidateParentId;
    const visited = new Set();
    while (currentId) {
      if (currentId === categoryId) fail("Category hierarchy cycle is not allowed", "CONFLICT");
      if (visited.has(currentId)) fail("Invalid category hierarchy", "CONFLICT");
      visited.add(currentId);
      const row = this.db.prepare("SELECT parent_id FROM categories WHERE id=?").get(currentId);
      currentId = row?.parent_id || null;
    }
  }

  validateSortOrder(value) {
    const sortOrder = value === undefined || value === null || value === "" ? 0 : Number(value);
    if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) {
      fail("Invalid sort order");
    }
    return sortOrder;
  }

  validateImageUrl(value) {
    const url = String(value || "").trim();
    if (!url) return null;
    if (url.length > 1000) fail("Category image URL is too long");
    if (!url.startsWith("/") && !/^https:\/\//i.test(url)) fail("Category image URL must be internal or HTTPS");
    return url;
  }

  toCategory(row) {
    return {
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      slug: row.slug,
      imageUrl: row.image_url,
      sortOrder: Number(row.sort_order || 0),
    };
  }
}
