import {
  deleteCustomerStoreData,
  getCustomerDeletionBlockers,
  listAdminCustomers,
  listCustomerReceiptStorageKeys,
} from "@/db/customer-account-repository";
import { getAdminAccess } from "@/lib/admin-auth";
import {
  loadAdminCustomerDirectory,
} from "@/lib/admin-customer-directory";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import {
  deleteSupabaseAdminUser,
  listSupabaseAdminUsers,
} from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAdminAccess("customers.read");
  if (!access.allowed) return denied(access.reason);
  const result = await loadAdminCustomerDirectory({
    listStoreCustomers: () => listAdminCustomers(),
    listAuthUsers: () => listSupabaseAdminUsers(),
    logFailure: logCustomerDirectoryFailure,
  });
  if (!result.ok) {
    return privateJson({ error: "خواندن فهرست مشتریان ممکن نشد." }, 503);
  }
  return privateJson(result.payload);
}

function logCustomerDirectoryFailure(stage: "d1" | "supabase", code: string) {
  console.error("admin_customer_directory_read_failed", { stage, code });
}

export async function DELETE(request: Request) {
  const access = await getAdminAccess("customers.delete");
  if (!access.allowed) return denied(access.reason);
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 2_048) {
    return privateJson({ error: "درخواست بیش از حد مجاز است." }, 413);
  }
  const payload = await request.json().catch(() => null) as {
    email?: unknown;
    deleteAuth?: unknown;
  } | null;
  const email = typeof payload?.email === "string"
    ? payload.email.trim().toLowerCase().slice(0, 200)
    : "";
  const deleteAuth = payload?.deleteAuth === true;
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return privateJson({ error: "ایمیل مشتری معتبر نیست." }, 422);
  }
  try {
    const blockers = await getCustomerDeletionBlockers(email);
    if (blockers.orderCount > 0) {
      return privateJson({
        error: `این مشتری ${blockers.orderCount.toLocaleString("fa-IR")} سفارش دارد؛ ابتدا سفارش‌های او را از بخش سفارش‌ها حذف کنید.`,
        code: "CUSTOMER_HAS_ORDERS",
      }, 409);
    }
    if (deleteAuth) await deleteSupabaseAdminUser(email);
    const storageKeys = await listCustomerReceiptStorageKeys(email);
    if (storageKeys.length > 0) {
      const { BUCKET: bucket } = await getRuntimeEnv<{ BUCKET?: R2Bucket }>();
      if (!bucket) return privateJson({ error: "فضای فایل‌های خصوصی در دسترس نیست؛ حذف انجام نشد." }, 503);
      await Promise.all(storageKeys.map((key) => bucket.delete(key)));
    }
    await deleteCustomerStoreData(email, access.user.email);
    return privateJson({ deleted: true, authDeleted: deleteAuth });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "SUPABASE_ADMIN_NOT_CONFIGURED") {
      return privateJson({
        error: "حذف حساب ورود هنوز به دسترسی مدیریتی Supabase متصل نیست. ابتدا حساب را از پیوند امن Supabase حذف کنید، سپس پاک‌سازی اطلاعات فروشگاه را بزنید.",
        code,
      }, 409);
    }
    if (code === "CUSTOMER_NOT_FOUND") return privateJson({ error: "مشتری پیدا نشد." }, 404);
    if (code === "CUSTOMER_HAS_ORDERS") return privateJson({ error: "ابتدا سفارش‌های مشتری را حذف کنید." }, 409);
    return privateJson({ error: "حذف اطلاعات مشتری ممکن نشد." }, 503);
  }
}

function denied(reason: "anonymous" | "forbidden" | "misconfigured") {
  return privateJson({ error: "دسترسی مدیریت مجاز نیست." }, reason === "anonymous" ? 401 : 403);
}

function privateJson(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}
