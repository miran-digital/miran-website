import assert from "node:assert/strict";
import test from "node:test";
import { LegacyPreviewImportService } from "../src/legacy-preview-import-service.js";
import { ProductCreateService } from "../src/product-create-service.js";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";

function fixture() {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('admin','admin@example.com','s','h','ADMIN')").run();
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('customer','customer@example.com','s','h','CUSTOMER')").run();
  db.prepare("INSERT INTO categories (id,name,slug,sort_order,is_visible,description) VALUES ('cat-mobile','موبایل','mobile',1,1,'')").run();
  const creator = new ProductCreateService(db);
  return { db, service: new LegacyPreviewImportService(db, creator) };
}

test("preview content import is admin-only and idempotent", () => {
  const { db, service } = fixture();
  const payload = {
    sections: {
      hero: true,
      categories: false,
      specialOffers: true,
      digitalPicks: false,
      homePicks: true,
      trending: false,
      brands: true,
      trust: true,
    },
    headerMessages: [
      {
        id: "legacy-header-1",
        text: "ارسال سریع Miran",
        href: "/help/delivery",
        startsAt: "",
        endsAt: "",
        visible: true,
      },
    ],
    banners: [
      {
        id: "legacy-banner-1",
        title: "بنر قدیمی",
        href: "/offers",
        visible: true,
      },
    ],
  };

  assert.throws(() => service.importContent("customer", payload), /admin role/i);
  const first = service.importContent("admin", payload);
  const second = service.importContent("admin", payload);

  assert.deepEqual(first, second);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM header_messages WHERE legacy_key IS NOT NULL").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM storefront_banners WHERE legacy_key IS NOT NULL").get().n, 1);
  assert.equal(db.prepare("SELECT visible FROM home_sections WHERE section_key='categories'").get().visible, 0);
  assert.equal(db.prepare("SELECT visible FROM home_sections WHERE section_key='products'").get().visible, 1);
  db.close();
});

test("preview product import requires reviewed IRR price, creates draft and never trusts legacy price", () => {
  const { db, service } = fixture();
  const base = {
    legacyId: "preview-product-1",
    title: "محصول قدیمی",
    slug: "legacy-phone",
    brand: "Miran",
    categorySlug: "mobile",
  };

  assert.throws(
    () => service.importProductDraft("admin", { ...base, basePriceIrr: undefined }),
    /reviewed integer IRR price/i,
  );

  const first = service.importProductDraft("admin", {
    ...base,
    basePriceIrr: 125_000_000,
  });
  assert.equal(first.product.status, "DRAFT");
  assert.equal(first.product.base_price_irr, 125_000_000);
  assert.equal(first.product.category_id, "cat-mobile");
  assert.equal(first.alreadyImported, false);
  assert.equal(db.prepare("SELECT stock_on_hand FROM inventory WHERE product_id=?").get(first.product.id).stock_on_hand, 0);

  const second = service.importProductDraft("admin", {
    ...base,
    basePriceIrr: 999_999_999,
  });
  assert.equal(second.alreadyImported, true);
  assert.equal(second.product.id, first.product.id);
  assert.equal(second.product.base_price_irr, 125_000_000);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM products WHERE legacy_key IS NOT NULL").get().n, 1);
  db.close();
});
