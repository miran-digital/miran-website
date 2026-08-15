import assert from "node:assert/strict";
import test from "node:test";
import { MarketplaceCore } from "../src/core.js";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";
import { SellerDocumentUploadService } from "../src/seller-document-upload-service.js";
import { SellerVerificationService } from "../src/seller-verification-service.js";

function fixture() {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  const core = new MarketplaceCore(db);
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('admin','admin@example.com','s','h','ADMIN')").run();
  const sellerUser = core.register({ email: "upload-seller@example.com", password: "very-secure-pass-123" });
  const outsider = core.register({ email: "outsider@example.com", password: "very-secure-pass-123" });
  const seller = core.requestSeller(sellerUser.id, { businessName: "Upload Seller" });
  const verification = new SellerVerificationService(db);
  const calls = { verify: 0 };
  const storage = {
    issueUpload({ key, mimeType, sha256 }) {
      return {
        uploadUrl: `https://storage.example.test/upload/${encodeURIComponent(key)}`,
        method: "PUT",
        headers: { "content-type": mimeType, "x-amz-meta-sha256": sha256 },
        expiresAt: "2026-08-16T00:10:00.000Z",
      };
    },
    async verifyObject(input) {
      calls.verify += 1;
      assert.match(input.key, new RegExp(`^private/sellers/${seller.id}/`));
      return true;
    },
    issueDownload({ key }) {
      return {
        downloadUrl: `https://storage.example.test/download/${encodeURIComponent(key)}`,
        expiresAt: "2026-08-16T00:05:00.000Z",
      };
    },
  };
  const service = new SellerDocumentUploadService(db, verification, storage);
  return { db, sellerUser, outsider, seller, service, calls };
}

test("seller receives scoped upload ticket and completion stores only verified metadata", async () => {
  const { db, sellerUser, seller, service, calls } = fixture();
  const digest = "d".repeat(64);
  const ticket = service.issueUploadTicket(sellerUser.id, {
    kind: "IDENTITY",
    mimeType: "application/pdf",
    sizeBytes: 4096,
    sha256: digest,
  });

  assert.match(ticket.storageKey, new RegExp(`^private/sellers/${seller.id}/`));
  assert.equal(ticket.method, "PUT");
  assert.equal(ticket.headers["x-amz-meta-sha256"], digest);

  const document = await service.completeUpload(sellerUser.id, {
    kind: ticket.kind,
    storageKey: ticket.storageKey,
    mimeType: ticket.mimeType,
    sizeBytes: ticket.sizeBytes,
    sha256: ticket.sha256,
  });
  assert.equal(calls.verify, 1);
  assert.equal(document.storage_key, ticket.storageKey);
  assert.equal(document.status, "PENDING");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM seller_documents").get().n, 1);

  await assert.rejects(
    () => service.completeUpload(sellerUser.id, {
      kind: ticket.kind,
      storageKey: ticket.storageKey,
      mimeType: ticket.mimeType,
      sizeBytes: ticket.sizeBytes,
      sha256: ticket.sha256,
    }),
    /already completed/i,
  );
  db.close();
});

test("seller cannot complete another namespace and only admin gets download ticket", async () => {
  const { db, sellerUser, outsider, service } = fixture();
  const digest = "e".repeat(64);
  const ticket = service.issueUploadTicket(sellerUser.id, {
    kind: "BUSINESS_LICENSE",
    mimeType: "image/png",
    sizeBytes: 2048,
    sha256: digest,
  });
  const document = await service.completeUpload(sellerUser.id, {
    kind: ticket.kind,
    storageKey: ticket.storageKey,
    mimeType: ticket.mimeType,
    sizeBytes: ticket.sizeBytes,
    sha256: ticket.sha256,
  });

  await assert.rejects(
    () => service.completeUpload(outsider.id, {
      kind: "IDENTITY",
      storageKey: ticket.storageKey,
      mimeType: ticket.mimeType,
      sizeBytes: ticket.sizeBytes,
      sha256: ticket.sha256,
    }),
    /seller application not found/i,
  );
  assert.throws(
    () => service.issueAdminDownloadTicket(sellerUser.id, document.id),
    /admin role/i,
  );
  const download = service.issueAdminDownloadTicket("admin", document.id);
  assert.match(download.downloadUrl, /^https:\/\/storage\.example\.test\/download\//);
  assert.equal(download.document.id, document.id);
  db.close();
});
