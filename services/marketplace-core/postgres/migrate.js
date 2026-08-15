import { checkPostgresHealth, migratePostgres, openPostgresPool } from "./database.js";

const pool = openPostgresPool();
try {
  await migratePostgres(pool);
  const health = await checkPostgresHealth(pool);
  console.log("PostgreSQL migrations complete", {
    database: health.database_name,
    serverVersion: health.server_version_num,
  });
} catch (error) {
  console.error("PostgreSQL migration failed", {
    name: error?.name,
    code: error?.code,
    message: error?.message,
  });
  process.exitCode = 1;
} finally {
  await pool.end();
}
