import assert from "node:assert/strict";
import test from "node:test";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";

test("migrations are ordered, recorded and idempotent", () => {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  migrateSqlite(db);

  const versions = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
  assert.deepEqual(versions.map((row) => row.version), [
    "001_init.sql",
    "002_catalog_enrichment.sql",
    "003_storefront_cms.sql",
    "004_payment_hardening.sql",
    "005_private_storage.sql",
    "006_legacy_preview_import.sql",
    "007_product_media_storage.sql",
    "008_banner_media_storage.sql",
  ]);

  const productColumns = db.prepare("PRAGMA table_info(products)").all().map((row) => row.name);
  assert.ok(productColumns.includes("brand"));
  assert.ok(productColumns.includes("highlights_json"));
  assert.ok(productColumns.includes("specifications_json"));
  assert.ok(productColumns.includes("legacy_key"));

  const categoryColumns = db.prepare("PRAGMA table_info(categories)").all().map((row) => row.name);
  assert.ok(categoryColumns.includes("description"));

  const homeSectionColumns = db.prepare("PRAGMA table_info(home_sections)").all().map((row) => row.name);
  assert.ok(homeSectionColumns.includes("section_key"));
  assert.ok(homeSectionColumns.includes("visible"));

  const paymentColumns = db.prepare("PRAGMA table_info(payments)").all().map((row) => row.name);
  assert.ok(paymentColumns.includes("authority"));
  assert.ok(paymentColumns.includes("reference_id"));

  const sellerDocumentIndexes = db.prepare("PRAGMA index_list(seller_documents)").all();
  assert.ok(
    sellerDocumentIndexes.some(
      (index) => index.name === "seller_documents_storage_key_uq" && Number(index.unique) === 1,
    ),
  );

  const headerColumns = db.prepare("PRAGMA table_info(header_messages)").all().map((row) => row.name);
  const bannerColumns = db.prepare("PRAGMA table_info(storefront_banners)").all().map((row) => row.name);
  assert.ok(headerColumns.includes("legacy_key"));
  assert.ok(bannerColumns.includes("legacy_key"));
  assert.ok(bannerColumns.includes("storage_key"));
  assert.ok(bannerColumns.includes("mime_type"));
  assert.ok(bannerColumns.includes("size_bytes"));
  assert.ok(bannerColumns.includes("sha256"));

  const mediaColumns = db.prepare("PRAGMA table_info(product_media)").all().map((row) => row.name);
  assert.ok(mediaColumns.includes("storage_key"));
  assert.ok(mediaColumns.includes("mime_type"));
  assert.ok(mediaColumns.includes("size_bytes"));
  assert.ok(mediaColumns.includes("sha256"));

  db.close();
});
