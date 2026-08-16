function fail(message, code = "PAYMENT_PROVIDER_ERROR") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function providerData(payload) {
  if (!payload || typeof payload !== "object") return null;
  const data = payload.data;
  return data && typeof data === "object" ? data : null;
}

export class ZarinpalClient {
  constructor({ merchantId, sandbox = false, fetchImpl = fetch } = {}) {
    this.merchantId = String(merchantId || "").trim();
    this.sandbox = Boolean(sandbox);
    this.fetchImpl = fetchImpl;
    this.baseUrl = this.sandbox
      ? "https://sandbox.zarinpal.com"
      : "https://payment.zarinpal.com";
  }

  assertConfigured() {
    if (!this.merchantId) fail("Zarinpal merchant ID is not configured", "PAYMENT_NOT_CONFIGURED");
  }

  redirectUrl(authority) {
    return `${this.baseUrl}/pg/StartPay/${encodeURIComponent(authority)}`;
  }

  async createPayment({ amountIrr, callbackUrl, description, mobile = null, email = null }) {
    this.assertConfigured();
    if (!Number.isSafeInteger(amountIrr) || amountIrr < 10_000) {
      fail("Zarinpal payment amount must be at least 10000 IRR", "INVALID_PAYMENT_AMOUNT");
    }
    const callback = new URL(String(callbackUrl));
    if (
      callback.protocol !== "https:" &&
      !(this.sandbox && callback.protocol === "http:" && ["localhost", "127.0.0.1"].includes(callback.hostname))
    ) {
      fail("Payment callback must use HTTPS", "INVALID_CALLBACK_URL");
    }
    const payload = {
      merchant_id: this.merchantId,
      amount: amountIrr,
      currency: "IRR",
      callback_url: callback.toString(),
      description: String(description || "").slice(0, 500),
      ...(mobile ? { mobile: String(mobile) } : {}),
      ...(email ? { email: String(email) } : {}),
    };
    const response = await this.request("/pg/v4/payment/request.json", payload);
    const data = providerData(response);
    if (!data || Number(data.code) !== 100 || typeof data.authority !== "string") {
      fail(`Zarinpal payment request failed with code ${String(data?.code ?? "unknown")}`);
    }
    return {
      code: Number(data.code),
      authority: data.authority,
      fee: Number(data.fee || 0),
      feeType: data.fee_type ?? null,
      redirectUrl: this.redirectUrl(data.authority),
      raw: response,
    };
  }

  async verifyPayment({ amountIrr, authority }) {
    this.assertConfigured();
    if (!Number.isSafeInteger(amountIrr) || amountIrr < 10_000) {
      fail("Invalid verification amount", "INVALID_PAYMENT_AMOUNT");
    }
    const normalizedAuthority = String(authority || "").trim();
    if (!normalizedAuthority) fail("Payment authority is required", "INVALID_AUTHORITY");
    const response = await this.request("/pg/v4/payment/verify.json", {
      merchant_id: this.merchantId,
      amount: amountIrr,
      authority: normalizedAuthority,
    });
    const data = providerData(response);
    const code = Number(data?.code);
    if (![100, 101].includes(code)) {
      fail(`Zarinpal verification failed with code ${String(data?.code ?? "unknown")}`, "PAYMENT_VERIFICATION_FAILED");
    }
    return {
      code,
      referenceId: data?.ref_id === undefined || data?.ref_id === null ? null : String(data.ref_id),
      cardPan: data?.card_pan ?? null,
      fee: Number(data?.fee || 0),
      feeType: data?.fee_type ?? null,
      raw: response,
    };
  }

  async request(path, body) {
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "MiranShop/1.0",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      fail(`Zarinpal network error: ${error instanceof Error ? error.message : "unknown"}`);
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      fail("Zarinpal returned invalid JSON");
    }
    if (!response.ok) {
      const data = providerData(payload);
      fail(`Zarinpal HTTP ${response.status}, code ${String(data?.code ?? "unknown")}`);
    }
    return payload;
  }
}
