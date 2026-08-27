import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { customerCookieNames } from "@/lib/customer-session";
export {
  clearCustomerSessionCookies,
  customerCookieNames,
  customerCookieOptions,
  isCustomerAccessTokenExpired,
  setCustomerSessionCookies,
} from "@/lib/customer-session";

type SupabaseUser = { id: string; email?: string; user_metadata?: { full_name?: string; name?: string } };

export type CustomerUser = { id: string; email: string; fullName: string | null; provider: "supabase" | "chatgpt" };

async function configuration() {
  let runtime: { SUPABASE_URL?: unknown; SUPABASE_PUBLISHABLE_KEY?: unknown } = {};
  try { runtime = await getRuntimeEnv<typeof runtime>(); } catch { /* Node test runtime has no Cloudflare bindings. */ }
  const rawUrl = typeof runtime.SUPABASE_URL === "string" ? runtime.SUPABASE_URL : process.env.SUPABASE_URL;
  const rawKey = typeof runtime.SUPABASE_PUBLISHABLE_KEY === "string" ? runtime.SUPABASE_PUBLISHABLE_KEY : process.env.SUPABASE_PUBLISHABLE_KEY;
  const url = rawUrl?.replace(/\/$/, "");
  const key = rawKey;
  return url && key ? { url, key } : null;
}

export async function getCustomerUser(): Promise<CustomerUser | null> {
  const config = await configuration();
  if (config) {
    const accessToken = (await cookies()).get(customerCookieNames.access)?.value;
    if (accessToken) {
      const response = await fetch(`${config.url}/auth/v1/user`, {
        headers: { apikey: config.key, Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }).catch(() => null);
      if (response?.ok) {
        const user = (await response.json()) as SupabaseUser;
        if (user.email) return {
          id: user.id,
          email: user.email.trim().toLowerCase(),
          fullName: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
          provider: "supabase",
        };
      }
    }
  }
  const legacy = await getChatGPTUser();
  return legacy ? {
    id: `chatgpt:${legacy.email.toLowerCase()}`,
    email: legacy.email.toLowerCase(),
    fullName: legacy.fullName,
    provider: "chatgpt",
  } : null;
}

export async function requireCustomerUser(returnTo: string) {
  const user = await getCustomerUser();
  if (user) return user;
  const safe = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/account";
  redirect(`/account?next=${encodeURIComponent(safe)}`);
}

export async function getSupabaseConfiguration() { return configuration(); }
