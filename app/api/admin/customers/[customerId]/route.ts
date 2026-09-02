import { readAdminCustomerProfile } from "@/db/admin-customer-directory-repository";
import { getAdminAccess } from "@/lib/admin-auth";
import { safeCustomerDirectoryErrorCode } from "@/lib/admin-customer-directory";
import { listSupabaseAdminUsers } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ customerId: string }> }) {
  const access = await getAdminAccess("customers.read");
  if (!access.allowed) return privateJson({ error: "دسترسی مدیریت مجاز نیست." }, access.reason === "anonymous" ? 401 : 403);
  const { customerId } = await context.params;
  if (!customerId || customerId.length > 180) return privateJson({ error: "شناسه مشتری معتبر نیست." }, 422);
  const params = new URL(request.url).searchParams;
  try {
    const authUsers = await listSupabaseAdminUsers().catch((error: unknown) => {
      console.error("admin_customer_profile_auth_sync_failed", { code: safeCustomerDirectoryErrorCode(error) });
      return null;
    });
    const profile = await readAdminCustomerProfile(customerId, {
      ordersPage: Number(params.get("ordersPage") ?? 1),
      activityPage: Number(params.get("activityPage") ?? 1),
    }, authUsers ?? []);
    if (!profile) return privateJson({ error: "مشتری پیدا نشد." }, 404);
    return privateJson({ profile });
  } catch (error) {
    console.error("admin_customer_profile_read_failed", { code: safeCustomerDirectoryErrorCode(error) });
    return privateJson({ error: "خواندن پرونده مشتری ممکن نشد." }, 503);
  }
}

function privateJson(body: object, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}
