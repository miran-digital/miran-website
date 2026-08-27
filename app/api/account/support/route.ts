import { getCustomerUser } from "@/lib/customer-auth";
import {
  createSupportTicket,
  listCustomerSupportTickets,
  replyToCustomerSupportTicket,
} from "@/db/customer-care-repository";
import type { SupportTicketCategory } from "@/features/customer-care/customer-care-types";
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

const categories = new Set<SupportTicketCategory>([
  "order",
  "payment",
  "product",
  "account",
  "other",
]);

export async function GET() {
  const user = await getCustomerUser();
  if (!user) return unauthorized();
  try {
    return privateJson({ tickets: await listCustomerSupportTickets(user.email) });
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  const user = await getCustomerUser();
  if (!user) return unauthorized();
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const payload = await readBoundedJson(request);
  if (isJsonTooLarge(payload)) return privateJson({ error: "حجم درخواست بیش از حد مجاز است." }, 413);
  if (isInvalidJson(payload)) return privateJson({ error: "درخواست معتبر نیست." }, 400);

  const subject = objectText(payload, "subject", 160);
  const category = objectText(payload, "category", 30) as SupportTicketCategory;
  const orderNumber = objectText(payload, "orderNumber", 80);
  const body = objectText(payload, "body", 3_000);
  if (subject.length < 5 || body.length < 10 || !categories.has(category)) {
    return privateJson({ error: "موضوع، دسته و متن درخواست را کامل وارد کنید." }, 422);
  }
  try {
    const ticket = await createSupportTicket({
      customerEmail: user.email,
      customerName: safeCustomerName(user.fullName),
      subject,
      category,
      orderNumber,
      body,
    });
    return privateJson({ ticket }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ORDER_NOT_FOUND") return privateJson({ error: "سفارش انتخاب‌شده متعلق به این حساب نیست." }, 404);
    if (message === "SUPPORT_RATE_LIMIT") return privateJson({ error: "تعداد درخواست‌های امروز به حد مجاز رسیده است." }, 429);
    return unavailable();
  }
}

export async function PATCH(request: Request) {
  const user = await getCustomerUser();
  if (!user) return unauthorized();
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const payload = await readBoundedJson(request);
  if (isJsonTooLarge(payload)) return privateJson({ error: "حجم درخواست بیش از حد مجاز است." }, 413);
  if (isInvalidJson(payload)) return privateJson({ error: "درخواست معتبر نیست." }, 400);

  const id = objectText(payload, "id", 120);
  const body = objectText(payload, "body", 3_000);
  if (!isUuid(id) || body.length < 2) {
    return privateJson({ error: "شناسه تیکت یا متن پاسخ معتبر نیست." }, 422);
  }
  try {
    return privateJson({ ticket: await replyToCustomerSupportTicket(user.email, id, body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SUPPORT_NOT_FOUND") return privateJson({ error: "تیکت پیدا نشد." }, 404);
    if (message === "SUPPORT_CLOSED") return privateJson({ error: "این تیکت بسته شده و پاسخ جدید نمی‌پذیرد." }, 409);
    if (message === "SUPPORT_RATE_LIMIT") return privateJson({ error: "تعداد پاسخ‌های امروز به حد مجاز رسیده است." }, 429);
    return unavailable();
  }
}

function safeCustomerName(fullName: string | null) {
  const value = fullName?.trim().slice(0, 120) ?? "";
  return value && !value.includes("@") ? value : "مشتری میران";
}

function unauthorized() {
  return privateJson({ error: "برای استفاده از پشتیبانی وارد حساب شوید." }, 401);
}

function unavailable() {
  return privateJson({ error: "پشتیبانی موقتاً در دسترس نیست." }, 503);
}
