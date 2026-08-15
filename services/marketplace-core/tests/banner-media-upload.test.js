import assert from "node:assert/strict";
import test from "node:test";
import { BannerMediaUploadService } from "../src/banner-media-upload-service.js";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";
import { StorefrontCmsService } from "../src/storefront-cms-service.js";

function fixture() {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('admin','admin@example.com','s','h','ADMIN')").run();
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('customer','customer@example.com','s','h','CUSTOMER')").run();
  const cms = new StorefrontCmsService(db);
  const banner = cms.createBanner("admin", {
    title: "Hero",
    href: "/offers",
    placement: "HERO",
    visible: true,
  });
  let verifies = 0;
  const storage = {
    issueAssetUpload({ key, mimeType, sha256 }) {
      return {
        uploadUrl: `https://storage.example.test/${encodeURIComponent(key)}`,
        method: "PUT",
        headers: { "content-type": mimeType, "x-amz-meta-sha256": sha256 },
        expiresAt: "2026-08-16T00:10:00.000Z",
      };
    },
    async verifyObject() {
      verifies += 1;
      return true;
    },
    publicUrl(key) {
      return `https://media.almiran.ir/${key}`;
    },
  };
  return {
    db,
    banner,
    service: new BannerMediaUploadService(db, cms, storage),
    verifies: () => verifies,
  };
}

test("admin uploads verified banner image and completion is idempotent", async () => {
  const { db, banner, service, verifies } = fixture();
  const digest = "a".repeat(64);
  const ticket = service.issueUploadTicket("admin", banner.id, {
    mimeType: "image/webp",
    sizeBytes: 4096,
    sha256: digest,
  });
  assert.match(ticket.storageKey, new RegExp(`^public/banners/${banner.id}/`));

  const first = await service.completeUpload("admin", banner.id, {
    storageKey: ticket.storageKey,
    mimeType: ticket.mimeType,
    sizeBytes: ticket.sizeBytes,
    sha256: ticket.sha256,
  });
  assert.equal(first.alreadyCompleted, false);
  assert.equal(first.banner.imageUrl, `https://media.almiran.ir/${ticket.storageKey}`);
  assert.equal(verifies(), 1);

  const second = await service.completeUpload("admin", banner.id, {
    storageKey: ticket.storageKey,
    mimeType: ticket.mimeType,
    sizeBytes: ticket.sizeBytes,
    sha256: ticket.sha256,
  });
  assert.equal(second.alreadyCompleted, true);
  assert.equal(verifies(), 1);
  const stored = db.prepare("SELECT storage_key,sha256 FROM storefront_banners WHERE id=?").get(banner.id);
  assert.equal(stored.storage_key, ticket.storageKey);
  assert.equal(stored.sha256, digest);
  db.close();
});

test("non-admin and invalid banner image are rejected", () => {
  const { db, banner, service } = fixture();
  assert.throws(
    () => service.issueUploadTicket("customer", banner.id, {
      mimeType: "image/png",
      sizeBytes: 100,
      sha256: "b".repeat(64),
    }),
    /admin role/i,
  );
  assert.throws(
    () => service.issueUploadTicket("admin", banner.id, {
      mimeType: "image/svg+xml",
      sizeBytes: 100,
      sha256: "b".repeat(64),
    }),
    /unsupported banner image/i,
  );
  db.close();
});
