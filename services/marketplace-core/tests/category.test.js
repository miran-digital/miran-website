import assert from "node:assert/strict";
import test from "node:test";
import { CategoryService } from "../src/category-service.js";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";

function fixture() {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('admin','admin@example.com','s','h','ADMIN')").run();
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('customer','customer@example.com','s','h','CUSTOMER')").run();
  return { db, categories: new CategoryService(db) };
}

test("admin can create parent and child categories while public list exposes only visible categories", () => {
  const { db, categories } = fixture();
  const parent = categories.create("admin", { name: "دیجیتال", slug: "digital", sortOrder: 1 });
  const child = categories.create("admin", { name: "موبایل", slug: "mobile", parentId: parent.id, imageUrl: "/media/mobile.webp" });
  categories.create("admin", { name: "پنهان", slug: "hidden", visible: false });

  const publicRows = categories.listPublic();
  assert.equal(publicRows.length, 2);
  assert.equal(publicRows.find((row) => row.id === child.id).parentId, parent.id);
  assert.throws(() => categories.listManaged("customer"), /admin role/i);
  db.close();
});

test("category service blocks hierarchy cycles and deletion when dependencies exist", () => {
  const { db, categories } = fixture();
  const parent = categories.create("admin", { name: "خانه", slug: "home" });
  const child = categories.create("admin", { name: "آشپزخانه", slug: "kitchen", parentId: parent.id });
  assert.throws(() => categories.update("admin", parent.id, { parentId: child.id }), /cycle/i);
  assert.throws(() => categories.remove("admin", parent.id), /child categories/i);

  db.prepare("INSERT INTO products (id,category_id,title,slug,base_price_irr,status) VALUES ('p1',?,'کتری','kettle',1000000,'DRAFT')").run(child.id);
  db.prepare("INSERT INTO inventory (product_id,stock_on_hand,stock_reserved) VALUES ('p1',1,0)").run();
  assert.throws(() => categories.remove("admin", child.id), /used by products/i);
  db.close();
});
