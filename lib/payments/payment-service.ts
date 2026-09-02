import { getOrderByNumberForPayment, failPaymentAttemptById, getReusablePendingPaymentAttempt, recordPaymentAttempt, updatePaymentAuthority } from "../../db/order-repository.ts";
import { hasPendingBankTransferReceipt } from "../../db/bank-transfer-repository.ts";
import { readPaymentProviderRuntimeConfig } from "../payment-provider-config.ts";
import { findPaymentProvider } from "./provider-catalog.ts";
import { getPaymentAdapter } from "./provider-registry.ts";
import { signPaymentCallback } from "./callback-integrity.ts";
import { PaymentProviderError } from "./provider-errors.ts";
import type { PaymentContext } from "./provider-types.ts";

export class PaymentFlowError extends Error {
  readonly status: number;
  constructor(code: string, status: number) { super(code); this.status = status; }
}

export const paymentServiceDependencies = {
  getOrder: getOrderByNumberForPayment,
  hasReceipt: hasPendingBankTransferReceipt,
  getPending: getReusablePendingPaymentAttempt,
  recordAttempt: recordPaymentAttempt,
  updateAuthority: updatePaymentAuthority,
  failAttempt: failPaymentAttemptById,
  getConfig: readPaymentProviderRuntimeConfig,
  getAdapter: getPaymentAdapter,
};

export async function createPaymentSession(input: {
  provider: string; orderNumber: string; customerEmail: string; origin: string;
}, dependencies = paymentServiceDependencies) {
  if (!findPaymentProvider(input.provider)) throw new PaymentFlowError("PAYMENT_PROVIDER_INVALID", 422);
  const adapter = dependencies.getAdapter(input.provider);
  const config = await dependencies.getConfig(input.provider);
  if (!config || config.provider !== input.provider) throw new PaymentProviderError("PAYMENT_PROVIDER_NOT_CONFIGURED");
  const order = await dependencies.getOrder(input.orderNumber, input.customerEmail);
  if (!order || order.customerEmail.trim().toLowerCase() !== input.customerEmail.trim().toLowerCase() || order.status !== "new" || order.paymentStatus === "paid") {
    throw new PaymentFlowError("PAYMENT_ORDER_UNAVAILABLE", 409);
  }
  if (order.currency !== "IRR" || !Number.isSafeInteger(order.totalMinor) || order.totalMinor <= 0) throw new PaymentFlowError("PAYMENT_AMOUNT_INVALID", 422);
  if (await dependencies.hasReceipt(order.id)) throw new PaymentFlowError("PAYMENT_RECEIPT_PENDING", 409);
  const reuse = (pending: NonNullable<Awaited<ReturnType<typeof dependencies.getPending>>>) => {
    if (pending.provider !== input.provider) throw new PaymentFlowError("PAYMENT_OTHER_PROVIDER_PENDING", 409);
    if (pending.amount_minor !== order.totalMinor) throw new PaymentFlowError("PAYMENT_AMOUNT_INVALID", 409);
    if (!pending.authority) throw new PaymentFlowError("PAYMENT_PREPARING", 409);
    return { status: "pending" as const, provider: input.provider, authority: pending.authority, redirectUrl: adapter.redirectUrl(pending.authority, config) };
  };
  const pending = await dependencies.getPending(order.id);
  if (pending) return reuse(pending);
  let attemptId: string;
  try {
    attemptId = await dependencies.recordAttempt({ orderId: order.id, provider: input.provider, amountMinor: order.totalMinor,
      configurationRevision: config.vaultRevision ?? null, sandbox: config.sandbox });
  } catch (error) {
    const raced = await dependencies.getPending(order.id);
    if (raced) return reuse(raced);
    throw error;
  }
  try {
    const context: PaymentContext = { provider: input.provider, attemptId, orderId: order.id, amountRial: order.totalMinor, currency: "IRR" };
    const callback = new URL(`/api/payments/${encodeURIComponent(input.provider)}/callback`, input.origin);
    callback.searchParams.set("attempt", attemptId);
    callback.searchParams.set("state", await signPaymentCallback(context, config));
    const result = await adapter.createPayment({ ...context, callbackUrl: callback.href, description: `پرداخت سفارش ${order.orderNumber}`,
      email: order.customerEmail, mobile: order.customerPhone }, config);
    await dependencies.updateAuthority(attemptId, result.authority);
    return { ...result, provider: input.provider };
  } catch (error) {
    // No redirect was delivered: this attempt cannot be used by the customer.
    await dependencies.failAttempt(attemptId).catch(() => undefined);
    throw error;
  }
}

export function paymentFlowUserMessage(error: PaymentFlowError) {
  switch (error.message) {
    case "PAYMENT_PROVIDER_INVALID": return "درگاه انتخاب‌شده معتبر نیست.";
    case "PAYMENT_RECEIPT_PENDING": return "فیش کارت‌به‌کارت این سفارش در انتظار بررسی است؛ پرداخت هم‌زمان مجاز نیست.";
    case "PAYMENT_OTHER_PROVIDER_PENDING": return "پرداخت قبلی این سفارش در درگاه دیگری در جریان است؛ ابتدا وضعیت همان پرداخت را پیگیری کنید.";
    case "PAYMENT_PREPARING": return "درخواست پرداخت قبلی در حال آماده‌سازی است؛ چند لحظه بعد دوباره تلاش کنید.";
    case "PAYMENT_AMOUNT_INVALID": return "مبلغ یا واحد پول سفارش برای پرداخت معتبر نیست.";
    default: return "این سفارش برای پرداخت در دسترس نیست.";
  }
}
