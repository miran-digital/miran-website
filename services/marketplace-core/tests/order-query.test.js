import assert from "node:assert/strict";
import test from "node:test";
import { MarketplaceCore } from "../src/core.js";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";
import { OrderQueryService } from "../src/order-query-service.js";
import { ProductCreateService } from "../src/product-create-service.js";

function fixture() {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  const core = new MarketplaceCore(db);
  const products = new ProductCreateService(db);
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('admin','admin@example.com','s','h','ADMIN')").run();
  return { db, core, products, orders: new OrderQueryService(db) };
}

function buyer(core, suffix) {
  const user = core.register({ email: `${suffix}@example.com`, password: "very-secure-pass-123" });
  const address = core.addAddress(user.id, {
    fullName: suffix,
    phone: "09120000000",
    province: "Tehran",
    city: "Tehran",
    addressLine: "Test street",
    postalCode: "1234567890",
    isDefault: true,
  });
  return { user, address };
}

test("customer sees only own orders and order details use immutable snapshots", () => {
  const { db, core, products, orders } = fixture();
  const first = buyer(core, "buyer-one");
  const second = buyer(core, "buyer-two");
  const product = products.create("admin", {
    title: "Original title",
    slug: "order-query-product",
    basePriceIrr: 5_000_000,
    discountType: "PERCENTAGE",
    discountValue: 10,
    stockOnHand: 3,
    status: "PUBLISHED",
  });

  const created = core.createOrder(first.user.id, {
    addressId: first.address.id,
    idempotencyKey: "order-query-001",
    items: [{ productId: product.id, quantity: 1 }],
  });
  db.prepare("UPDATE products SET title='Changed later' WHERE id=?").run(product.id);

  assert.equal(orders.listMine(first.user.id).length, 1);
  assert.equal(orders.listMine(second.user.id).length, 0);
  const detail = orders.getMine(first.user.id, created.id);
  assert.equal(detail.items[0].title, "Original title");
  assert.equal(detail.totalIrr, 4_500_000);
  assert.throws(() => orders.getMine(second.user.id, created.id), /not found/i);
  db.close();
});

test("admin order list is role protected", () => {
  const { db, core, products, orders } = fixture();
  const first = buyer(core, "admin-list-buyer");
  const product = products.create("admin", {
    title: "Order product",
    slug: "admin-order-product",
    basePriceIrr: 1_000_000,
    stockOnHand: 1,
    status: "PUBLISHED",
  });
  core.createOrder(first.user.id, {
    addressId: first.address.id,
    idempotencyKey: "admin-order-001",
    items: [{ productId: product.id, quantity: 1 }],
  });
  assert.equal(orders.listManaged("admin").length, 1);
  assert.throws(() => orders.listManaged(first.user.id), /admin role/i);
  db.close();
});
