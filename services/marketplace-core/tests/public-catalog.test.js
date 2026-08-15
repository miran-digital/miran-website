import assert from "node:assert/strict";
import test from "node:test";
import { CategoryService } from "../src/category-service.js";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";
import { ProductCreateService } from "../src/product-create-service.js";
import { PublicCatalogService } from "../src/public-catalog-service.js";

function fixture() {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('admin','admin@example.com','s','h','ADMIN')").run();
  return {
    db,
    categories: new CategoryService(db),
    products: new ProductCreateService(db),
    publicCatalog: new PublicCatalogService(db),
  };
}

test("public catalog returns enriched IRR product data from database", () => {
  const { db, categories, products, publicCatalog } = fixture();
  const category = categories.create("admin", {
    name: "موبایل",
    slug: "mobile",
    imageUrl: "/media/mobile.webp",
  });

  const product = products.create("admin", {
    title: "گوشی Miran X",
    slug: "miran-x",
    brand: "Miran",
    categoryId: category.id,
    description: "گوشی تست",
    basePriceIrr: 100_000_000,
    discountType: "PERCENTAGE",
    discountValue: 10,
    stockOnHand: 3,
    status: "PUBLISHED",
    isAmazing: true,
    highlights: ["حافظه 256 گیگ"],
    specifications: [{ label: "رنگ", value: "مشکی" }],
  });
  db.prepare("INSERT INTO product_media (id,product_id,media_type,url,sort_order,is_primary) VALUES ('m1',?,'IMAGE','/media/miran-x.webp',0,1)").run(product.id);

  const publicProduct = publicCatalog.getProduct("miran-x");
  assert.equal(publicProduct.currency, "IRR");
  assert.equal(publicProduct.brand, "Miran");
  assert.equal(publicProduct.category.slug, "mobile");
  assert.equal(publicProduct.pricing.finalIrr, 90_000_000);
  assert.equal(publicProduct.availableQuantity, 3);
  assert.equal(publicProduct.highlights[0], "حافظه 256 گیگ");
  assert.deepEqual(publicProduct.specifications[0], { label: "رنگ", value: "مشکی" });
  assert.equal(publicProduct.media[0].isPrimary, true);
  assert.equal(publicCatalog.listProducts({ amazingOnly: true }).length, 1);
  db.close();
});

test("draft products never appear in public catalog", () => {
  const { db, products, publicCatalog } = fixture();
  products.create("admin", {
    title: "Draft",
    slug: "draft-product",
    basePriceIrr: 1_000_000,
    stockOnHand: 1,
    status: "DRAFT",
  });
  assert.equal(publicCatalog.listProducts().length, 0);
  assert.throws(() => publicCatalog.getProduct("draft-product"), /not found/i);
  db.close();
});
