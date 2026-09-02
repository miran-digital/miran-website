import { getRuntimeEnv } from "../lib/runtime-env.ts";

export type RateLimitScope =
  | "address.mutate"
  | "admin.login"
  | "admin.upload"
  | "admin.payment-config"
  | "auth.login"
  | "auth.signup"
  | "auth.verification"
  | "auth.password-reset"
  | "auth.refresh"
  | "bank-transfer.receipt"
  | "order.create"
  | "payment.create"
  | "review.create"
  | "seller.apply";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export async function consumeRateLimit(
  input: {
    scope: RateLimitScope;
    identity: string;
    limit: number;
    windowSeconds: number;
    now?: number;
  },
  databaseOverride?: D1Database,
): Promise<RateLimitResult> {
  const database = databaseOverride ?? await requireDatabase();
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1_000);
  const windowSeconds = Math.max(60, Math.min(86_400, Math.floor(input.windowSeconds)));
  const limit = Math.max(1, Math.min(10_000, Math.floor(input.limit)));
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const identityHash = await hashIdentity(input.identity);
  const id = `${input.scope}:${identityHash}:${windowStart}`;

  await database
    .prepare("DELETE FROM request_rate_limits WHERE window_start < ?")
    .bind(windowStart - 172_800)
    .run();

  const row = await database
    .prepare(
      `INSERT INTO request_rate_limits (
         id, scope, identity_hash, window_start, hit_count, blocked_count,
         limit_value, updated_at
       ) VALUES (?, ?, ?, ?, 1, 0, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         hit_count = request_rate_limits.hit_count + 1,
         blocked_count = request_rate_limits.blocked_count +
           CASE WHEN request_rate_limits.hit_count + 1 > excluded.limit_value
                THEN 1 ELSE 0 END,
         limit_value = excluded.limit_value,
         updated_at = CURRENT_TIMESTAMP
       RETURNING hit_count, blocked_count`,
    )
    .bind(id, input.scope, identityHash, windowStart, limit)
    .first<{ hit_count: number; blocked_count: number }>();
  const hitCount = Number(row?.hit_count ?? limit + 1);
  return {
    allowed: hitCount <= limit,
    remaining: Math.max(0, limit - hitCount),
    retryAfterSeconds: Math.max(1, windowStart + windowSeconds - nowSeconds),
  };
}

async function hashIdentity(identity: string) {
  const normalized = identity.trim().toLowerCase().slice(0, 500) || "unknown";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`miran-rate-limit:${normalized}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function requireDatabase() {
  const bindings = await getRuntimeEnv<{ DB?: D1Database }>();
  if (!bindings.DB) throw new Error("DATABASE_UNAVAILABLE");
  return bindings.DB;
}
