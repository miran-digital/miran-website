import assert from "node:assert/strict";
import test from "node:test";
import { PostgresCatalogManagementService } from "../postgres/catalog-management-service.js";
import { migratePostgres, openPostgresPool } from "../postgres/database.js";
import { PostgresProductMediaUploadService } from "../postgres/product-media-upload-service.js";
import { PostgresSellerDocumentUploadService } from "../postgres/seller-document-upload-service.js";
import { PostgresSellerService } from "../postgres/seller-service.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

function fakePrivateStorage() {
  let verifies = 0;
  return {
    get verifies() {
      return verifies;
    },
    issueUpload({ key, mimeType, sha256 }) {
      return {
        uploadUrl: `https://private-upload.example.test/${encodeURIComponent(key)}`,
        method: "PUT",
        headers: { "content-type": mimeType, "x-amz-meta-sha256": sha256 },
        expiresAt: "2026-08-16T00:10:00.000Z",
      };
    },
    async verifyObject() {
      verifies += 1;
      return true;
    },
    issueDownload({ key }) {
      return {
        downloadUrl: `https://private-download.example.test/${encodeURIComponent(key)}`,
        expiresAt: "2026-08-16T00:05:00.000Z",
      };
    },
  };
}

function fakePublicStorage() {
  let verifies = 0;
  return {
    get verifies() {
      return verifies;
    },
    issueAssetUpload({ key, mimeType, sha256 }) {
      return {
        uploadUrl: `https://media-upload.example.test/${encodeURIComponent(key)}`,
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
}

async function fixture() {
  if (!databaseUrl) throw new Error("POSTGRES_TEST_DATABASE_URL is required");
  const pool = openPostgresPool({
    connectionString: databaseUrl,
    max: 8,
    applicationName: "miran-postgres-storage-test",
  });
  await migratePostgres(pool);
  const suffix = Date.now().toString(36);
  const adminId = `admin-storage-${suffix}`;
  const sellerUserId = `seller-storage-${suffix}`;
  const sellerId = `seller-storage-record-${suffix}`;
  await pool.query(
    `INSERT INTO users(id,email,password_salt,password_hash,role) VALUES
     ($1,$2,'s','h','ADMIN'),
     ($3,$4,'s','h','SELLER')`,
    [adminId, `${adminId}@example.com`, sellerUserId, `${sellerUserId}@example.com`],
  );
  await pool.query(
    `INSERT INTO sellers(id,user_id,business_name,status)
     VALUES($1,$2,'Storage Seller','APPROVED')`,
    [sellerId, sellerUserId],
  );
  return {
    pool,
    suffix,
    adminId,
    sellerUserId,
    sellerId,
    sellers: new PostgresSellerService(pool),
    catalog: new PostgresCatalogManagementService(pool),
  };
}

test(
  "PostgreSQL seller document completion stores verified metadata once and admin gets short-lived download",
  { skip: !databaseUrl },
  async () => {
    const value = await fixture();
    const storage = fakePrivateStorage();
    const service = new PostgresSellerDocumentUploadService(value.pool, value.sellers, storage);
    try {
      await value.pool.query("UPDATE sellers SET status='PENDING' WHERE id=$1", [value.sellerId]);
      await value.pool.query("UPDATE users SET role='CUSTOMER' WHERE id=$1", [value.sellerUserId]);
      const digest = "c".repeat(64);
      const ticket = await service.issueUploadTicket(value.sellerUserId, {
        kind: "IDENTITY",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        sha256: digest,
      });
      assert.match(ticket.storageKey, new RegExp(`^private/sellers/${value.sellerId}/`));
      const document = await service.completeUpload(value.sellerUserId, {
        kind: ticket.kind,
        storageKey: ticket.storageKey,
        mimeType: ticket.mimeType,
        sizeBytes: ticket.sizeBytes,
        sha256: ticket.sha256,
      });
      assert.equal(storage.verifies, 1);
      assert.equal(document.status, "PENDING");
      await assert.rejects(
        () => service.completeUpload(value.sellerUserId, {
          kind: ticket.kind,
          storageKey: ticket.storageKey,
          mimeType: ticket.mimeType,
          sizeBytes: ticket.sizeBytes,
          sha256: ticket.sha256,
        }),
        (error) => error?.code === "CONFLICT",
      );
      const download = await service.issueAdminDownloadTicket(value.adminId, document.id);
      assert.match(download.downloadUrl, /^https:\/\/private-download\.example\.test\//);
    } finally {
      await value.pool.end();
    }
  },
);

test(
  "PostgreSQL product media upload respects product ownership and verified public media",
  { skip: !databaseUrl },
  async () => {
    const value = await fixture();
    const storage = fakePublicStorage();
    const service = new PostgresProductMediaUploadService(value.pool, value.catalog, storage);
    try {
      const product = await value.catalog.createProduct(value.sellerUserId, {
        title: "Storage Product",
        slug: `storage-product-${value.suffix}`,
        basePriceIrr: 1_000_000,
        stockOnHand: 1,
        status: "DRAFT",
      });
      const digest = "d".repeat(64);
      const ticket = await service.issueUploadTicket(value.sellerUserId, product.id, {
        mediaType: "IMAGE",
        mimeType: "image/webp",
        sizeBytes: 4096,
        sha256: digest,
        sortOrder: 0,
        isPrimary: true,
      });
      const first = await service.completeUpload(value.sellerUserId, product.id, {
        storageKey: ticket.storageKey,
        mediaType: ticket.mediaType,
        mimeType: ticket.mimeType,
        sizeBytes: ticket.sizeBytes,
        sha256: ticket.sha256,
        sortOrder: ticket.sortOrder,
        isPrimary: ticket.isPrimary,
      });
      assert.equal(first.alreadyCompleted, false);
      assert.equal(first.media.url, `https://media.almiran.ir/${ticket.storageKey}`);
      assert.equal(storage.verifies, 1);
      const second = await service.completeUpload(value.sellerUserId, product.id, {
        storageKey: ticket.storageKey,
        mediaType: ticket.mediaType,
        mimeType: ticket.mimeType,
        sizeBytes: ticket.sizeBytes,
        sha256: ticket.sha256,
        sortOrder: ticket.sortOrder,
        isPrimary: ticket.isPrimary,
      });
      assert.equal(second.alreadyCompleted, true);
      assert.equal(storage.verifies, 1);
    } finally {
      await value.pool.end();
    }
  },
);
