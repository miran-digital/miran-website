import assert from "node:assert/strict";
import test from "node:test";
import { migratePostgres, openPostgresPool } from "../postgres/database.js";
import { PostgresStorefrontCmsService } from "../postgres/storefront-cms-service.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

async function fixture() {
  if (!databaseUrl) throw new Error("POSTGRES_TEST_DATABASE_URL is required");
  const pool = openPostgresPool({
    connectionString: databaseUrl,
    max: 4,
    applicationName: "miran-postgres-cms-test",
  });
  await migratePostgres(pool);
  const suffix = Date.now().toString(36);
  const adminId = `admin-cms-${suffix}`;
  const customerId = `customer-cms-${suffix}`;
  await pool.query(
    `INSERT INTO users(id,email,password_salt,password_hash,role) VALUES
     ($1,$2,'s','h','ADMIN'),
     ($3,$4,'s','h','CUSTOMER')`,
    [
      adminId,
      `${adminId}@example.com`,
      customerId,
      `${customerId}@example.com`,
    ],
  );
  return {
    pool,
    service: new PostgresStorefrontCmsService(pool),
    suffix,
    adminId,
    customerId,
  };
}

test(
  "PostgreSQL CMS exposes only visible content active at the requested time",
  { skip: !databaseUrl },
  async () => {
    const { pool, service, suffix, adminId } = await fixture();
    try {
      const active = await service.createHeaderMessage(adminId, {
        text: `Active ${suffix}`,
        href: "/offers",
        backgroundColor: "#112233",
        textColor: "#ffffff",
        startsAt: "2026-08-15T00:00:00.000Z",
        endsAt: "2026-08-17T00:00:00.000Z",
        visible: true,
        sortOrder: 1,
      });
      await service.createHeaderMessage(adminId, {
        text: `Future ${suffix}`,
        href: "/future",
        startsAt: "2026-08-18T00:00:00.000Z",
        visible: true,
        sortOrder: 2,
      });
      await service.createHeaderMessage(adminId, {
        text: `Hidden ${suffix}`,
        visible: false,
        sortOrder: 3,
      });

      const hero = await service.createBanner(adminId, {
        title: `Hero ${suffix}`,
        href: "/offers",
        imageUrl: `https://media.almiran.ir/public/banners/${suffix}/hero.webp`,
        placement: "HERO",
        startsAt: "2026-08-15T00:00:00.000Z",
        endsAt: "2026-08-17T00:00:00.000Z",
        visible: true,
        sortOrder: 5,
      });
      await service.createBanner(adminId, {
        title: `Expired ${suffix}`,
        href: "/old",
        imageUrl: `https://media.almiran.ir/public/banners/${suffix}/old.webp`,
        placement: "SMALL",
        endsAt: "2026-08-15T00:00:00.000Z",
        visible: true,
      });

      const publicCms = await service.getPublic(new Date("2026-08-16T00:00:00.000Z"));
      assert.ok(publicCms.headerMessages.some((item) => item.id === active.id));
      assert.ok(!publicCms.headerMessages.some((item) => item.text === `Future ${suffix}`));
      assert.ok(!publicCms.headerMessages.some((item) => item.text === `Hidden ${suffix}`));
      assert.ok(publicCms.banners.some((item) => item.id === hero.id));
      assert.ok(!publicCms.banners.some((item) => item.title === `Expired ${suffix}`));
      assert.equal(
        publicCms.headerMessages.find((item) => item.id === active.id)?.backgroundColor,
        "#112233",
      );
    } finally {
      await pool.end();
    }
  },
);

test(
  "PostgreSQL CMS requires ADMIN and supports safe update/delete/section control",
  { skip: !databaseUrl },
  async () => {
    const { pool, service, suffix, adminId, customerId } = await fixture();
    try {
      await assert.rejects(
        () => service.getManaged(customerId),
        (error) => error?.code === "FORBIDDEN",
      );
      const message = await service.createHeaderMessage(adminId, {
        text: `Editable ${suffix}`,
        href: "/one",
      });
      const updated = await service.updateHeaderMessage(adminId, message.id, {
        text: `Updated ${suffix}`,
        href: "/two",
        backgroundColor: "#abcdef",
        textColor: "#123456",
        visible: false,
        sortOrder: 99,
      });
      assert.equal(updated.text, `Updated ${suffix}`);
      assert.equal(updated.visible, false);
      assert.equal(updated.sortOrder, 99);

      const section = await service.updateSection(adminId, "brands", {
        visible: false,
        sortOrder: 999,
      });
      assert.equal(section.visible, false);
      assert.equal(section.sortOrder, 999);

      assert.deepEqual(await service.deleteHeaderMessage(adminId, message.id), {
        deleted: true,
        id: message.id,
      });
      await assert.rejects(
        () => service.updateHeaderMessage(adminId, message.id, { text: "gone" }),
        (error) => error?.code === "NOT_FOUND",
      );
    } finally {
      await pool.end();
    }
  },
);
