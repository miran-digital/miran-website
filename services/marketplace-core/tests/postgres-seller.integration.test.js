import assert from "node:assert/strict";
import test from "node:test";
import { migratePostgres, openPostgresPool } from "../postgres/database.js";
import { PostgresMarketplaceService } from "../postgres/marketplace-service.js";
import { PostgresSellerService } from "../postgres/seller-service.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

async function fixture() {
  if (!databaseUrl) throw new Error("POSTGRES_TEST_DATABASE_URL is required");
  const pool = openPostgresPool({
    connectionString: databaseUrl,
    max: 6,
    applicationName: "miran-postgres-seller-test",
  });
  await migratePostgres(pool);
  const marketplace = new PostgresMarketplaceService(pool);
  const sellers = new PostgresSellerService(pool);
  const suffix = Date.now().toString(36);
  const adminId = `admin-${suffix}`;
  await pool.query(
    "INSERT INTO users(id,email,password_salt,password_hash,role) VALUES($1,$2,'salt','hash','ADMIN')",
    [adminId, `${adminId}@example.com`],
  );
  const user = await marketplace.register({
    email: `seller-${suffix}@example.com`,
    password: "very-secure-pass-123",
  });
  return { pool, marketplace, sellers, adminId, user, suffix };
}

test(
  "PostgreSQL seller approval requires approved document and guarantee and changes role atomically",
  { skip: !databaseUrl },
  async () => {
    const { pool, sellers, adminId, user, suffix } = await fixture();
    try {
      const application = await sellers.requestSeller(user.id, {
        businessName: "Miran Seller",
        legalName: "Miran Seller Ltd",
        nationalId: `N-${suffix}`,
      });
      assert.equal(application.status, "PENDING");
      await assert.rejects(
        () => sellers.approve(adminId, application.id),
        (error) => error?.code === "CONFLICT",
      );

      const document = await sellers.addDocument(user.id, {
        kind: "IDENTITY",
        storageKey: `private/sellers/${application.id}/${suffix}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 2048,
        sha256: "a".repeat(64),
      });
      const guarantee = await sellers.addGuarantee(user.id, {
        kind: "DEPOSIT",
        reference: `G-${suffix}`,
        amountIrr: 50_000_000,
      });
      await sellers.reviewDocument(adminId, document.id, "APPROVED");
      await sellers.reviewGuarantee(adminId, guarantee.id, "APPROVED");
      const approved = await sellers.approve(adminId, application.id);
      assert.equal(approved.status, "APPROVED");
      assert.equal(approved.documents[0].status, "APPROVED");
      assert.equal(approved.guarantees[0].status, "APPROVED");

      const role = await pool.query("SELECT role FROM users WHERE id=$1", [user.id]);
      assert.equal(role.rows[0].role, "SELLER");
      assert.equal((await sellers.requireApprovedSeller(user.id)).id, application.id);
      await assert.rejects(
        () => sellers.addGuarantee(user.id, {
          kind: "OTHER",
          reference: "late-change",
          amountIrr: null,
        }),
        (error) => error?.code === "CONFLICT",
      );
    } finally {
      await pool.end();
    }
  },
);

test(
  "PostgreSQL seller suspension removes seller role in the same transaction",
  { skip: !databaseUrl },
  async () => {
    const { pool, sellers, adminId, user, suffix } = await fixture();
    try {
      const application = await sellers.requestSeller(user.id, { businessName: "Suspend Seller" });
      const document = await sellers.addDocument(user.id, {
        kind: "IDENTITY",
        storageKey: `private/sellers/${application.id}/${suffix}.png`,
        mimeType: "image/png",
        sizeBytes: 100,
        sha256: "b".repeat(64),
      });
      const guarantee = await sellers.addGuarantee(user.id, {
        kind: "LETTER",
        reference: `L-${suffix}`,
        amountIrr: null,
      });
      await sellers.reviewDocument(adminId, document.id, "APPROVED");
      await sellers.reviewGuarantee(adminId, guarantee.id, "APPROVED");
      await sellers.approve(adminId, application.id);
      const suspended = await sellers.suspend(adminId, application.id, "Compliance review");
      assert.equal(suspended.status, "SUSPENDED");
      const role = await pool.query("SELECT role FROM users WHERE id=$1", [user.id]);
      assert.equal(role.rows[0].role, "CUSTOMER");
    } finally {
      await pool.end();
    }
  },
);
