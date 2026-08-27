import { getCustomerUser } from "@/lib/customer-auth";
import {
  listCustomerNotifications,
  markCustomerNotificationsRead,
} from "@/db/customer-care-repository";
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

export async function GET() {
  const user = await getCustomerUser();
  if (!user) return unauthorized();
  try {
    return privateJson({ notifications: await listCustomerNotifications(user.email) });
  } catch {
    return unavailable();
  }
}

export async function PATCH(request: Request) {
  const user = await getCustomerUser();
  if (!user) return unauthorized();
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const payload = await readBoundedJson(request, 4_096);
  if (isJsonTooLarge(payload)) return privateJson({ error: "حجم درخواست بیش از حد مجاز است." }, 413);
  if (isInvalidJson(payload)) return privateJson({ error: "درخواست معتبر نیست." }, 400);
  const id = objectText(payload, "id", 120);
  const all = typeof payload === "object" && payload !== null && (payload as Record<string, unknown>).all === true;
  if (!all && !isUuid(id)) return privateJson({ error: "شناسه اعلان معتبر نیست." }, 422);
  try {
    return privateJson({
      notifications: await markCustomerNotificationsRead(user.email, all ? undefined : id),
    });
  } catch (error) {
    return error instanceof Error && error.message === "NOTIFICATION_NOT_FOUND"
      ? privateJson({ error: "اعلان پیدا نشد." }, 404)
      : unavailable();
  }
}

function unauthorized() {
  return privateJson({ error: "برای مشاهده اعلان‌ها وارد حساب شوید." }, 401);
}

function unavailable() {
  return privateJson({ error: "اعلان‌ها موقتاً در دسترس نیستند." }, 503);
}
