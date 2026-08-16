import assert from "node:assert/strict";
import test from "node:test";
import { CatalogService } from "../src/catalog-service.js";
import { CategoryService } from "../src/category-service.js";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";
import { ProductCreateService } from "../src/product-create-service.js";

function fixture() {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('admin','admin@example.com','s','h','ADMIN')").run();
  return {
    db,
    catalog: new CatalogService(db),
    categories: new CategoryService(db),
    creator: new ProductCreateService(db),
  };
}

test("admin can edit brand category schedule highlights specifications and multiple media", () => {
  const { db, catalog, categories, creator } = fixture();
  const category = categories.create("admin", { name: "موبایل", slug: "mobile" });
  const product = creator.create("admin", {
    title: "Miran Phone",
    slug: "miran-phone",
    basePriceIrr: 50_000_000,
    stockOnHand: 4,
  });

  const updated = catalog.updateProduct("admin", product.id, {
    brand: "Miran",
    categoryId: category.id,
    discountType: "PERCENTAGE",
    discountValue: 20,
    discountStartsAt: "2026-08-15T10:00:00.000Z",
    discountEndsAt: "2026-08-20T10:00:00.000Z",
    isAmazing: true,
    highlights: ["حافظه 256 گیگ"],
    specifications: [{ label: "رنگ", value: "مشکی" }],
  });
  assert.equal(updated.brand, "Miran");
  assert.equal(updated.categoryId, category.id);
  assert.equal(updated.categoryName, "موبایل");
  assert.equal(updated.highlights[0], "حافظه 256 گیگ");
  assert.deepEqual(updated.specifications[0], { label: "رنگ", value: "مشکی" });

  catalog.addMedia("admin", product.id, {
    mediaType: "IMAGE",
    url: "/media/phone-main.webp",
    sortOrder: 0,
    isPrimary: true,
  });
  catalog.addMedia("admin", product.id, {
    mediaType: "VIDEO",
    url: "https://cdn.example.com/phone.mp4",
    sortOrder: 1,
  });
  assert.equal(catalog.getManaged("admin", product.id).media.length, 2);
  db.close();
});

test("catalog rejects invalid discount schedule", () => {
  const { db, catalog, creator } = fixture();
  const product = creator.create("admin", {
    title: "Schedule test",
    slug: "schedule-test",
    basePriceIrr: 1_000_000,
    stockOnHand: 1,
  });
  assert.throws(
    () => catalog.updateProduct("admin", product.id, {
      discountStartsAt: "2026-08-20T10:00:00.000Z",
      discountEndsAt: "2026-08-19T10:00:00.000Z",
    }),
    /end time must be after/i,
  );
  db.close();
});
