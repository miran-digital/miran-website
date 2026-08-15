import assert from "node:assert/strict";
import test from "node:test";
import { CatalogService } from "../src/catalog-service.js";
import { MarketplaceCore } from "../src/core.js";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";

function fixture() {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  return {
    db,
    core: new MarketplaceCore(db),
    catalog: new CatalogService(db),
  };
}

function makeAdmin(db, core, email = "admin-catalog@example.com") {
  const user = core.register({ email, password: "very-secure-pass-123" });
  db.prepare("UPDATE users SET role='ADMIN' WHERE id=?").run(user.id);
  return { ...user, role: "ADMIN" };
}

test("public catalog exposes only published products with server-side IRR pricing", () => {
  const { db, core, catalog } = fixture();
  const admin = makeAdmin(db, core);
  const draft = core.createProduct(admin.id, {
    title: "Draft",
    slug: "draft",
    basePriceIrr: 1_000_000,
    status: "DRAFT",
    stockOnHand: 3,
  });
  const published = core.createProduct(admin.id, {
    title: "Published",
    slug: "published",
    basePriceIrr: 2_000_000,
    discountType: "PERCENTAGE",
    discountValue: 10,
    status: "PUBLISHED",
    stockOnHand: 2,
  });
  catalog.addMedia(admin.id, published.id, {
    mediaType: "IMAGE",
    url: "/media/product.webp",
    isPrimary: true,
  });

  const publicProducts = catalog.listPublished();
  assert.equal(publicProducts.length, 1);
  assert.equal(publicProducts[0].id, published.id);
  assert.equal(publicProducts[0].currency, "IRR");
  assert.equal(publicProducts[0].pricing.finalIrr, 1_800_000);
  assert.equal(publicProducts[0].media.length, 1);
  assert.throws(() => catalog.getPublished(draft.id), /not found/i);
  db.close();
});

test("seller can manage only own approved products and inventory cannot drop below reservations", () => {
  const { db, core, catalog } = fixture();
  const admin = makeAdmin(db, core, "admin-catalog2@example.com");
  const sellerUser = core.register({
    email: "catalog-seller@example.com",
    password: "very-secure-pass-123",
  });
  const seller = core.requestSeller(sellerUser.id, { businessName: "Seller A" });
  core.approveSeller(admin.id, seller.id);

  const otherUser = core.register({
    email: "catalog-other@example.com",
    password: "very-secure-pass-123",
  });
  const otherSeller = core.requestSeller(otherUser.id, { businessName: "Seller B" });
  core.approveSeller(admin.id, otherSeller.id);

  const own = core.createProduct(sellerUser.id, {
    sellerId: seller.id,
    title: "Own",
    slug: "own-product",
    basePriceIrr: 1_000_000,
    status: "PUBLISHED",
    stockOnHand: 5,
  });
  const other = core.createProduct(otherUser.id, {
    sellerId: otherSeller.id,
    title: "Other",
    slug: "other-product",
    basePriceIrr: 1_000_000,
    status: "PUBLISHED",
    stockOnHand: 5,
  });

  assert.equal(catalog.listManaged(sellerUser.id).length, 1);
  catalog.updateProduct(sellerUser.id, own.id, {
    basePriceIrr: 1_200_000,
    discountType: "FIXED_IRR",
    discountValue: 200_000,
  });
  assert.equal(catalog.getPublished(own.id).pricing.finalIrr, 1_000_000);
  assert.throws(
    () => catalog.updateProduct(sellerUser.id, other.id, { title: "Nope" }),
    /cannot manage/i,
  );

  db.prepare("UPDATE inventory SET stock_reserved=3 WHERE product_id=?").run(own.id);
  assert.throws(() => catalog.setInventory(sellerUser.id, own.id, 2), /reserved/i);
  assert.equal(catalog.setInventory(sellerUser.id, own.id, 4).stockOnHand, 4);
  db.close();
});
