import { listPaymentProviderAdminConfigs } from "./payment-provider-config.ts";
import { availablePaymentProviders } from "./payments/provider-catalog.ts";

export { PaymentProviderError, getPaymentProviderUserMessage } from "./payments/provider-errors.ts";
export { ZARINPAL_ENDPOINTS } from "./payments/adapters/zarinpal.ts";

export async function getPaymentCapability() {
  try {
    const providers = availablePaymentProviders(await listPaymentProviderAdminConfigs());
    return { enabled: providers.length > 0, provider: providers[0]?.id ?? null,
      reason: providers.length ? null : "merchant_not_configured", providers };
  } catch {
    return { enabled: false, provider: null, reason: "configuration_unavailable", providers: [] };
  }
}
