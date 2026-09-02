import { getCustomerUser } from "@/lib/customer-auth";
import { createPaymentSession, PaymentFlowError, paymentFlowUserMessage } from "@/lib/payments/payment-service";
import { getPaymentProviderUserMessage, PaymentProviderError } from "@/lib/payments/provider-errors";
import { readPaymentRequestJson } from "@/lib/payments/request-body";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import { rejectRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const MAX_JSON_BYTES = 2_048;
const privateJson = (body: object, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const user = await getCustomerUser();
  if (!user) return privateJson({ error: "برای پرداخت سفارش وارد حساب شوید." }, 401);
  const rateLimited = await rejectRateLimited(request, { scope: "payment.create", identity: user.email, limit: 10, windowSeconds: 600 });
  if (rateLimited) return rateLimited;
  const payload = await readPaymentRequestJson(request, MAX_JSON_BYTES) as { orderNumber?: unknown; provider?: unknown } | null;
  if (typeof payload?.orderNumber !== "string" || !payload.orderNumber.trim() || payload.orderNumber.length > 80 ||
      typeof payload.provider !== "string" || !/^[a-z][a-z0-9-]{1,39}$/.test(payload.provider)) {
    return privateJson({ error: "درخواست پرداخت معتبر نیست." }, 422);
  }
  try {
    return privateJson(await createPaymentSession({ provider: payload.provider, orderNumber: payload.orderNumber.trim(),
      customerEmail: user.email, origin: new URL(request.url).origin }));
  } catch (error) {
    if (error instanceof PaymentFlowError) return privateJson({ error: paymentFlowUserMessage(error) }, error.status);
    const unavailable = error instanceof PaymentProviderError && /NOT_CONFIGURED|NOT_INTEGRATED/.test(error.message);
    return privateJson({ error: getPaymentProviderUserMessage(error) }, unavailable ? 503 : 502);
  }
}
