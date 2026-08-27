import { getRuntimeEnv } from "./runtime-env.ts";

export type SupabaseAdminUser = {
  id: string;
  email: string;
  fullName: string;
  emailConfirmedAt: string;
  createdAt: string;
};

type AdminConfiguration = { url: string; secret: string };

export async function hasSupabaseAdminConfiguration() {
  return Boolean(await configuration());
}

export async function listSupabaseAdminUsers(): Promise<SupabaseAdminUser[] | null> {
  const config = await configuration();
  if (!config) return null;
  const response = await fetch(`${config.url}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: adminHeaders(config),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) throw new Error("SUPABASE_ADMIN_UNAVAILABLE");
  const payload = await response.json().catch(() => ({})) as {
    users?: Array<{
      id?: unknown;
      email?: unknown;
      email_confirmed_at?: unknown;
      created_at?: unknown;
      user_metadata?: { full_name?: unknown; name?: unknown };
    }>;
  };
  return (payload.users ?? []).flatMap((user) => {
    if (typeof user.id !== "string" || typeof user.email !== "string") return [];
    const rawName = user.user_metadata?.full_name ?? user.user_metadata?.name;
    return [{
      id: user.id,
      email: user.email.trim().toLowerCase(),
      fullName: typeof rawName === "string" ? rawName.trim().slice(0, 120) : "",
      emailConfirmedAt: typeof user.email_confirmed_at === "string" ? user.email_confirmed_at : "",
      createdAt: typeof user.created_at === "string" ? user.created_at : "",
    }];
  });
}

export async function deleteSupabaseAdminUser(emailAddress: string) {
  const config = await configuration();
  if (!config) throw new Error("SUPABASE_ADMIN_NOT_CONFIGURED");
  const email = emailAddress.trim().toLowerCase();
  const users = await listSupabaseAdminUsers();
  const user = users?.find((item) => item.email === email);
  if (!user) return { deleted: false as const, reason: "not-found" as const };
  const response = await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: "DELETE",
    headers: adminHeaders(config),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) throw new Error("SUPABASE_ADMIN_DELETE_FAILED");
  return { deleted: true as const, reason: "deleted" as const };
}

async function configuration(): Promise<AdminConfiguration | null> {
  let runtime: {
    SUPABASE_URL?: unknown;
    SUPABASE_SECRET_KEY?: unknown;
    SUPABASE_SERVICE_ROLE_KEY?: unknown;
  } = {};
  try {
    runtime = await getRuntimeEnv<typeof runtime>();
  } catch {
    // Local validation runs without Cloudflare bindings.
  }
  const rawUrl = typeof runtime.SUPABASE_URL === "string"
    ? runtime.SUPABASE_URL
    : process.env.SUPABASE_URL;
  const runtimeSecret = typeof runtime.SUPABASE_SECRET_KEY === "string"
    ? runtime.SUPABASE_SECRET_KEY
    : typeof runtime.SUPABASE_SERVICE_ROLE_KEY === "string"
      ? runtime.SUPABASE_SERVICE_ROLE_KEY
      : undefined;
  const secret = runtimeSecret ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = rawUrl?.replace(/\/$/, "");
  return url && secret ? { url, secret } : null;
}

function adminHeaders(config: AdminConfiguration) {
  return {
    apikey: config.secret,
    Authorization: `Bearer ${config.secret}`,
    "Content-Type": "application/json",
  };
}
