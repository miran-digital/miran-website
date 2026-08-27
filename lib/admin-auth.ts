import { getChatGPTUser, type ChatGPTUser } from "@/app/chatgpt-auth";
import { getRuntimeEnv } from "@/lib/runtime-env";
import {
  normalizeAdminPermissions,
  type AdminPermission,
  type AdminRole,
} from "@/features/admin/admin-types";
import {
  hasOwnerPasswordSessionCookie,
  readOwnerPasswordSession,
} from "@/lib/admin-owner-session";

export type { AdminPermission } from "@/features/admin/admin-types";

const rolePermissions: Record<AdminRole, readonly AdminPermission[]> = {
  owner: [
    "state.read",
    "content.write",
    "content.delete",
    "catalog.write",
    "catalog.delete",
    "orders.write",
    "orders.delete",
    "sellers.write",
    "sellers.delete",
    "customers.read",
    "customers.delete",
    "support.write",
    "support.delete",
    "reviews.write",
    "reviews.delete",
    "reports.read",
    "security.write",
    "backup.read",
    "restore.write",
    "admins.write",
  ],
  catalog_manager: ["state.read", "catalog.write"],
  content_manager: ["state.read", "content.write", "reviews.write"],
  order_manager: ["state.read", "orders.write", "support.write", "reports.read"],
  seller_manager: ["state.read", "sellers.write"],
};

export type AdminAccess =
  | {
      allowed: true;
      user: ChatGPTUser;
      role: AdminRole;
      permissions: readonly AdminPermission[];
      authMethod: "chatgpt" | "owner_password";
    }
  | {
      allowed: false;
      reason: "anonymous" | "forbidden" | "misconfigured";
      user: ChatGPTUser | null;
    };

export async function getAdminAccess(
  requiredPermission?: AdminPermission,
): Promise<AdminAccess> {
  const [user, hasPasswordCookie] = await Promise.all([
    getChatGPTUser(),
    hasOwnerPasswordSessionCookie(),
  ]);
  if (!user && !hasPasswordCookie) {
    return { allowed: false, reason: "anonymous", user: null };
  }
  const configuredEmail = await readAdminEmail();
  const passwordSession = configuredEmail && hasPasswordCookie
    ? await readOwnerPasswordSession()
    : null;
  if (passwordSession?.ownerEmail === configuredEmail) {
    if (requiredPermission && !rolePermissions.owner.includes(requiredPermission)) {
      return { allowed: false, reason: "forbidden", user: null };
    }
    return {
      allowed: true,
      user: {
        displayName: "مالک MIRAN",
        email: configuredEmail,
        fullName: null,
      },
      role: "owner",
      permissions: rolePermissions.owner,
      authMethod: "owner_password",
    };
  }

  if (!user) return { allowed: false, reason: "anonymous", user: null };
  if (!configuredEmail) {
    return { allowed: false, reason: "misconfigured", user };
  }
  const email = user.email.trim().toLowerCase();
  const delegated = email === configuredEmail ? null : await readDelegatedAccess(email);
  const role: AdminRole | null = email === configuredEmail ? "owner" : delegated?.role ?? null;
  if (!role) {
    return { allowed: false, reason: "forbidden", user };
  }
  const permissions = role === "owner" ? rolePermissions.owner : delegated!.permissions;
  if (requiredPermission && !permissions.includes(requiredPermission)) {
    return { allowed: false, reason: "forbidden", user };
  }
  return { allowed: true, user, role, permissions, authMethod: "chatgpt" };
}

export function hasAdminPermission(
  access: AdminAccess,
  permission: AdminPermission,
) {
  return access.allowed && access.permissions.includes(permission);
}

export async function readAdminEmail() {
  const runtimeEmail = await getRuntimeEnv<{ ADMIN_EMAIL?: unknown }>()
    .then((runtime) => runtime.ADMIN_EMAIL)
    .catch(() => undefined);
  const value =
    typeof runtimeEmail === "string" ? runtimeEmail : process.env.ADMIN_EMAIL;
  return value?.trim().toLowerCase() ?? "";
}

async function readDelegatedAccess(email: string): Promise<{ role: AdminRole; permissions: readonly AdminPermission[] } | null> {
  try {
    const bindings = await getRuntimeEnv<{ DB?: D1Database }>();
    if (!bindings.DB) return null;
    const row = await bindings.DB
      .prepare("SELECT data FROM storefront_settings WHERE id = ? LIMIT 1")
      .bind("primary")
      .first<{ data: string }>();
    if (!row) return null;
    const stored = JSON.parse(row.data) as { adminUsers?: unknown };
    if (!Array.isArray(stored.adminUsers)) return null;
    const user = stored.adminUsers.find((item) => {
      if (typeof item !== "object" || item === null) return false;
      const candidate = item as Record<string, unknown>;
      return candidate.active === true &&
        typeof candidate.email === "string" &&
        candidate.email.trim().toLowerCase() === email;
    }) as Record<string, unknown> | undefined;
    const role = user?.role;
    const delegatedRole = role === "catalog_manager" ||
      role === "content_manager" ||
      role === "order_manager" ||
      role === "seller_manager"
      ? role
      : null;
    return delegatedRole
      ? { role: delegatedRole, permissions: normalizeAdminPermissions(user?.permissions, delegatedRole) }
      : null;
  } catch {
    return null;
  }
}
