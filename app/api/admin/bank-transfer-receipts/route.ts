import {
  listBankTransferReceipts,
  reviewBankTransferReceipt,
} from "@/db/bank-transfer-repository";
import { getAdminAccess } from "@/lib/admin-auth";
import { rejectCrossSiteMutation } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAdminAccess("orders.write");
  if (!access.allowed) return denied(access.reason);
  try {
    return Response.json(
      { receipts: await listBankTransferReceipts() },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch {
    return Response.json({ error: "خواندن فیش‌ها ممکن نشد." }, { status: 503 });
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
    reviewNote?: unknown;
  } | null;
  const id = typeof payload?.id === "string" ? payload.id.slice(0, 120) : "";
  const status = payload?.status === "approved" || payload?.status === "rejected"
    ? payload.status
    : null;
  const reviewNote = typeof payload?.reviewNote === "string"
    ? payload.reviewNote.trim().slice(0, 500)
    : "";
  if (!isUuid(id) || !status) {
    return Response.json({ error: "درخواست معتبر نیست." }, { status: 422 });
  }
  try {
    const receipt = await reviewBankTransferReceipt({
      id,
      status,
      actorEmail: access.user.email,
      reviewNote,
    });
    return Response.json({ receipt });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const statusCode = code === "RECEIPT_NOT_FOUND"
      ? 404
      : /ALREADY_REVIEWED|NOT_PAYABLE/.test(code)
        ? 409
        : 503;
    const message = code === "ORDER_NOT_PAYABLE"
      ? "سفارش منقضی، لغو یا قبلاً پرداخت شده است و فیش قابل تأیید نیست."
      : code === "RECEIPT_ALREADY_REVIEWED"
        ? "این فیش قبلاً بررسی شده است."
        : statusCode === 404
          ? "فیش پیدا نشد."
          : "بررسی فیش ممکن نشد.";
    return Response.json({ error: message }, { status: statusCode });
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function denied(reason: "anonymous" | "forbidden" | "misconfigured") {
  return Response.json(
    { error: "دسترسی مدیریت مجاز نیست." },
    { status: reason === "anonymous" ? 401 : 403 },
  );
}
