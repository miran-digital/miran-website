import { getRuntimeEnv } from "./runtime-env.ts";

export async function probeDatabaseHealth(databaseOverride?: D1Database) {
  const database = databaseOverride ?? await requireDatabase();
  const probe = await database.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  if (probe?.ok !== 1) throw new Error("DATABASE_UNAVAILABLE");
  return "ok" as const;
}

async function requireDatabase() {
  const bindings = await getRuntimeEnv<{ DB?: D1Database }>();
  if (!bindings.DB) throw new Error("DATABASE_UNAVAILABLE");
  return bindings.DB;
}
