import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { migratePostgres, openPostgresPool } from "../postgres/database.js";
import { PostgresLogisticsService } from "../postgres/logistics-service.js";
import { PostgresMarketplaceService } from "../postgres/marketplace-service.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

async function fixture() {
  if (!databaseUrl) throw new Error("POSTGRES_TEST_DATABASE_URL is required");
  const pool = openPostgresPool({ connectionString: databaseUrl, max: 5, applicationName: "miran-logistics-test" });
  await migratePostgres(pool);
  const marketplace = new PostgresMarketplaceService(pool);
  const logistics = new PostgresLogisticsService(pool);
  const suffix = randomUUID().replaceAll("-", "");
  const customer = await marketplace.register({
    email: `ship-customer-${suffix}@example.com`,
    password: "very-secure-pass-123",
  });
  const admin = await marketplace.register({
    email: `ship-admin-${suffix}@example.com`,
    password: "very-secure-pass-123",
  });
  await pool.query("UPDATE users SET role='ADMIN' WHERE id=$1", [admin.id]);
  const address = await marketplace.addAddress(customer.id, {
    fullName: "Shipping Buyer",
    phone: "09120000000",
    province: "Tehran",
    city: "Tehran",
    addressLine: "Shipping street",
    postalCode: "1234567890",
    isDefault: true,
  });
  return { pool, marketplace, logistics, customer, admin, address, suffix };
}

test(
  "PostgreSQL shipping methods are admin-managed and free threshold is calculated server-side",
  { skip: !databaseUrl },
  async () => {
    const value = await fixture();
    try {
      await assert.rejects(
        () => value.logistics.create(value.customer.id, {
          code: `STANDARD_${value.suffix.slice(0, 8)}`,
          name: "Standard",
          priceIrr: 500_000,
        }),
        /Admin role required/,
      );

      const method = await value.logistics.create(value.admin.id, {
        code: `STANDARD_${value.suffix.slice(0, 8)}`,
        name: "ارسال استاندارد",
        description: "ارسال قابل رهگیری",
        priceIrr: 500_000,
        freeOverIrr: 10_000_000,
        minDeliveryDays: 2,
        maxDeliveryDays: 5,
        active: true,
      });
      assert.equal(method.priceIrr, 500_000);

      const paidShipping = await value.logistics.listAvailable(value.customer.id, value.address.id, {
        merchandiseTotalIrr: 9_000_000,
      });
      assert.equal(paidShipping[0].appliedPriceIrr, 500_000);

      const freeShipping = await value.logistics.listAvailable(value.customer.id, value.address.id, {
        merchandiseTotalIrr: 10_000_000,
      });
      assert.equal(freeShipping[0].appliedPriceIrr, 0);
      assert.equal(freeShipping[0].minDeliveryDays, 2);
      assert.equal(freeShipping[0].maxDeliveryDays, 5);
    } finally {
      await value.pool.end();
    }
  },
);

test(
  "PostgreSQL shipping quote rejects an address owned by another user",
  { skip: !databaseUrl },
  async () => {
    const value = await fixture();
    try {
      await value.logistics.create(value.admin.id, {
        code: `OWNED_${value.suffix.slice(0, 8)}`,
        name: "Owned address method",
        priceIrr: 100_000,
      });
      const other = await value.marketplace.register({
        email: `ship-other-${value.suffix}@example.com`,
        password: "very-secure-pass-123",
      });
      await assert.rejects(
        () => value.logistics.listAvailable(other.id, value.address.id, { merchandiseTotalIrr: 1_000_000 }),
        /Address not found/,
      );
    } finally {
      await value.pool.end();
    }
  },
);
