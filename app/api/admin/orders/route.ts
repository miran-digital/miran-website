import {
  deleteOrderRecord,
  getOrderReceiptStorageKeys,
  listOrders,
  updateOrderStatus,
} from "@/db/order-repository";
import type { OrderStatus } from "@/features/orders/order-types";
import { getAdminAccess } from "@/lib/admin-auth";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

const statuses = new Set<OrderStatus>([
  "new",
  "confirmed",
  "packing",
  "shipped",
  "cancelled",
]);

export async function GET() {
  const access = await getAdminAccess("orders.write");
  if (!access.allowed) return denied(access.reason);
  try {
    return Response.json(
      { orders: await listOrders() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "خواندن سفارش‌ها ممکن نشد." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const access = await getAdminAccess("orders.write");
  if (!access.allowed) return denied(access.reason);
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const payload = (await request.json().catch(() => null)) as {
    id?: unknown;
    status?: unknown;
  } | null;
  const id = typeof payload?.id === "string" ? payload.id.slice(0, 120) : "";
  const status = payload?.status as OrderStatus;
  if (!id || !statuses.has(status)) {
    return Response.json({ error: "درخواست نامعتبر است." }, { status: 422 });
  }
  try {
    return Response.json({
      order: await updateOrderStatus(id, status, access.user.email),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const statusCode = /NOT_FOUND/.test(message) ? 404 : /INVALID_TRANSITION/.test(message) ? 409 : 503;
    return Response.json(
      { error: statusCode === 409 ? "این تغییر وضعیت مجاز نیست." : "به‌روزرسانی سفارش ممکن نشد." },
      { status: statusCode },
    );
  }
}

export async function DELETE(request: Request) {
  const access = await getAdminAccess("orders.delete");
  if (!access.allowed) return denied(access.reason);
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 2_048) {
    return Response.json({ error: "درخواست بیش از حد مجاز است." }, { status: 413 });
  }
  const payload = await request.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof payload?.id === "string" ? payload.id.trim().slice(0, 120) : "";
  if (!id) return Response.json({ error: "سفارش انتخاب نشده است." }, { status: 422 });
  try {
    const storageKeys = await getOrderReceiptStorageKeys(id);
    const deleted = await deleteOrderRecord(id, access.user.email);
    let fileCleanupPending = false;
    if (storageKeys.length > 0) {
      const { BUCKET: bucket } = await getRuntimeEnv<{ BUCKET?: R2Bucket }>().catch(() => ({ BUCKET: undefined }));
      if (!bucket) {
        fileCleanupPending = true;
      } else {
        const results = await Promise.allSettled(storageKeys.map((key) => bucket.delete(key)));
        fileCleanupPending = results.some((result) => result.status === "rejected");
      }
    }
    return Response.json({ ...deleted, fileCleanupPending }, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return Response.json(
      { error: code === "ORDER_NOT_FOUND" ? "سفارش پیدا نشد." : "حذف سفارش ممکن نشد." },
      { status: code === "ORDER_NOT_FOUND" ? 404 : 503 },
    );
  }
}

function denied(reason: "anonymous" | "forbidden" | "misconfigured") {
  return Response.json(
    { error: "دسترسی مدیریت مجاز نیست." },
    { status: reason === "anonymous" ? 401 : 403 },
  );
}
