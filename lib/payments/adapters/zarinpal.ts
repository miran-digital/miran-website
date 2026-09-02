import type { PaymentAdapter, PaymentRuntimeConfig } from "../provider-types.ts";
import { PaymentProviderError } from "../provider-errors.ts";
import { findPaymentProvider, validCredential } from "../provider-catalog.ts";

export const ZARINPAL_ENDPOINTS = {
  production: { apiBase: "https://payment.zarinpal.com/pg/v4", gatewayBase: "https://payment.zarinpal.com/pg/StartPay" },
  sandbox: { apiBase: "https://sandbox.zarinpal.com/pg/v4", gatewayBase: "https://sandbox.zarinpal.com/pg/StartPay" },
} as const;

type Envelope<T> = { data?: T; errors?: { code?: number } | { code?: number }[] };
const validAuthority = (authority: string) => /^[AS][a-z0-9]{35}$/i.test(authority);

function endpoints(config: PaymentRuntimeConfig) {
  return config.sandbox ? ZARINPAL_ENDPOINTS.sandbox : ZARINPAL_ENDPOINTS.production;
}

function assertAmount(amount: number, currency: string) {
  if (currency !== "IRR" || !Number.isSafeInteger(amount) || amount <= 0) throw new PaymentProviderError("PAYMENT_AMOUNT_INVALID");
}

export const zarinpalAdapter: PaymentAdapter = {
  id: "zarinpal",
  async createPayment(input, config) {
    assertAmount(input.amountRial, input.currency);
    const { response, payload } = await post<{ code?: number; authority?: string }>(
      `${endpoints(config).apiBase}/payment/request.json`, {
        merchant_id: config.credentials.merchantId, amount: input.amountRial, currency: "IRR",
        callback_url: input.callbackUrl, description: input.description,
        metadata: { email: input.email, mobile: input.mobile, order_id: input.orderId },
      },
    );
    const authority = typeof payload?.data?.authority === "string" ? payload.data.authority : "";
    if (!response.ok || payload?.data?.code !== 100 || !validAuthority(authority) || (config.sandbox ? authority[0] !== "S" : authority[0] !== "A")) {
      throw new PaymentProviderError("PAYMENT_REQUEST_REJECTED", errorCode(payload), response.status);
    }
    return { status: "pending", authority, redirectUrl: this.redirectUrl(authority, config) };
  },
  async verifyPayment(input, config) {
    assertAmount(input.amountRial, input.currency);
    if (!validAuthority(input.authority) || (config.sandbox ? input.authority[0] !== "S" : input.authority[0] !== "A")) {
      throw new PaymentProviderError("PAYMENT_CALLBACK_INVALID");
    }
    const { response, payload } = await post<{ code?: number; ref_id?: number | string }>(
      `${endpoints(config).apiBase}/payment/verify.json`, {
        merchant_id: config.credentials.merchantId, amount: input.amountRial, authority: input.authority,
      },
    );
    const reference = payload?.data?.ref_id;
    const safeReference = typeof reference === "number"
      ? Number.isSafeInteger(reference) && reference > 0
      : typeof reference === "string" && /^[1-9]\d{0,24}$/.test(reference);
    if (!response.ok || ![100, 101].includes(payload?.data?.code ?? 0) || !safeReference) {
      throw new PaymentProviderError("PAYMENT_VERIFY_REJECTED", errorCode(payload), response.status);
    }
    return { ...input, status: "paid", reference: String(reference) };
  },
  handleCallback(params) {
    const authority = params.get("Authority") ?? "";
    const status = params.get("Status");
    if (params.getAll("Authority").length !== 1 || params.getAll("Status").length !== 1 || !validAuthority(authority) || (status !== "OK" && status !== "NOK")) return null;
    return { authority, accepted: status === "OK" };
  },
  redirectUrl(authority, config) {
    if (!validAuthority(authority)) throw new PaymentProviderError("PAYMENT_CALLBACK_INVALID");
    return `${endpoints(config).gatewayBase}/${encodeURIComponent(authority)}`;
  },
  async healthCheck(config) {
    const field = findPaymentProvider("zarinpal")!.credentialSchema.fields[0];
    const configured = validCredential(field, config.credentials.merchantId ?? "");
    return { status: configured ? "configured" : "unavailable", scope: "configuration",
      message: configured ? "ساختار اطلاعات و رمزگشایی معتبر است؛ ارتباط بانکی یا فعال‌بودن پذیرنده بررسی نشده است."
        : "شناسه پذیرنده معتبر نیست." };
  },
};

async function post<T>(url: string, body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", redirect: "error",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  } catch { throw new PaymentProviderError("PAYMENT_CONNECTION_FAILED"); }
  const payload = await response.json().catch(() => null) as Envelope<T> | null;
  return { response, payload };
}

function errorCode<T>(payload: Envelope<T> | null) {
  const errors = payload?.errors;
  const code = Array.isArray(errors) ? errors.find((error) => typeof error?.code === "number")?.code : errors?.code;
  return typeof code === "number" ? code : undefined;
}
