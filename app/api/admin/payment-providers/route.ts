import { getAdminAccess } from "@/lib/admin-auth";
import {
  getPaymentProviderAdminConfig,
  savePaymentProviderAdminConfig,
} from "@/lib/payment-provider-config";
import { rejectCrossSiteMutation } from "@/lib/request-security";

export const dynamic = "force-dynamic";

const MAX_JSON_BYTES = 2_048;

export async function GET() {
  const access = await getAdminAccess("security.write");
  if (!access.allowed) return denied(access.reason);
  try {
    return privateJson({ config: await getPaymentProviderAdminConfig() });
  } catch {
    return privateJson({ error: "خواندن تنظیمات درگاه ممکن نشد." }, 503);
  }
}

export async function PATCH(request: Request) {
  const access = await getAdminAccess("security.write");
  if (!access.allowed) return denied(access.reason);
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const payload = await readBoundedJson(request) as {
    enabled?: unknown;
    sandbox?: unknown;
    merchantId?: unknown;
  } | null;
  if (!payload || typeof payload.enabled !== "boolean" || typeof payload.sandbox !== "boolean") {
    return privateJson({ error: "تنظیمات درگاه معتبر نیست." }, 422);
  }
  const merchantId = typeof payload.merchantId === "string"
    ? payload.merchantId.trim().slice(0, 80)
    : "";
  try {
    const config = await savePaymentProviderAdminConfig({
      enabled: payload.enabled,
      sandbox: payload.sandbox,
      merchantId: merchantId || undefined,
      actorEmail: access.user.email,
    });
    return privateJson({ config });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const message = code === "PAYMENT_MERCHANT_INVALID"
      ? "شناسه پذیرنده زرین‌پال معتبر نیست."
      : code === "PAYMENT_MERCHANT_REQUIRED"
        ? "برای فعال‌سازی، شناسه پذیرنده زرین‌پال را وارد کنید."
        : /ENCRYPTION_KEY/.test(code)
          ? "حفاظت امن اطلاعات درگاه هنوز آماده نشده است."
          : "ذخیره تنظیمات درگاه ممکن نشد.";
    return privateJson({ error: message }, 422);
  }
}

function denied(reason: "anonymous" | "forbidden" | "misconfigured") {
  return privateJson(
    { error: "مجوز تنظیمات درگاه برای این حساب فعال نیست." },
    reason === "anonymous" ? 401 : 403,
  );
}

function privateJson(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

async function readBoundedJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) return null;
  const text = await request.text().catch(() => "");
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
