import { getCustomerUser } from "@/lib/customer-auth";
import {
  getOrderByNumberForPayment,
  failPaymentAttemptById,
  getReusablePendingPaymentAttempt,
  recordPaymentAttempt,
  updatePaymentAuthority,
} from "@/db/order-repository";
import { hasPendingBankTransferReceipt } from "@/db/bank-transfer-repository";
import {
  getPaymentProviderUserMessage,
  getZarinpalRedirectUrl,
  PaymentProviderError,
  requestZarinpalPayment,
} from "@/lib/payment-provider";
import { rejectCrossSiteMutation } from "@/lib/request-security";
import { rejectRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_JSON_BYTES = 2_048;

export async function POST(request: Request) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const user = await getCustomerUser();
  if (!user) {
    return Response.json(
      { error: "برای پرداخت سفارش وارد حساب شوید." },
      { status: 401, headers: { "cache-control": "private, no-store" } },
    );
  }
  const rateLimited = await rejectRateLimited(request, {
    scope: "payment.create",
    identity: user.email,
    limit: 10,
    windowSeconds: 600,
  });
  if (rateLimited) return rateLimited;
  const payload = await readBoundedJson(request) as {
    orderNumber?: unknown;
  } | null;
  const orderNumber = clean(payload?.orderNumber, 80);
  if (!orderNumber) return invalid();
  let attemptId = "";
  try {
    const order = await getOrderByNumberForPayment(orderNumber, user.email);
    if (!order || order.status !== "new" || order.paymentStatus === "paid") {
      return Response.json(
        { error: "این سفارش برای پرداخت در دسترس نیست." },
        { status: 409 },
      );
    }
    if (await hasPendingBankTransferReceipt(order.id)) {
      return Response.json(
        { error: "فیش کارت‌به‌کارت این سفارش در انتظار بررسی است و پرداخت هم‌زمان زرین‌پال مجاز نیست." },
        { status: 409, headers: { "cache-control": "private, no-store" } },
      );
    }
    const pending = await getReusablePendingPaymentAttempt(order.id);
    if (pending?.authority) {
      return Response.json(
        {
          authority: pending.authority,
          redirectUrl: await getZarinpalRedirectUrl(pending.authority),
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (pending) return paymentAlreadyPreparing();
    try {
      attemptId = await recordPaymentAttempt({
        orderId: order.id,
        provider: "zarinpal",
        amountMinor: order.totalMinor,
      });
    } catch (error) {
      const raced = await getReusablePendingPaymentAttempt(order.id);
      if (raced?.authority) {
        return Response.json(
          {
            authority: raced.authority,
            redirectUrl: await getZarinpalRedirectUrl(raced.authority),
          },
          { headers: { "cache-control": "no-store" } },
        );
      }
      if (raced) return paymentAlreadyPreparing();
      throw error;
    }
    const result = await requestZarinpalPayment({
      amountRial: order.totalMinor,
      callbackUrl: `${new URL(request.url).origin}/api/payments/zarinpal/callback`,
      description: `پرداخت سفارش ${order.orderNumber}`,
      email: order.customerEmail,
      mobile: order.customerPhone,
    });
    await updatePaymentAuthority(attemptId, result.authority);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (attemptId) await failPaymentAttemptById(attemptId).catch(() => undefined);
    const message = error instanceof Error ? error.message : "";
    const status = message === "PAYMENT_PROVIDER_NOT_CONFIGURED" ? 503 : 502;
    return Response.json(
      {
        error:
          status === 503
            ? "درگاه هنوز توسط مالک فروشگاه فعال نشده است."
            : getPaymentProviderUserMessage(error),
        ...(error instanceof PaymentProviderError && typeof error.providerCode === "number"
          ? { providerCode: error.providerCode }
          : {}),
      },
      { status },
    );
  }
}

function paymentAlreadyPreparing() {
  return Response.json(
    { error: "درخواست پرداخت قبلی در حال آماده‌سازی است؛ چند لحظه بعد دوباره تلاش کنید." },
    { status: 409, headers: { "cache-control": "private, no-store" } },
  );
}

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function invalid() {
  return Response.json(
    { error: "درخواست پرداخت معتبر نیست." },
    { status: 422, headers: { "cache-control": "private, no-store" } },
  );
}

async function readBoundedJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    return null;
  }
  const text = await request.text().catch(() => "");
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
