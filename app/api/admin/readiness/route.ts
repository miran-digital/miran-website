import { readStorefrontState, listSellerApplications } from "@/db/admin-repository";
import { listOrders } from "@/db/order-repository";
import { getAdminAccess } from "@/lib/admin-auth";
import { buildLaunchReadiness } from "@/lib/launch-readiness";
import { getPaymentCapability } from "@/lib/payment-provider";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAdminAccess("security.write");
  if (!access.allowed) {
    return Response.json(
      { error: "مجوز بررسی آمادگی فروشگاه برای این حساب فعال نیست." },
      { status: access.reason === "anonymous" ? 401 : 403 },
    );
  }

  try {
    const [state, sellers, orders, payment, env] = await Promise.all([
      readStorefrontState(),
      listSellerApplications(),
      listOrders(),
      getPaymentCapability(),
      getRuntimeEnv<{ SITE_URL?: unknown; SITE_INDEXABLE?: unknown }>().catch(
        (): { SITE_URL?: unknown; SITE_INDEXABLE?: unknown } => ({}),
      ),
    ]);
    const siteUrl =
      typeof env.SITE_URL === "string"
        ? env.SITE_URL
        : process.env.SITE_URL ?? "";
    const indexableValue =
      typeof env.SITE_INDEXABLE === "string"
        ? env.SITE_INDEXABLE
        : process.env.SITE_INDEXABLE ?? "";

    return Response.json(
      {
        report: buildLaunchReadiness({
          state,
          sellers,
          orders,
          paymentEnabled: payment.enabled,
          siteUrl,
          siteIndexable: /^(1|true|yes)$/i.test(indexableValue),
        }),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "بررسی آمادگی فروشگاه ممکن نشد." },
      { status: 503 },
    );
  }
}
