import assert from "node:assert/strict";
import test from "node:test";
import { checkPostgresHealth, openPostgresPool } from "../postgres/database.js";

const databaseUrl = process.env.POSTGRES_TEST_DATABASE_URL;

test(
  "PostgreSQL pool can use PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE without DATABASE_URL",
  { skip: !databaseUrl },
  async () => {
    const parsed = new URL(databaseUrl);
    const names = ["DATABASE_URL", "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"];
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    delete process.env.DATABASE_URL;
    process.env.PGHOST = parsed.hostname;
    process.env.PGPORT = parsed.port || "5432";
    process.env.PGUSER = decodeURIComponent(parsed.username);
    process.env.PGPASSWORD = decodeURIComponent(parsed.password);
    process.env.PGDATABASE = parsed.pathname.replace(/^\//, "");

    const pool = openPostgresPool({ applicationName: "miran-postgres-env-test" });
    try {
      const health = await checkPostgresHealth(pool);
      assert.equal(health.database_name, "miran_test");
    } finally {
      await pool.end();
      for (const name of names) {
        const value = previous[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  },
);
