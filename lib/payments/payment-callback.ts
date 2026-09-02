import { completePayment, failPaymentAttemptById, getPaymentAttemptForCallback } from "../../db/order-repository.ts";
import { readPaymentProviderRuntimeConfig } from "../payment-provider-config.ts";
import { getPaymentAdapter } from "./provider-registry.ts";
import { verifyPaymentCallback } from "./callback-integrity.ts";
import { readPaymentRequestText } from "./request-body.ts";
import type { PaymentContext } from "./provider-types.ts";

export const paymentCallbackDependencies = {
  getAttempt: getPaymentAttemptForCallback,
  getConfig: readPaymentProviderRuntimeConfig,
  getAdapter: getPaymentAdapter,
  complete: completePayment,
  failAttempt: failPaymentAttemptById,
};

export async function handlePaymentCallback(request: Request, provider: string, dependencies = paymentCallbackDependencies) {
  const url = new URL(request.url);
  const resultUrl = new URL("/payment/result", url.origin);
  const finish = (status: string) => {
    resultUrl.searchParams.set("status", status);
    return new Response(null, { status: 303, headers: { location: resultUrl.href, "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
  };
  try {
    const params = new URLSearchParams(url.searchParams);
    if (request.method === "POST") {
      if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return finish("invalid");
      const body = await readPaymentRequestText(request, 4096);
      if (body === null) return finish("invalid");
      new URLSearchParams(body).forEach((value, key) => params.append(key, value));
    }
    const adapter = dependencies.getAdapter(provider);
    const callback = adapter.handleCallback(params);
    if (!callback) return finish("invalid");
    const attempt = await dependencies.getAttempt(callback.authority, undefined, provider);
    if (!attempt || attempt.provider !== provider || attempt.currency !== "IRR" || attempt.amount_minor !== attempt.total_minor || !Number.isSafeInteger(attempt.amount_minor) || attempt.amount_minor <= 0) return finish("invalid");
    const context: PaymentContext = { provider, attemptId: attempt.id, orderId: attempt.order_id, amountRial: attempt.amount_minor, currency: "IRR" };
    const config = await dependencies.getConfig(provider, { forVerification: true });
    if (!config || config.provider !== provider) return finish("verification_pending");
    if (attempt.id.startsWith("v57_")) {
      if (params.getAll("attempt").length !== 1 || params.getAll("state").length !== 1 || params.get("attempt") !== attempt.id ||
          !await verifyPaymentCallback(params.get("state") ?? "", context, config)) return finish("invalid");
    } else if (provider !== "zarinpal") {
      // Only historical V55 Zarinpal attempts used the unsigned legacy callback.
      return finish("invalid");
    }
    resultUrl.searchParams.set("order", attempt.order_number);
    if (attempt.status === "paid" && attempt.payment_status === "paid") return finish("paid");
    if (attempt.status !== "pending") return finish("failed");
    if (!callback.accepted) {
      await dependencies.failAttempt(attempt.id);
      return finish("failed");
    }
    if (attempt.order_status !== "new" || attempt.payment_status === "paid") return finish("verification_pending");
    const verified = await adapter.verifyPayment({ ...context, authority: callback.authority }, config);
    if (verified.status !== "paid" || verified.provider !== context.provider || verified.attemptId !== context.attemptId ||
        verified.orderId !== context.orderId || verified.amountRial !== context.amountRial || verified.currency !== context.currency ||
        verified.authority !== callback.authority || !verified.reference) return finish("invalid");
    await dependencies.complete({ attemptId: context.attemptId, orderId: context.orderId, provider,
      authority: verified.authority, amountMinor: verified.amountRial, currency: verified.currency, providerReference: verified.reference });
    return finish("paid");
  } catch {
    // A timeout after charging is ambiguous: retain pending state for verification.
    // Never log request bodies, credentials, authorities, raw provider errors or PII.
    console.warn("[miran-payment] callback_verification_pending");
    return finish("verification_pending");
  }
}
