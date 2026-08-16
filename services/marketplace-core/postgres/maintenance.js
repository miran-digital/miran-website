import { migratePostgres, openPostgresPool } from "./database.js";
import { PostgresMarketplaceService } from "./marketplace-service.js";
import { runPostgresMaintenance } from "./maintenance-service.js";

function intervalMs() {
  const value = Number(process.env.MIRAN_MAINTENANCE_INTERVAL_MS || 60_000);
  if (!Number.isSafeInteger(value) || value < 10_000 || value > 3_600_000) {
    throw new Error("MIRAN_MAINTENANCE_INTERVAL_MS must be between 10000 and 3600000");
  }
  return value;
}

const pool = openPostgresPool({ applicationName: "miran-marketplace-maintenance" });
const marketplace = new PostgresMarketplaceService(pool);
await migratePostgres(pool);

let stopping = false;
let running = false;

async function tick() {
  if (stopping || running) return;
  running = true;
  try {
    const result = await runPostgresMaintenance(pool, marketplace, new Date());
    if (result.releasedReservations || result.expiredSessions) {
      console.log("marketplace maintenance completed", result);
    }
  } catch (error) {
    console.error("marketplace maintenance failed", {
      name: error?.name,
      code: error?.code,
      message: error?.message,
    });
  } finally {
    running = false;
  }
}

await tick();
const timer = setInterval(() => void tick(), intervalMs());
timer.unref();

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  while (running) await new Promise((resolve) => setTimeout(resolve, 50));
  await pool.end();
  console.log(`marketplace maintenance stopped after ${signal}`);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

await new Promise(() => {});
