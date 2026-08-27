import {
  deleteAdminSupportTicket,
  listAdminSupportTickets,
  updateAdminSupportTicket,
} from "@/db/customer-care-repository";
import type { SupportTicketStatus } from "@/features/customer-care/customer-care-types";
import { getAdminAccess } from "@/lib/admin-auth";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import {
  isInvalidJson,
  isJsonTooLarge,
  isUuid,
  objectText,
  privateJson,
  readBoundedJson,
} from "@/lib/request-json";

export const dynamic = "force-dynamic";
const statuses = new Set<SupportTicketStatus>(["open", "in_progress", "waiting_customer", "resolved", "closed"]);

export async function GET() {
  const access = await getAdminAccess("support.write");
  if (!access.allowed) return denied(access.reason);
  try {
    return privateJson({ tickets: await listAdminSupportTickets() });
  } catch {
    return privateJson({ error: "خواندن تیکت‌ها ممکن نشد." }, 503);
  }
}

export async function PATCH(request: Request) {
  const access = await getAdminAccess("support.write");
  if (!access.allowed) return denied(access.reason);
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const payload = await readBoundedJson(request);
  if (isJsonTooLarge(payload)) return privateJson({ error: "حجم درخواست بیش از حد مجاز است." }, 413);
  if (isInvalidJson(payload)) return privateJson({ error: "درخواست معتبر نیست." }, 400);
  const id = objectText(payload, "id", 120);
  const status = objectText(payload, "status", 30) as SupportTicketStatus;
  const reply = objectText(payload, "reply", 3_000);
  if (!isUuid(id) || !statuses.has(status)) return privateJson({ error: "درخواست نامعتبر است." }, 422);
  try {
    return privateJson({ ticket: await updateAdminSupportTicket({ ticketId: id, status, reply, actorEmail: access.user.email }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SUPPORT_NOT_FOUND") return privateJson({ error: "تیکت پیدا نشد." }, 404);
    if (message === "SUPPORT_INVALID_TRANSITION" || message === "SUPPORT_NO_CHANGES") return privateJson({ error: "این تغییر وضعیت مجاز نیست یا تغییری وارد نشده است." }, 409);
    return privateJson({ error: "به‌روزرسانی تیکت ممکن نشد." }, 503);
  }
}

export async function DELETE(request: Request) {
  const access = await getAdminAccess("support.delete");
  if (!access.allowed) return denied(access.reason);
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const payload = await readBoundedJson(request, 2_048);
  if (isJsonTooLarge(payload)) return privateJson({ error: "حجم درخواست بیش از حد مجاز است." }, 413);
  if (isInvalidJson(payload)) return privateJson({ error: "درخواست معتبر نیست." }, 400);
  const id = objectText(payload, "id", 120);
  if (!isUuid(id)) return privateJson({ error: "تیکت معتبر نیست." }, 422);
  try {
    return privateJson(await deleteAdminSupportTicket(id, access.user.email));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return privateJson(
      { error: code === "SUPPORT_NOT_FOUND" ? "تیکت پیدا نشد." : "حذف تیکت ممکن نشد." },
      code === "SUPPORT_NOT_FOUND" ? 404 : 503,
    );
  }
}

function denied(reason: "anonymous" | "forbidden" | "misconfigured") {
  return privateJson({ error: "دسترسی مدیریت مجاز نیست." }, reason === "anonymous" ? 401 : 403);
}
