import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(here, "migrations");
const migrationLockId = 738421906;

function positiveInteger(value, fallback, { min = 1, max = 100 } = {}) {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number) || number < min || number > max) return fallback;
  return number;
}

function hasDiscretePostgresConfig() {
  return Boolean(
    process.env.PGHOST &&
      process.env.PGUSER &&
      process.env.PGDATABASE,
  );
}

export function openPostgresPool({
  connectionString = process.env.DATABASE_URL,
  max = positiveInteger(process.env.DATABASE_POOL_MAX, 10, { max: 50 }),
  idleTimeoutMillis = positiveInteger(process.env.DATABASE_IDLE_TIMEOUT_MS, 30_000, { max: 600_000 }),
  connectionTimeoutMillis = positiveInteger(process.env.DATABASE_CONNECTION_TIMEOUT_MS, 5_000, { max: 60_000 }),
  applicationName = process.env.DATABASE_APPLICATION_NAME || "miran-marketplace-core",
} = {}) {
  if (!connectionString && !hasDiscretePostgresConfig()) {
    const error = new Error(
      "PostgreSQL connection is not configured. Set DATABASE_URL or PGHOST/PGUSER/PGDATABASE.",
    );
    error.code = "DATABASE_NOT_CONFIGURED";
    throw error;
  }

  const poolOptions = {
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    application_name: applicationName,
  };

  if (connectionString) {
    poolOptions.connectionString = connectionString;
  }

  const pool = new Pool(poolOptions);

  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL idle-client error", {
      name: error?.name,
      code: error?.code,
      message: error?.message,
    });
  });
  return pool;
}

export async function withPostgresTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("PostgreSQL rollback failed", {
        name: rollbackError?.name,
        code: rollbackError?.code,
        message: rollbackError?.message,
      });
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function migratePostgres(pool) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [migrationLockId]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const files = readdirSync(migrationsDir)
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort((left, right) => left.localeCompare(right, "en"));

    for (const version of files) {
      const existing = await client.query(
        "SELECT version FROM schema_migrations WHERE version = $1",
        [version],
      );
      if (existing.rowCount) continue;

      const sql = readFileSync(resolve(migrationsDir, version), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(version) VALUES ($1)",
          [version],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [migrationLockId]);
    } finally {
      client.release();
    }
  }
}

export async function checkPostgresHealth(pool) {
  const result = await pool.query(
    "SELECT current_database() AS database_name, current_setting('server_version_num')::int AS server_version_num",
  );
  return result.rows[0];
}
