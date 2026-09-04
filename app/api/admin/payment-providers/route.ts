import { getAdminAccess } from "@/lib/admin-auth";
import {
  listPaymentProviderAdminConfigs,
  PaymentConfigError,
  removePaymentProviderConfiguration,
  savePaymentProviderConfiguration,
} from "@/lib/payment-provider-config";
import { paymentProviderCatalog } from "@/lib/payments/provider-catalog";
import { readPaymentRequestJson } from "@/lib/payments/request-body";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import { rejectRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const privateJson = (body: object, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

export async function GET() {
  const access = await getAdminAccess("security.write");
  if (!access.allowed) return denied(access.reason);
  if (access.role !== "owner") return denied("forbidden");
  try {
    return privateJson({ providers: await listPaymentProviderAdminConfigs(), catalog: paymentProviderCatalog });
  } catch { return privateJson({ error: "خواندن تنظیمات درگاه‌ها ممکن نشد." }, 503); }
}

export async function POST(request: Request) { return save(request, "add"); }
export async function PATCH(request: Request) { return save(request, "update"); }
export async function DELETE(request: Request) {
  const access = await getAdminAccess("security.write");
  if (!access.allowed) return denied(access.reason);
  if (access.role !== "owner") return denied("forbidden");
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const limited = await rejectRateLimited(request, {
    scope: "admin.payment-config",
    identity: access.user.email,
    limit: 30,
    windowSeconds: 60,
    failureMode: "closed",
  });
  if (limited) return limited;
  const payload = await readPaymentRequestJson(request, 256);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return invalid();
  const value = payload as Record<string, unknown>;
  if (
    typeof value.provider !== "string" ||
    !/^[a-z][a-z0-9-]{1,39}$/.test(value.provider) ||
    Object.keys(value).length !== 1
  ) return invalid();
  try {
    return privateJson(
      await removePaymentProviderConfiguration(value.provider, access.user.email),
    );
  } catch (error) {
    if (!(error instanceof PaymentConfigError)) {
      return privateJson({ error: "حذف امن تنظیمات درگاه ممکن نشد." }, 503);
    }
    const messages: Record<string, string> = {
      PAYMENT_PROVIDER_INVALID: "درگاه انتخاب‌شده معتبر نیست.",
      PAYMENT_PROVIDER_NOT_FOUND: "درگاه تعریف‌شده پیدا نشد.",
      PAYMENT_PROVIDER_ACTIVE: "برای حذف از فهرست، ابتدا درگاه را غیرفعال کنید.",
      PAYMENT_PROVIDER_HAS_HISTORY: "این درگاه سابقه پرداخت دارد و برای حفظ سوابق مالی قابل حذف کامل نیست؛ آن را غیرفعال کنید.",
      PAYMENT_CONFIG_BUSY: "تغییر هم‌زمانی ثبت شد؛ تنظیمات درگاه حذف نشد.",
    };
    const status = /ACTIVE|HAS_HISTORY|BUSY/.test(error.message)
      ? 409
      : /NOT_FOUND/.test(error.message)
        ? 404
        : /DATABASE_MISSING/.test(error.message)
          ? 503
          : 422;
    return privateJson(
      { error: messages[error.message] ?? "حذف امن تنظیمات درگاه ممکن نشد." },
      status,
    );
  }
}

async function save(request: Request, mode: "add" | "update") {
  const access = await getAdminAccess("security.write");
  if (!access.allowed) return denied(access.reason);
  if (access.role !== "owner") return denied("forbidden");
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const limited = await rejectRateLimited(request, { scope: "admin.payment-config", identity: access.user.email, limit: 30, windowSeconds: 60, failureMode: "closed" });
  if (limited) return limited;
  const payload = await readPaymentRequestJson(request, 8192);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return invalid();
  const value = payload as Record<string, unknown>;
  if (typeof value.provider !== "string" || !/^[a-z][a-z0-9-]{1,39}$/.test(value.provider) ||
      (value.enabled !== undefined && typeof value.enabled !== "boolean") ||
      (value.sandbox !== undefined && typeof value.sandbox !== "boolean") ||
      (value.priority !== undefined && typeof value.priority !== "number") ||
      (value.credentials !== undefined && (!value.credentials || typeof value.credentials !== "object" || Array.isArray(value.credentials))) ||
      Object.keys(value).some((key) => !["provider", "enabled", "sandbox", "priority", "credentials"].includes(key))) return invalid();
  try {
    const config = await savePaymentProviderConfiguration({
      provider: value.provider, enabled: value.enabled as boolean | undefined, sandbox: value.sandbox as boolean | undefined,
      priority: value.priority as number | undefined, credentials: value.credentials as Record<string, unknown> | undefined,
      actorEmail: access.user.email, mode,
    });
    return privateJson({ config }, mode === "add" ? 201 : 200);
  } catch (error) {
    if (!(error instanceof PaymentConfigError)) return privateJson({ error: "ذخیره امن تنظیمات درگاه ممکن نشد." }, 503);
    const messages: Record<string, string> = {
      PAYMENT_PROVIDER_INVALID: "درگاه انتخاب‌شده معتبر نیست.",
      PAYMENT_PROVIDER_EXISTS: "این درگاه قبلاً اضافه شده است؛ از ویرایش استفاده کنید.",
      PAYMENT_PROVIDER_NOT_FOUND: "درگاه تعریف‌شده پیدا نشد.",
      PAYMENT_PROVIDER_NOT_INTEGRATED: "اتصال این درگاه هنوز پیاده‌سازی نشده و قابل فعال‌سازی نیست.",
      PAYMENT_SANDBOX_UNSUPPORTED: "حالت آزمایشی رسمی برای این اتصال پشتیبانی نشده است.",
      PAYMENT_PRIORITY_INVALID: "اولویت نمایش باید عددی بین صفر و ۹۹۹ باشد.",
      PAYMENT_CREDENTIAL_FIELD_INVALID: "فیلد اطلاعات پذیرنده با درگاه انتخاب‌شده مطابقت ندارد.",
      PAYMENT_CREDENTIAL_INVALID: "قالب اطلاعات پذیرنده معتبر نیست.",
      PAYMENT_CREDENTIAL_REQUIRED: "اطلاعات ضروری پذیرنده برای فعال‌سازی کامل نشده است.",
      PAYMENT_CREDENTIALS_UNREADABLE: "رمزگشایی اطلاعات قبلی ممکن نشد؛ اطلاعات موجود بازنویسی نشده است.",
      PAYMENT_CONFIG_BUSY: "پرداخت در انتظار یا تغییر هم‌زمان وجود دارد؛ اطلاعات پذیرنده یا حالت آزمایشی اکنون قابل تغییر نیست.",
    };
    const status = /EXISTS|BUSY/.test(error.message) ? 409 : /NOT_FOUND/.test(error.message) ? 404
      : /ENCRYPTION_KEY|DATABASE_MISSING|UNREADABLE/.test(error.message) ? 503 : 422;
    return privateJson({ error: messages[error.message] ?? "حفاظت امن اطلاعات درگاه آماده نیست؛ تنظیمات سرور باید بررسی شود.",
      ...(error.field ? { field: error.field } : {}) }, status);
  }
}
function denied(reason: "anonymous" | "forbidden" | "misconfigured") {
  return privateJson({ error: "تنظیمات درگاه‌ها فقط برای مالک فروشگاه در دسترس است." }, reason === "anonymous" ? 401 : 403);
}
function invalid() { return privateJson({ error: "تنظیمات درگاه معتبر نیست." }, 422); }
