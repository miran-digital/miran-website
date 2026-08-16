import { randomUUID } from "node:crypto";
import { transaction } from "./database.js";

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
}

function bounded(value, maxLength, fallback = "") {
  const text = String(value ?? fallback).trim();
  return text.slice(0, maxLength);
}

function normalizeHref(value) {
  const href = bounded(value, 300, "/");
  return href.startsWith("/") && !href.startsWith("//") ? href : "/";
}

function legacyKey(kind, id) {
  const value = bounded(id, 120);
  if (!value) fail("Legacy item id is required");
  return `preview:${kind}:${value}`;
}

const allowedSectionKeys = new Set([
  "hero",
  "banners",
  "categories",
  "specialOffers",
  "products",
  "brands",
  "trust",
]);

function mapSections(input) {
  const source = input && typeof input === "object" ? input : {};
  const mapped = {};
  for (const key of allowedSectionKeys) {
    if (typeof source[key] === "boolean") mapped[key] = source[key];
  }
  if (typeof mapped.products !== "boolean") {
    const legacyProductKeys = ["digitalPicks", "homePicks", "trending"];
    const values = legacyProductKeys
      .filter((key) => typeof source[key] === "boolean")
      .map((key) => source[key]);
    if (values.length > 0) mapped.products = values.some(Boolean);
  }
  return mapped;
}

export class LegacyPreviewImportService {
  constructor(db, productCreator) {
    this.db = db;
    this.productCreator = productCreator;
  }

  importContent(actorId, input = {}) {
    requireAdmin(this.db, actorId);
    const headerMessages = Array.isArray(input.headerMessages)
      ? input.headerMessages.slice(0, 10)
      : [];
    const banners = Array.isArray(input.banners) ? input.banners.slice(0, 20) : [];
    const sections = mapSections(input.sections);

    return transaction(this.db, () => {
      for (const [sectionKey, visible] of Object.entries(sections)) {
        this.db.prepare(
          "UPDATE home_sections SET visible=?,updated_at=CURRENT_TIMESTAMP WHERE section_key=?",
        ).run(visible ? 1 : 0, sectionKey);
      }

      let importedHeaders = 0;
      for (const item of headerMessages) {
        const text = bounded(item.text, 160);
        if (!text) continue;
        const key = legacyKey("header", item.id);
        const existing = this.db
          .prepare("SELECT id FROM header_messages WHERE legacy_key=?")
          .get(key);
        if (existing) {
          this.db.prepare(
            `UPDATE header_messages
             SET text=?,href=?,starts_at=?,ends_at=?,visible=?,updated_at=CURRENT_TIMESTAMP
             WHERE id=?`,
          ).run(
            text,
            normalizeHref(item.href),
            item.startsAt || null,
            item.endsAt || null,
            item.visible === false ? 0 : 1,
            existing.id,
          );
        } else {
          this.db.prepare(
            `INSERT INTO header_messages
             (id,text,href,starts_at,ends_at,visible,sort_order,legacy_key)
             VALUES (?,?,?,?,?,?,?,?)`,
          ).run(
            randomUUID(),
            text,
            normalizeHref(item.href),
            item.startsAt || null,
            item.endsAt || null,
            item.visible === false ? 0 : 1,
            importedHeaders,
            key,
          );
        }
        importedHeaders += 1;
      }

      let importedBanners = 0;
      for (const item of banners) {
        const title = bounded(item.title, 160);
        if (!title) continue;
        const key = legacyKey("banner", item.id);
        const existing = this.db
          .prepare("SELECT id FROM storefront_banners WHERE legacy_key=?")
          .get(key);
        if (existing) {
          this.db.prepare(
            `UPDATE storefront_banners
             SET title=?,href=?,visible=?,updated_at=CURRENT_TIMESTAMP
             WHERE id=?`,
          ).run(
            title,
            normalizeHref(item.href),
            item.visible === false ? 0 : 1,
            existing.id,
          );
        } else {
          this.db.prepare(
            `INSERT INTO storefront_banners
             (id,title,href,image_url,placement,visible,sort_order,legacy_key)
             VALUES (?,?,?,?,?,?,?,?)`,
          ).run(
            randomUUID(),
            title,
            normalizeHref(item.href),
            null,
            "SMALL",
            item.visible === false ? 0 : 1,
            importedBanners,
            key,
          );
        }
        importedBanners += 1;
      }

      this.db.prepare(
        "INSERT INTO audit_log (id,actor_user_id,action,entity_type,entity_id,details_json) VALUES (?,?,?,?,?,?)",
      ).run(
        randomUUID(),
        actorId,
        "LEGACY_PREVIEW_CONTENT_IMPORTED",
        "STOREFRONT",
        null,
        JSON.stringify({ importedHeaders, importedBanners, sections: Object.keys(sections) }),
      );

      return {
        importedHeaders,
        importedBanners,
        updatedSections: Object.keys(sections).length,
      };
    });
  }

  importProductDraft(actorId, input = {}) {
    requireAdmin(this.db, actorId);
    const key = legacyKey("product", input.legacyId);
    const existing = this.db.prepare("SELECT * FROM products WHERE legacy_key=?").get(key);
    if (existing) return { product: existing, alreadyImported: true };

    const basePriceIrr = Number(input.basePriceIrr);
    if (!Number.isSafeInteger(basePriceIrr) || basePriceIrr < 0) {
      fail("A reviewed integer IRR price is required for preview product import");
    }

    const categorySlug = bounded(input.categorySlug, 180);
    let categoryId = null;
    if (categorySlug) {
      const category = this.db.prepare("SELECT id FROM categories WHERE slug=?").get(categorySlug);
      categoryId = category?.id ?? null;
    }

    const product = this.productCreator.create(actorId, {
      title: input.title,
      slug: input.slug,
      brand: input.brand,
      categoryId,
      basePriceIrr,
      stockOnHand: 0,
      status: "DRAFT",
      discountType: "NONE",
      discountValue: 0,
      description: "",
      highlights: [],
      specifications: [],
    });

    this.db.prepare("UPDATE products SET legacy_key=? WHERE id=?").run(key, product.id);
    this.db.prepare(
      "INSERT INTO audit_log (id,actor_user_id,action,entity_type,entity_id,details_json) VALUES (?,?,?,?,?,?)",
    ).run(
      randomUUID(),
      actorId,
      "LEGACY_PREVIEW_PRODUCT_IMPORTED_AS_DRAFT",
      "PRODUCT",
      product.id,
      JSON.stringify({ legacyId: input.legacyId, categorySlug, categoryMatched: Boolean(categoryId) }),
    );

    return {
      product: this.db.prepare("SELECT * FROM products WHERE id=?").get(product.id),
      alreadyImported: false,
      categoryMatched: !categorySlug || Boolean(categoryId),
    };
  }
}
