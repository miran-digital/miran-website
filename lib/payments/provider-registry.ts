import { findPaymentProvider } from "./provider-catalog.ts";
import { PaymentProviderError } from "./provider-errors.ts";
import type { PaymentAdapter } from "./provider-types.ts";
import { zarinpalAdapter } from "./adapters/zarinpal.ts";

// Only adapters backed by an inspected official contract belong here.
const adapters: ReadonlyMap<string, PaymentAdapter> = new Map([[zarinpalAdapter.id, zarinpalAdapter]]);

export function getPaymentAdapter(provider: string): PaymentAdapter {
  const adapter = adapters.get(provider);
  if (!adapter || findPaymentProvider(provider)?.integration !== "integrated") {
    throw new PaymentProviderError("PAYMENT_PROVIDER_NOT_INTEGRATED");
  }
  return adapter;
}
