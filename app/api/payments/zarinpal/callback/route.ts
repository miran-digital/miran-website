import {
  completePayment,
  failPaymentAttempt,
  getPaymentAttemptForCallback,
} from "@/db/order-repository";
import { verifyZarinpalPayment } from "@/lib/payment-provider";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const authority = (url.searchParams.get("Authority") ?? "").trim().slice(0, 120);
  const providerStatus = url.searchParams.get("Status");
  const resultUrl = new URL("/payment/result", url.origin);
  if (!authority) {
    resultUrl.searchParams.set("status", "invalid");
    return Response.redirect(resultUrl, 303);
  }
  const attempt = await getPaymentAttemptForCallback(authority).catch(() => null);
  if (attempt?.order_number) resultUrl.searchParams.set("order", attempt.order_number);
  if (attempt?.status === "paid" && attempt.payment_status === "paid") {
    resultUrl.searchParams.set("status", "paid");
    if (attempt.provider_reference) {
      resultUrl.searchParams.set("ref", attempt.provider_reference);
    }
    return Response.redirect(resultUrl, 303);
  }
  if (!attempt || attempt.status !== "pending") {
    resultUrl.searchParams.set("status", "failed");
    return Response.redirect(resultUrl, 303);
  }
  if (providerStatus !== "OK") {
    await failPaymentAttempt(authority).catch(() => undefined);
    resultUrl.searchParams.set("status", "failed");
    return Response.redirect(resultUrl, 303);
  }
  try {
    const verified = await verifyZarinpalPayment({
      authority,
      amountRial: attempt.amount_minor,
    });
    const order = await completePayment({
      authority,
      providerReference: verified.reference,
    });
    resultUrl.searchParams.set("status", "paid");
    resultUrl.searchParams.set("order", order.orderNumber);
    resultUrl.searchParams.set("ref", verified.reference);
  } catch {
    await failPaymentAttempt(authority).catch(() => undefined);
    resultUrl.searchParams.set("status", "failed");
  }
  return Response.redirect(resultUrl, 303);
}
