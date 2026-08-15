import assert from "node:assert/strict";
import test from "node:test";
import { MarketplaceCore, priceProduct } from "../src/core.js";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";

function fixture() {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  return { db, core: new MarketplaceCore(db, { reservationMinutes: 15 }) };
}

function customerWithAddress(core, suffix = "customer") {
  const user = core.register({ email: `${suffix}@example.com`, password: "very-secure-pass-123" });
  const address = core.addAddress(user.id, {
    fullName: "Test User",
    phone: "09120000000",
    province: "Tehran",
    city: "Tehran",
    addressLine: "Test address",
    postalCode: "1234567890",
    isDefault: true,
  });
  return { user, address };
}

test("passwords are hashed and sessions store only token hashes", () => {
  const { db, core } = fixture();
  const user = core.register({ email: "User@Example.com", password: "very-secure-pass-123" });
  const stored = db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
  assert.notEqual(stored.password_hash, "very-secure-pass-123");
  assert.notEqual(stored.password_salt, "very-secure-pass-123");

  const login = core.login({ email: "user@example.com", password: "very-secure-pass-123" });
  assert.equal(core.authenticate(login.token).id, user.id);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE token_hash=?").get(login.token).n, 0);
  core.logout(login.token);
  assert.throws(() => core.authenticate(login.token), /invalid or expired/i);
  db.close();
});

test("seller approval requires admin and discount math stays integer IRR", () => {
  const { db, core } = fixture();
  const sellerUser = core.register({ email: "seller@example.com", password: "very-secure-pass-123" });
  const seller = core.requestSeller(sellerUser.id, { businessName: "Miran Seller" });
  assert.throws(() => core.approveSeller(sellerUser.id, seller.id), /admin role/i);

  const admin = core.register({ email: "admin@example.com", password: "very-secure-pass-123", role: "ADMIN" });
  core.approveSeller(admin.id, seller.id);
  const product = core.createProduct(sellerUser.id, {
    sellerId: seller.id,
    title: "Test product",
    slug: "test-product",
    basePriceIrr: 1_000_000,
    discountType: "PERCENTAGE",
    discountValue: 15,
    status: "PUBLISHED",
    stockOnHand: 5,
  });
  assert.deepEqual(priceProduct(product), { baseIrr: 1_000_000, finalIrr: 850_000, discountIrr: 150_000 });
  assert.equal(db.prepare("SELECT role FROM users WHERE id=?").get(sellerUser.id).role, "SELLER");
  db.close();
});

test("orders reserve stock atomically, are idempotent, block oversell and consume inventory after verified payment", () => {
  const { db, core } = fixture();
  const admin = core.register({ email: "admin2@example.com", password: "very-secure-pass-123", role: "ADMIN" });
  const { user, address } = customerWithAddress(core, "buyer");
  const product = core.createProduct(admin.id, {
    title: "Phone",
    slug: "phone",
    basePriceIrr: 10_000_000,
    discountType: "FIXED_IRR",
    discountValue: 1_000_000,
    status: "PUBLISHED",
    stockOnHand: 2,
  });

  const input = {
    addressId: address.id,
    idempotencyKey: "checkout-001",
    items: [{ productId: product.id, quantity: 2 }],
  };
  const order = core.createOrder(user.id, input);
  const repeated = core.createOrder(user.id, input);
  assert.equal(order.id, repeated.id);

  let inventory = db.prepare("SELECT * FROM inventory WHERE product_id=?").get(product.id);
  assert.equal(inventory.stock_on_hand, 2);
  assert.equal(inventory.stock_reserved, 2);
  assert.throws(() => core.createOrder(user.id, {
    ...input,
    idempotencyKey: "checkout-002",
    items: [{ productId: product.id, quantity: 1 }],
  }), /insufficient stock/i);

  const paid = core.markOrderPaid(order.id, { provider: "TEST", authority: "sandbox-authority", referenceId: "ref-001" });
  assert.equal(paid.status, "PAID");
  inventory = db.prepare("SELECT * FROM inventory WHERE product_id=?").get(product.id);
  assert.equal(inventory.stock_on_hand, 0);
  assert.equal(inventory.stock_reserved, 0);
  db.close();
});
