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
  ]);

  const productColumns = db.prepare("PRAGMA table_info(products)").all().map((row) => row.name);
  assert.ok(productColumns.includes("brand"));
  assert.ok(productColumns.includes("highlights_json"));
  assert.ok(productColumns.includes("specifications_json"));

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

  db.close();
});
