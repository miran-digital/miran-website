import assert from "node:assert/strict";
import test from "node:test";
import { PostgresCatalogManagementService } from "../postgres/catalog-management-service.js";
import { migratePostgres, openPostgresPool } from "../postgres/database.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

async function fixture() {
  if (!databaseUrl) throw new Error("POSTGRES_TEST_DATABASE_URL is required");
  const pool = openPostgresPool({
    connectionString: databaseUrl,
    max: 6,
    applicationName: "miran-postgres-catalog-test",
  });
  await migratePostgres(pool);
  const suffix = Date.now().toString(36);
  const adminId = `admin-cat-${suffix}`;
  const sellerUserId = `seller-cat-${suffix}`;
  const sellerId = `seller-record-${suffix}`;
  const otherSellerUserId = `seller-other-${suffix}`;
  const otherSellerId = `seller-other-record-${suffix}`;
  await pool.query(
    `INSERT INTO users(id,email,password_salt,password_hash,role) VALUES
     ($1,$2,'s','h','ADMIN'),
     ($3,$4,'s','h','SELLER'),
     ($5,$6,'s','h','SELLER')`,
    [
      adminId,
      `${adminId}@example.com`,
      sellerUserId,
      `${sellerUserId}@example.com`,
      otherSellerUserId,
      `${otherSellerUserId}@example.com`,
    ],
  );
  await pool.query(
    `INSERT INTO sellers(id,user_id,business_name,status) VALUES
     ($1,$2,'Seller A','APPROVED'),
     ($3,$4,'Seller B','APPROVED')`,
    [sellerId, sellerUserId, otherSellerId, otherSellerUserId],
  );
  return {
    pool,
    service: new PostgresCatalogManagementService(pool),
    suffix,
    adminId,
    sellerUserId,
    sellerId,
    otherSellerUserId,
  };
}

test(
  "PostgreSQL categories prevent hierarchy cycles and dependent deletion",
  { skip: !databaseUrl },
  async () => {
    const { pool, service, suffix, adminId } = await fixture();
    try {
      const parent = await service.createCategory(adminId, {
        name: "Digital",
        slug: `digital-${suffix}`,
        sortOrder: 10,
      });
      const child = await service.createCategory(adminId, {
        name: "Mobile",
        slug: `mobile-${suffix}`,
        parentId: parent.id,
        sortOrder: 20,
      });
      await assert.rejects(
        () => service.updateCategory(adminId, parent.id, { parentId: child.id }),
        (error) => error?.code === "CONFLICT",
      );
      await assert.rejects(
        () => service.removeCategory(adminId, parent.id),
        (error) => error?.code === "CONFLICT",
      );
      assert.equal((await service.removeCategory(adminId, child.id)).deleted, true);
      assert.equal((await service.removeCategory(adminId, parent.id)).deleted, true);
    } finally {
      await pool.end();
    }
  },
);

test(
  "approved seller manages only own PostgreSQL products and reserved stock cannot be removed",
  { skip: !databaseUrl },
  async () => {
    const {
      pool,
      service,
      suffix,
      adminId,
      sellerUserId,
      sellerId,
      otherSellerUserId,
    } = await fixture();
    try {
      const category = await service.createCategory(adminId, {
        name: "Seller Category",
        slug: `seller-category-${suffix}`,
      });
      const product = await service.createProduct(sellerUserId, {
        sellerId: "ignored-by-seller",
        categoryId: category.id,
        title: "Seller Phone",
        slug: `seller-phone-${suffix}`,
        brand: "Miran",
        basePriceIrr: 2_000_000,
        discountType: "FIXED_IRR",
        discountValue: 100_000,
        stockOnHand: 5,
        status: "DRAFT",
        highlights: ["Warranty"],
        specifications: [{ name: "Storage", value: "128GB" }],
      });
      assert.equal(product.sellerId, sellerId);
      assert.equal(product.pricing.finalIrr, 1_900_000);
      assert.equal(product.status, "DRAFT");

      await assert.rejects(
        () => service.setPublished(otherSellerUserId, product.id, true),
        (error) => error?.code === "FORBIDDEN",
      );
      assert.equal((await service.setPublished(sellerUserId, product.id, true)).status, "PUBLISHED");

      await pool.query(
        "UPDATE inventory SET stock_reserved=3 WHERE product_id=$1",
        [product.id],
      );
      await assert.rejects(
        () => service.setInventory(sellerUserId, product.id, 2),
        (error) => error?.code === "CONFLICT",
      );
      const updated = await service.setInventory(sellerUserId, product.id, 4);
      assert.equal(updated.stockOnHand, 4);
      assert.equal(updated.stockReserved, 3);

      const managed = await service.listManaged(sellerUserId);
      assert.ok(managed.some((item) => item.id === product.id));
      const otherManaged = await service.listManaged(otherSellerUserId);
      assert.ok(!otherManaged.some((item) => item.id === product.id));
    } finally {
      await pool.end();
    }
  },
);
