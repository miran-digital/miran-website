import assert from "node:assert/strict";
import test from "node:test";
import { PostgresCatalogManagementService } from "../postgres/catalog-management-service.js";
import { migratePostgres, openPostgresPool } from "../postgres/database.js";
import { PostgresLegacyPreviewImportService } from "../postgres/legacy-preview-import-service.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

async function fixture() {
  if (!databaseUrl) throw new Error("POSTGRES_TEST_DATABASE_URL is required");
  const pool = openPostgresPool({
    connectionString: databaseUrl,
    max: 4,
    applicationName: "miran-postgres-legacy-import-test",
  });
  await migratePostgres(pool);
  const suffix = Date.now().toString(36);
  const adminId = `admin-legacy-${suffix}`;
  await pool.query(
    "INSERT INTO users(id,email,password_salt,password_hash,role) VALUES($1,$2,'s','h','ADMIN')",
    [adminId, `${adminId}@example.com`],
  );
  const catalog = new PostgresCatalogManagementService(pool);
  const importer = new PostgresLegacyPreviewImportService(pool, catalog);
  return { pool, suffix, adminId, catalog, importer };
}

test(
  "PostgreSQL legacy content import is idempotent and does not duplicate CMS rows",
  { skip: !databaseUrl },
  async () => {
    const { pool, suffix, adminId, importer } = await fixture();
    try {
      const payload = {
        sections: { hero: true, specialOffers: false, digitalPicks: true },
        headerMessages: [
          {
            id: `header-${suffix}`,
            text: "Legacy header",
            href: "/offers",
            visible: true,
          },
        ],
        banners: [
          {
            id: `banner-${suffix}`,
            title: "Legacy banner",
            href: "/categories",
            visible: true,
          },
        ],
      };
      const first = await importer.importContent(adminId, payload);
      const second = await importer.importContent(adminId, payload);
      assert.equal(first.importedHeaders, 1);
      assert.equal(second.importedHeaders, 1);

      const headers = await pool.query(
        "SELECT COUNT(*)::int AS n FROM header_messages WHERE legacy_key=$1",
        [`preview:header:header-${suffix}`],
      );
      const banners = await pool.query(
        "SELECT COUNT(*)::int AS n FROM storefront_banners WHERE legacy_key=$1",
        [`preview:banner:banner-${suffix}`],
      );
      assert.equal(headers.rows[0].n, 1);
      assert.equal(banners.rows[0].n, 1);
      const offers = await pool.query(
        "SELECT visible FROM home_sections WHERE section_key='specialOffers'",
      );
      assert.equal(offers.rows[0].visible, false);
    } finally {
      await pool.end();
    }
  },
);

test(
  "PostgreSQL legacy product import requires reviewed IRR price, stays DRAFT and is idempotent",
  { skip: !databaseUrl },
  async () => {
    const { pool, suffix, adminId, catalog, importer } = await fixture();
    try {
      const category = await catalog.createCategory(adminId, {
        name: "Legacy Category",
        slug: `legacy-category-${suffix}`,
      });
      await assert.rejects(
        () => importer.importProductDraft(adminId, {
          legacyId: `legacy-product-${suffix}`,
          title: "Legacy Product",
          slug: `legacy-product-${suffix}`,
          categorySlug: category.slug,
          basePriceIrr: 12.5,
        }),
        /reviewed integer IRR price/i,
      );

      const first = await importer.importProductDraft(adminId, {
        legacyId: `legacy-product-${suffix}`,
        title: "Legacy Product",
        slug: `legacy-product-${suffix}`,
        brand: "Legacy",
        categorySlug: category.slug,
        basePriceIrr: 1_250_000,
      });
      assert.equal(first.alreadyImported, false);
      assert.equal(first.categoryMatched, true);
      assert.equal(first.product.status, "DRAFT");
      assert.equal(Number(first.product.base_price_irr), 1_250_000);

      const second = await importer.importProductDraft(adminId, {
        legacyId: `legacy-product-${suffix}`,
        title: "Changed title must not overwrite",
        slug: `legacy-product-${suffix}`,
        basePriceIrr: 99_999_999,
      });
      assert.equal(second.alreadyImported, true);
      assert.equal(second.product.id, first.product.id);
      assert.equal(Number(second.product.base_price_irr), 1_250_000);

      const count = await pool.query(
        "SELECT COUNT(*)::int AS n FROM products WHERE legacy_key=$1",
        [`preview:product:legacy-product-${suffix}`],
      );
      assert.equal(count.rows[0].n, 1);
    } finally {
      await pool.end();
    }
  },
);
