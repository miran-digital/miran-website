import assert from "node:assert/strict";
import test from "node:test";
import { CatalogService } from "../src/catalog-service.js";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";
import { ProductCreateService } from "../src/product-create-service.js";
import { ProductMediaUploadService } from "../src/product-media-upload-service.js";

function fixture() {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('admin','admin@example.com','s','h','ADMIN')").run();
  const creator = new ProductCreateService(db);
  const product = creator.create("admin", {
    title: "Media Product",
    slug: "media-product",
    basePriceIrr: 100_000,
    stockOnHand: 2,
    status: "DRAFT",
  });
  const catalog = new CatalogService(db);
  let verifies = 0;
  const storage = {
    issueAssetUpload({ key, mimeType, sha256 }) {
      return {
        uploadUrl: `https://upload.example.test/${encodeURIComponent(key)}`,
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
    product,
    catalog,
    service: new ProductMediaUploadService(db, catalog, storage),
    verifies: () => verifies,
  };
}

test("verified product image becomes public media and completion is idempotent", async () => {
  const { db, product, service, verifies } = fixture();
  const digest = "f".repeat(64);
  const ticket = service.issueUploadTicket("admin", product.id, {
    mediaType: "IMAGE",
    mimeType: "image/webp",
    sizeBytes: 4096,
    sha256: digest,
    sortOrder: 1,
    isPrimary: true,
  });
  assert.match(ticket.storageKey, new RegExp(`^public/products/${product.id}/`));

  const first = await service.completeUpload("admin", product.id, {
    storageKey: ticket.storageKey,
    mediaType: ticket.mediaType,
    mimeType: ticket.mimeType,
    sizeBytes: ticket.sizeBytes,
    sha256: ticket.sha256,
    sortOrder: ticket.sortOrder,
    isPrimary: ticket.isPrimary,
  });
  assert.equal(first.alreadyCompleted, false);
  assert.equal(first.media.is_primary, 1);
  assert.equal(first.media.url, `https://media.almiran.ir/${ticket.storageKey}`);
  assert.equal(first.media.storage_key, ticket.storageKey);
  assert.equal(verifies(), 1);

  const second = await service.completeUpload("admin", product.id, {
    storageKey: ticket.storageKey,
    mediaType: ticket.mediaType,
    mimeType: ticket.mimeType,
    sizeBytes: ticket.sizeBytes,
    sha256: ticket.sha256,
    sortOrder: ticket.sortOrder,
    isPrimary: ticket.isPrimary,
  });
  assert.equal(second.alreadyCompleted, true);
  assert.equal(verifies(), 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM product_media").get().n, 1);
  db.close();
});

test("media upload enforces type, size and product ownership", () => {
  const { db, product, service } = fixture();
  db.prepare("INSERT INTO users (id,email,password_salt,password_hash,role) VALUES ('customer','customer@example.com','s','h','CUSTOMER')").run();

  assert.throws(
    () => service.issueUploadTicket("admin", product.id, {
      mediaType: "VIDEO",
      mimeType: "video/mp4",
      sizeBytes: 50_000_001,
      sha256: "a".repeat(64),
    }),
    /at most 50 MB/i,
  );
  assert.throws(
    () => service.issueUploadTicket("admin", product.id, {
      mediaType: "IMAGE",
      mimeType: "image/svg+xml",
      sizeBytes: 100,
      sha256: "a".repeat(64),
    }),
    /unsupported product media/i,
  );
  assert.throws(
    () => service.issueUploadTicket("customer", product.id, {
      mediaType: "IMAGE",
      mimeType: "image/png",
      sizeBytes: 100,
      sha256: "a".repeat(64),
    }),
    /seller or admin role|required/i,
  );
  db.close();
});
