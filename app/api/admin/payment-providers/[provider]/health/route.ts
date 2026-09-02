import { getAdminAccess } from "@/lib/admin-auth";
import { auditPaymentProviderHealth, readPaymentProviderRuntimeConfig } from "@/lib/payment-provider-config";
import { findPaymentProvider } from "@/lib/payments/provider-catalog";
import { getPaymentAdapter } from "@/lib/payments/provider-registry";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import { rejectRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const privateJson = (body: object, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const access = await getAdminAccess("security.write");
  if (!access.allowed) return privateJson({ error: "دسترسی مالک لازم است." }, access.reason === "anonymous" ? 401 : 403);
  if (access.role !== "owner") return privateJson({ error: "دسترسی مالک لازم است." }, 403);
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const limited = await rejectRateLimited(request, { scope: "admin.payment-config", identity: access.user.email, limit: 30, windowSeconds: 60, failureMode: "closed" });
  if (limited) return limited;
  const { provider } = await params;
  if (!findPaymentProvider(provider)) return privateJson({ error: "درگاه معتبر نیست." }, 422);
  try {
    const definition = findPaymentProvider(provider)!;
    const config = await readPaymentProviderRuntimeConfig(provider, { forVerification: true });
    const health = definition.integration !== "integrated" || !config
      ? { status: "unavailable", scope: "configuration", message: "اتصال یا اطلاعات معتبر این درگاه آماده نیست؛ هیچ تراکنشی ایجاد نشد." }
      : await getPaymentAdapter(provider).healthCheck(config);
    await auditPaymentProviderHealth(provider, access.user.email);
    return privateJson({ health });
  } catch { return privateJson({ error: "بررسی امن تنظیمات ممکن نشد؛ هیچ تراکنش آزمایشی ایجاد نشد." }, 503); }
}
