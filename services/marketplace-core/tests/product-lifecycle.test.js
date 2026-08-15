import assert from "node:assert/strict";
import test from "node:test";
import { CatalogService } from "../src/catalog-service.js";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";
import { ProductCreateService } from "../src/product-create-service.js";
import { ProductLifecycleService } from "../src/product-lifecycle-service.js";
import { PublicCatalogService } from "../src/public-catalog-service.js";

function fixture() {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('admin','admin@example.com','s','h','ADMIN')").run();
  return {
    db,
    catalog: new CatalogService(db),
    creator: new ProductCreateService(db),
    lifecycle: new ProductLifecycleService(db),
    publicCatalog: new PublicCatalogService(db),
  };
}

test("archive hides product from public catalog without deleting order-safe product row", () => {
  const { db, creator, lifecycle, publicCatalog } = fixture();
  const product = creator.create("admin", {
    title: "Archive me",
    slug: "archive-me",
    basePriceIrr: 2_000_000,
    stockOnHand: 2,
    status: "PUBLISHED",
  });
  assert.equal(publicCatalog.getProduct(product.id).id, product.id);
  lifecycle.setArchived("admin", product.id, true);
  assert.throws(() => publicCatalog.getProduct(product.id), /not found/i);
  assert.equal(db.prepare("SELECT status FROM products WHERE id=?").get(product.id).status, "ARCHIVED");
  lifecycle.setArchived("admin", product.id, false);
  assert.equal(db.prepare("SELECT status FROM products WHERE id=?").get(product.id).status, "DRAFT");
  db.close();
});

test("deleting primary image promotes next image and leaves video intact", () => {
  const { db, catalog, creator, lifecycle } = fixture();
  const product = creator.create("admin", {
    title: "Media",
    slug: "media-product",
    basePriceIrr: 1_000_000,
    stockOnHand: 1,
  });
  const first = catalog.addMedia("admin", product.id, { mediaType: "IMAGE", url: "/a.webp", isPrimary: true, sortOrder: 0 });
  const second = catalog.addMedia("admin", product.id, { mediaType: "IMAGE", url: "/b.webp", sortOrder: 1 });
  catalog.addMedia("admin", product.id, { mediaType: "VIDEO", url: "/clip.mp4", sortOrder: 2 });
  lifecycle.removeMedia("admin", product.id, first.id);
  assert.equal(db.prepare("SELECT is_primary FROM product_media WHERE id=?").get(second.id).is_primary, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM product_media WHERE product_id=?").get(product.id).n, 2);
  db.close();
});
