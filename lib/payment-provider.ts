import { getRuntimeEnv } from "@/lib/runtime-env";
import { readZarinpalVaultConfig } from "@/lib/payment-provider-config";

type PaymentBindings = {
  ZARINPAL_MERCHANT_ID?: string;
  ZARINPAL_SANDBOX?: string;
};

type ZarinpalEnvelope<T> = {
  data?: T;
  errors?: ZarinpalError | ZarinpalError[];
};

type ZarinpalError = { code?: number; message?: string };

export const ZARINPAL_ENDPOINTS = {
  production: {
    apiBase: "https://payment.zarinpal.com/pg/v4",
    gatewayBase: "https://payment.zarinpal.com/pg/StartPay",
  },
  sandbox: {
    apiBase: "https://sandbox.zarinpal.com/pg/v4",
    gatewayBase: "https://sandbox.zarinpal.com/pg/StartPay",
  },
} as const;

export class PaymentProviderError extends Error {
  readonly providerCode?: number;
  readonly providerStatus?: number;

  constructor(
    message: "PAYMENT_CONNECTION_FAILED" | "PAYMENT_REQUEST_REJECTED" | "PAYMENT_VERIFY_REJECTED",
    providerCode?: number,
    providerStatus?: number,
  ) {
    super(message);
    this.name = "PaymentProviderError";
    this.providerCode = providerCode;
    this.providerStatus = providerStatus;
  }
}

export async function getPaymentCapability() {
  const config = await getZarinpalConfig();
  return {
    enabled: Boolean(config),
    provider: config ? "zarinpal" : null,
    reason: config ? null : "merchant_not_configured",
  } as const;
}

export async function requestZarinpalPayment(input: {
  amountRial: number;
  callbackUrl: string;
  description: string;
  email: string;
  mobile: string;
}) {
  const config = await getZarinpalConfig();
  if (!config) throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
  const { response, payload } = await postToZarinpal<{
    code?: number;
    authority?: string;
  }>(`${config.apiBase}/payment/request.json`, {
    merchant_id: config.merchantId,
    amount: input.amountRial,
    currency: "IRR",
    callback_url: input.callbackUrl,
    description: input.description,
    metadata: { email: input.email, mobile: input.mobile },
  });
  const authority = payload?.data?.authority?.trim() ?? "";
  if (!response.ok || payload?.data?.code !== 100 || !authority) {
    throw new PaymentProviderError(
      "PAYMENT_REQUEST_REJECTED",
      getProviderErrorCode(payload),
      response.status,
    );
  }
  return {
    authority,
    redirectUrl: `${config.gatewayBase}/${encodeURIComponent(authority)}`,
  };
}

export async function getZarinpalRedirectUrl(authority: string) {
  const config = await getZarinpalConfig();
  if (!config) throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
  return `${config.gatewayBase}/${encodeURIComponent(authority)}`;
}

export async function verifyZarinpalPayment(input: {
  authority: string;
  amountRial: number;
}) {
  const config = await getZarinpalConfig();
  if (!config) throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
  const { response, payload } = await postToZarinpal<{
    code?: number;
    ref_id?: number;
  }>(`${config.apiBase}/payment/verify.json`, {
    merchant_id: config.merchantId,
    amount: input.amountRial,
    currency: "IRR",
    authority: input.authority,
  });
  const code = payload?.data?.code;
  if (!response.ok || (code !== 100 && code !== 101)) {
    throw new PaymentProviderError(
      "PAYMENT_VERIFY_REJECTED",
      getProviderErrorCode(payload),
      response.status,
    );
  }
  return { reference: String(payload?.data?.ref_id ?? "") };
}

export function getPaymentProviderUserMessage(error: unknown) {
  if (!(error instanceof PaymentProviderError)) {
    return "ارتباط با درگاه پرداخت برقرار نشد؛ دوباره تلاش کنید.";
  }
  if (error.message === "PAYMENT_CONNECTION_FAILED") {
    return "پاسخی از زرین‌پال دریافت نشد؛ چند دقیقه دیگر دوباره تلاش کنید.";
  }
  switch (error.providerCode) {
    case -9:
      return "اطلاعات پرداخت برای زرین‌پال معتبر نیست؛ تنظیمات درگاه را بررسی کنید.";
    case -11:
      return "درگاه زرین‌پال این فروشگاه هنوز فعال نیست.";
    case -12:
      return "تعداد تلاش‌های پرداخت زیاد شده است؛ کمی بعد دوباره تلاش کنید.";
    case -13:
    case -17:
    case -19:
      return "حساب پذیرندهٔ زرین‌پال محدود است؛ مالک فروشگاه باید پنل زرین‌پال را بررسی کند.";
    case -18:
      return "دامنهٔ فروشگاه با دامنهٔ ثبت‌شده در زرین‌پال یکسان نیست.";
    default:
      return error.message === "PAYMENT_VERIFY_REJECTED"
        ? "تأیید پرداخت در زرین‌پال ناموفق بود؛ در صورت کسر وجه با پشتیبانی تماس بگیرید."
        : "زرین‌پال درخواست پرداخت را نپذیرفت؛ تنظیمات درگاه را بررسی کنید.";
  }
}

async function getZarinpalConfig() {
  const vault = await readZarinpalVaultConfig();
  if (vault?.disabled) return null;
  if (vault && !vault.disabled) {
    return {
      merchantId: vault.merchantId,
      ...(vault.sandbox ? ZARINPAL_ENDPOINTS.sandbox : ZARINPAL_ENDPOINTS.production),
    };
  }
  const bindings = await getRuntimeEnv<PaymentBindings>().catch(
    () => ({} as PaymentBindings),
  );
  const merchantId = (
    bindings.ZARINPAL_MERCHANT_ID ?? process.env.ZARINPAL_MERCHANT_ID ?? ""
  ).trim();
  if (!/^[a-f0-9-]{36}$/i.test(merchantId)) return null;
  const sandbox = /^(1|true|yes)$/i.test(
    bindings.ZARINPAL_SANDBOX ?? process.env.ZARINPAL_SANDBOX ?? "",
  );
  return {
    merchantId,
    ...(sandbox ? ZARINPAL_ENDPOINTS.sandbox : ZARINPAL_ENDPOINTS.production),
  };
}

async function postToZarinpal<T>(url: string, body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new PaymentProviderError("PAYMENT_CONNECTION_FAILED");
  }
  const payload = (await response.json().catch(() => null)) as ZarinpalEnvelope<T> | null;
  return { response, payload };
}

function getProviderErrorCode<T>(payload: ZarinpalEnvelope<T> | null) {
  const errors = payload?.errors;
  if (Array.isArray(errors)) {
    const code = errors.find(
      (error): error is ZarinpalError => Boolean(error) && typeof error === "object",
    )?.code;
    return typeof code === "number" ? code : undefined;
  }
  return typeof errors?.code === "number" ? errors.code : undefined;
}
