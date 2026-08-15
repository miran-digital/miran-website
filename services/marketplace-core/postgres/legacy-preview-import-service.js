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

function bounded(value, maxLength, fallback = "") {
  return String(value ?? fallback).trim().slice(0, maxLength);
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
    const values = ["digitalPicks", "homePicks", "trending"]
      .filter((key) => typeof source[key] === "boolean")
      .map((key) => source[key]);
    if (values.length) mapped.products = values.some(Boolean);
  }
  return mapped;
}

export class PostgresLegacyPreviewImportService {
  constructor(pool, catalogService) {
    this.pool = pool;
    this.catalog = catalogService;
  }

  async requireAdmin(actorId) {
    await this.catalog.requireAdmin(actorId);
  }

  async importContent(actorId, input = {}) {
    await this.requireAdmin(actorId);
    const headerMessages = Array.isArray(input.headerMessages)
      ? input.headerMessages.slice(0, 10)
      : [];
    const banners = Array.isArray(input.banners) ? input.banners.slice(0, 20) : [];
    const sections = mapSections(input.sections);

    return withPostgresTransaction(this.pool, async (client) => {
      for (const [sectionKey, visible] of Object.entries(sections)) {
        await client.query(
          `UPDATE home_sections
           SET visible=$1,updated_at=CURRENT_TIMESTAMP
           WHERE section_key=$2`,
          [Boolean(visible), sectionKey],
        );
      }

      let importedHeaders = 0;
      for (const item of headerMessages) {
        const text = bounded(item.text, 160);
        if (!text) continue;
        const key = legacyKey("header", item.id);
        await client.query(
          `INSERT INTO header_messages
           (id,text,href,starts_at,ends_at,visible,sort_order,legacy_key)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (legacy_key) DO UPDATE SET
             text=EXCLUDED.text,
             href=EXCLUDED.href,
             starts_at=EXCLUDED.starts_at,
             ends_at=EXCLUDED.ends_at,
             visible=EXCLUDED.visible,
             updated_at=CURRENT_TIMESTAMP`,
          [
            randomUUID(),
            text,
            normalizeHref(item.href),
            item.startsAt || null,
            item.endsAt || null,
            item.visible !== false,
            importedHeaders,
            key,
          ],
        );
        importedHeaders += 1;
      }

      let importedBanners = 0;
      for (const item of banners) {
        const title = bounded(item.title, 160);
        if (!title) continue;
        const key = legacyKey("banner", item.id);
        await client.query(
          `INSERT INTO storefront_banners
           (id,title,href,image_url,placement,visible,sort_order,legacy_key)
           VALUES($1,$2,$3,NULL,'SMALL',$4,$5,$6)
           ON CONFLICT (legacy_key) DO UPDATE SET
             title=EXCLUDED.title,
             href=EXCLUDED.href,
             visible=EXCLUDED.visible,
             updated_at=CURRENT_TIMESTAMP`,
          [
            randomUUID(),
            title,
            normalizeHref(item.href),
            item.visible !== false,
            importedBanners,
            key,
          ],
        );
        importedBanners += 1;
      }

      await client.query(
        `INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,details_json)
         VALUES($1,$2,'LEGACY_PREVIEW_CONTENT_IMPORTED','STOREFRONT',NULL,$3)`,
        [
          randomUUID(),
          actorId,
          JSON.stringify({
            importedHeaders,
            importedBanners,
            sections: Object.keys(sections),
          }),
        ],
      );
      return {
        importedHeaders,
        importedBanners,
        updatedSections: Object.keys(sections).length,
      };
    });
  }

  async importProductDraft(actorId, input = {}) {
    await this.requireAdmin(actorId);
    const key = legacyKey("product", input.legacyId);
    const existing = await this.pool.query(
      "SELECT * FROM products WHERE legacy_key=$1",
      [key],
    );
    if (existing.rows[0]) {
      return { product: existing.rows[0], alreadyImported: true };
    }

    const basePriceIrr = Number(input.basePriceIrr);
    assert(
      Number.isSafeInteger(basePriceIrr) && basePriceIrr >= 0,
      "A reviewed integer IRR price is required for preview product import",
    );
    const categorySlug = bounded(input.categorySlug, 180);
    let categoryId = null;
    if (categorySlug) {
      const category = await this.pool.query(
        "SELECT id FROM categories WHERE slug=$1",
        [categorySlug],
      );
      categoryId = category.rows[0]?.id ?? null;
    }

    const product = await this.catalog.createProduct(actorId, {
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
    await this.pool.query(
      "UPDATE products SET legacy_key=$1 WHERE id=$2",
      [key, product.id],
    );
    await this.pool.query(
      `INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,details_json)
       VALUES($1,$2,'LEGACY_PREVIEW_PRODUCT_IMPORTED_AS_DRAFT','PRODUCT',$3,$4)`,
      [
        randomUUID(),
        actorId,
        product.id,
        JSON.stringify({
          legacyId: input.legacyId,
          categorySlug,
          categoryMatched: Boolean(categoryId),
        }),
      ],
    );
    const stored = await this.pool.query("SELECT * FROM products WHERE id=$1", [product.id]);
    return {
      product: stored.rows[0],
      alreadyImported: false,
      categoryMatched: !categorySlug || Boolean(categoryId),
    };
  }
}
