import assert from "node:assert/strict";
import test from "node:test";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";

test("migrations are ordered, recorded and idempotent", () => {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  migrateSqlite(db);

  const versions = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
  assert.deepEqual(versions.map((row) => row.version), ["001_init.sql", "002_catalog_enrichment.sql"]);

  const productColumns = db.prepare("PRAGMA table_info(products)").all().map((row) => row.name);
  assert.ok(productColumns.includes("brand"));
  assert.ok(productColumns.includes("highlights_json"));
  assert.ok(productColumns.includes("specifications_json"));

  const categoryColumns = db.prepare("PRAGMA table_info(categories)").all().map((row) => row.name);
  assert.ok(categoryColumns.includes("description"));
  db.close();
});
