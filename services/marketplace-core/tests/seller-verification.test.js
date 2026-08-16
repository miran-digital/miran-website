import assert from "node:assert/strict";
import test from "node:test";
import { MarketplaceCore } from "../src/core.js";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";
import { SellerVerificationService } from "../src/seller-verification-service.js";

function fixture() {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  const core = new MarketplaceCore(db);
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('admin','admin@example.com','s','h','ADMIN')").run();
  const sellerUser = core.register({ email: "seller@example.com", password: "very-secure-pass-123" });
  const seller = core.requestSeller(sellerUser.id, { businessName: "Miran Seller" });
  return { db, core, sellerUser, seller, service: new SellerVerificationService(db) };
}

test("seller approval requires reviewed private documents and guarantee", () => {
  const { db, sellerUser, seller, service } = fixture();
  assert.throws(() => service.approve("admin", seller.id), /documents must be approved/i);

  const document = service.addDocument(sellerUser.id, {
    kind: "IDENTITY",
    storageKey: `private/sellers/${seller.id}/identity.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 1024,
    sha256: "a".repeat(64),
  });
  const guarantee = service.addGuarantee(sellerUser.id, {
    kind: "BANK_GUARANTEE",
    reference: "BG-001",
    amountIrr: 50_000_000,
  });

  assert.throws(() => service.approve("admin", seller.id), /documents must be approved/i);
  service.reviewDocument("admin", document.id, "APPROVED");
  assert.throws(() => service.approve("admin", seller.id), /guarantees must be approved/i);
  service.reviewGuarantee("admin", guarantee.id, "APPROVED");

  const approved = service.approve("admin", seller.id);
  assert.equal(approved.status, "APPROVED");
  assert.equal(db.prepare("SELECT role FROM users WHERE id=?").get(sellerUser.id).role, "SELLER");
  assert.equal(approved.documents[0].status, "APPROVED");
  assert.equal(approved.guarantees[0].status, "APPROVED");
  db.close();
});

test("seller evidence enforces private namespace, file limits and admin review authorization", () => {
  const { db, sellerUser, seller, service } = fixture();
  assert.throws(() => service.addDocument(sellerUser.id, {
    kind: "IDENTITY",
    storageKey: "public/identity.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100,
    sha256: "b".repeat(64),
  }), /private seller storage/i);

  const document = service.addDocument(sellerUser.id, {
    kind: "IDENTITY",
    storageKey: `private/sellers/${seller.id}/identity.webp`,
    mimeType: "image/webp",
    sizeBytes: 5000,
    sha256: "c".repeat(64),
  });
  assert.throws(() => service.reviewDocument(sellerUser.id, document.id, "APPROVED"), /admin role/i);
  db.close();
});
