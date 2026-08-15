import assert from "node:assert/strict";
import test from "node:test";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";
import { StorefrontCmsService } from "../src/storefront-cms-service.js";

function fixture() {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('admin','admin@example.com','s','h','ADMIN')").run();
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('user','user@example.com','s','h','CUSTOMER')").run();
  return { db, cms: new StorefrontCmsService(db) };
}

test("admin can schedule colored header messages and public view respects schedule", () => {
  const { db, cms } = fixture();
  assert.throws(() => cms.getManaged("user"), /admin role/i);

  const active = cms.createHeaderMessage("admin", {
    text: "ارسال رایگان",
    href: "/offers",
    backgroundColor: "#112233",
    textColor: "#ffffff",
    startsAt: "2026-08-15T00:00:00.000Z",
    endsAt: "2026-08-16T00:00:00.000Z",
  });
  cms.createHeaderMessage("admin", {
    text: "آینده",
    startsAt: "2026-08-20T00:00:00.000Z",
    endsAt: "2026-08-21T00:00:00.000Z",
  });

  const publicCms = cms.getPublic(new Date("2026-08-15T12:00:00.000Z"));
  assert.equal(publicCms.headerMessages.length, 1);
  assert.equal(publicCms.headerMessages[0].id, active.id);
  assert.equal(publicCms.headerMessages[0].backgroundColor, "#112233");
  db.close();
});

test("admin can manage banners and home section visibility", () => {
  const { db, cms } = fixture();
  const banner = cms.createBanner("admin", {
    title: "بنر تست",
    href: "/category/mobile",
    imageUrl: "/media/banner.webp",
    placement: "SMALL",
    sortOrder: 2,
  });
  assert.equal(cms.getPublic().banners.length, 1);
  cms.updateBanner("admin", banner.id, { visible: false });
  assert.equal(cms.getPublic().banners.length, 0);

  const section = cms.updateSection("admin", "categories", { visible: false, sortOrder: 15 });
  assert.equal(section.visible, false);
  assert.equal(cms.getManaged("admin").sections.find((item) => item.key === "categories").visible, false);

  cms.deleteBanner("admin", banner.id);
  assert.equal(cms.getManaged("admin").banners.length, 0);
  db.close();
});
