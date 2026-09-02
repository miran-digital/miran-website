import type { AdminCustomerSummary } from "../db/customer-account-repository.ts";
import type { SupabaseAdminUser } from "./supabase-admin.ts";
import type { CustomerDirectoryOptions, CustomerDirectoryPage, CustomerSort } from "../features/admin/customer-directory-types.ts";

export const CUSTOMER_DIRECTORY_FALLBACK_WARNING =
  "همگام‌سازی حساب‌های ورود در دسترس نیست؛ اطلاعات ثبت‌شده فروشگاه نمایش داده می‌شود.";

export function parseCustomerDirectoryOptions(params: URLSearchParams): CustomerDirectoryOptions {
  const sort = params.get("sort") ?? "newest";
  const sorts: CustomerSort[] = ["newest", "oldest", "name", "orders", "activity"];
  const page = Number(params.get("page") ?? 1);
  return {
    query: (params.get("q") ?? "").trim().slice(0, 120),
    sort: sorts.includes(sort as CustomerSort) ? sort as CustomerSort : "newest",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: params.get("pageSize") === "50" ? 50 : 25,
  };
}

export async function loadAdminCustomerDirectoryPage(dependencies: {
  queryCustomers: (authUsers: SupabaseAdminUser[]) => Promise<CustomerDirectoryPage>;
  listAuthUsers: () => Promise<SupabaseAdminUser[] | null>;
  logFailure: CustomerDirectoryDependencies["logFailure"];
}) {
  let authUsers: SupabaseAdminUser[] | null = null;
  try {
    authUsers = await dependencies.listAuthUsers();
  } catch (error) {
    dependencies.logFailure("supabase", safeCustomerDirectoryErrorCode(error));
  }
  try {
    const page = await dependencies.queryCustomers(authUsers ?? []);
    return { ok: true as const, payload: { ...page, supabaseAdminReady: authUsers !== null,
      ...(authUsers === null ? { warning: CUSTOMER_DIRECTORY_FALLBACK_WARNING } : {}),
    } };
  } catch (error) {
    dependencies.logFailure("d1", safeCustomerDirectoryErrorCode(error));
    return { ok: false as const };
  }
}

export type CustomerDirectoryDependencies = {
  listStoreCustomers: () => Promise<AdminCustomerSummary[]>;
  listAuthUsers: () => Promise<SupabaseAdminUser[] | null>;
  logFailure: (stage: "d1" | "supabase", code: string) => void;
};

export async function loadAdminCustomerDirectory(
  dependencies: CustomerDirectoryDependencies,
) {
  let storeCustomers: AdminCustomerSummary[];
  try {
    storeCustomers = await dependencies.listStoreCustomers();
  } catch (error) {
    dependencies.logFailure("d1", safeCustomerDirectoryErrorCode(error));
    return { ok: false as const };
  }

  try {
    const authUsers = await dependencies.listAuthUsers();
    if (!authUsers) return fallbackResult(storeCustomers);
    return {
      ok: true as const,
      payload: {
        customers: mergeAdminCustomerDirectory(storeCustomers, authUsers),
        supabaseAdminReady: true,
      },
    };
  } catch (error) {
    dependencies.logFailure("supabase", safeCustomerDirectoryErrorCode(error));
    return fallbackResult(storeCustomers);
  }
}

export function mergeAdminCustomerDirectory(
  storeCustomers: readonly AdminCustomerSummary[],
  authUsers: readonly SupabaseAdminUser[],
) {
  const byEmail = new Map<string, AdminCustomerSummary>(
    storeCustomers.map((customer) => [customer.email.trim().toLowerCase(), { ...customer }]),
  );
  for (const user of authUsers) {
    const email = user.email.trim().toLowerCase();
    if (!email) continue;
    const existing = byEmail.get(email);
    byEmail.set(email, {
      email,
      fullName: user.fullName || existing?.fullName || "",
      authUserId: user.id,
      provider: "supabase",
      emailConfirmedAt: user.emailConfirmedAt,
      registeredAt: user.createdAt || existing?.registeredAt || "",
      lastSeenAt: existing?.lastSeenAt || user.createdAt,
      orderCount: existing?.orderCount ?? 0,
      addressCount: existing?.addressCount ?? 0,
      ticketCount: existing?.ticketCount ?? 0,
      reviewCount: existing?.reviewCount ?? 0,
    });
  }
  return [...byEmail.values()].sort((left, right) => {
    const leftActivity = left.lastSeenAt || left.registeredAt;
    const rightActivity = right.lastSeenAt || right.registeredAt;
    return rightActivity.localeCompare(leftActivity) || left.email.localeCompare(right.email);
  });
}

export function safeCustomerDirectoryErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.match(/\b(?:D1|SUPABASE_ADMIN)_[A-Z0-9_]{2,80}\b/)?.[0]
    ?? "UNKNOWN_READ_FAILURE";
}

function fallbackResult(customers: AdminCustomerSummary[]) {
  return {
    ok: true as const,
    payload: {
      customers,
      supabaseAdminReady: false,
      warning: CUSTOMER_DIRECTORY_FALLBACK_WARNING,
    },
  };
}
