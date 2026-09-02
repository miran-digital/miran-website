import type { PaymentContext, PaymentRuntimeConfig } from "./provider-types.ts";

const encodeContext = (context: PaymentContext) => new TextEncoder().encode(JSON.stringify([
  "miran-payment-callback:v1", context.provider, context.attemptId, context.orderId, context.amountRial, context.currency,
]));

async function signingKey(config: PaymentRuntimeConfig) {
  // Keep priority/enable flags out of the signature. Credential/sandbox rotation is
  // blocked while attempts are pending, so disabling new payments does not break settlement.
  const material = new TextEncoder().encode(JSON.stringify([
    "miran-payment-callback-key:v1", config.provider, config.sandbox,
    Object.entries(config.credentials).sort(([a], [b]) => a.localeCompare(b)),
  ]));
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signPaymentCallback(context: PaymentContext, config: PaymentRuntimeConfig) {
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(config), encodeContext(context)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyPaymentCallback(signature: string, context: PaymentContext, config: PaymentRuntimeConfig) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const bytes = Uint8Array.from(signature.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16));
  return crypto.subtle.verify("HMAC", await signingKey(config), bytes, encodeContext(context));
}
