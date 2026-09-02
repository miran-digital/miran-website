// Public definitions only. No credential values, database access or server secrets.
export type CredentialField = {
  name: string;
  label: string;
  type: "text" | "password";
  required: boolean;
  secret: boolean;
  validation: "uuid" | "positive-integer";
  maxLength: number;
};

export type PaymentProviderDefinition = {
  id: string;
  label: string;
  integration: "integrated" | "not-integrated";
  credentialSchema: { verified: boolean; fields: readonly CredentialField[] };
  supportsSandbox: boolean;
  documentationUrl: string;
};

const unverified = (id: string, label: string, documentationUrl: string): PaymentProviderDefinition => ({
  id, label, integration: "not-integrated", supportsSandbox: false, documentationUrl,
  // Do not invent merchant fields before the official API contract is verified.
  credentialSchema: { verified: false, fields: [] },
});

export const paymentProviderCatalog: readonly PaymentProviderDefinition[] = [
  {
    id: "zarinpal", label: "زرین‌پال", integration: "integrated", supportsSandbox: true,
    documentationUrl: "https://www.zarinpal.com/docs/paymentGateway/connectToGateway",
    credentialSchema: { verified: true, fields: [
      { name: "merchantId", label: "شناسه پذیرنده زرین‌پال", type: "password", required: true,
        secret: true, validation: "uuid", maxLength: 36 },
    ] },
  },
  unverified("behpardakht", "به‌پرداخت ملت", "https://behpardakht.com/"),
  unverified("saman", "پرداخت الکترونیک سامان (سپ)", "https://www.sep.ir/راهنما-و-مستندات-فنی"),
  unverified("sadad", "پرداخت الکترونیک سداد", "https://sadadpsp.ir/131"),
  unverified("irankish", "ایران‌کیش", "https://ikc.ir/"),
  unverified("pasargad", "پرداخت الکترونیک پاسارگاد", "https://pep.co.ir/developers/"),
  unverified("parsian", "تجارت الکترونیک پارسیان", "https://pec.ir/"),
  unverified("asanpardakht", "آسان پرداخت", "https://asanpardakht.ir/"),
];

export function findPaymentProvider(provider: string) {
  return paymentProviderCatalog.find((definition) => definition.id === provider);
}

export function validCredential(field: CredentialField, value: string) {
  if (!value) return !field.required;
  if (value.length > field.maxLength) return false;
  if (field.validation === "uuid") return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
}

export type PublicPaymentProvider = { id: string; label: string; priority: number; sandbox: boolean };

export type AdminPaymentProvider = {
  provider: string; label: string; added: boolean; enabled: boolean; sandbox: boolean;
  integrated: boolean; configured: boolean; available: boolean; encryptionReady: boolean;
  credentialHints: Record<string, string>; priority: number; updatedAt: string;
  configurationSource: "vault" | "environment" | "none";
  configurationError: "unreadable" | "missing" | null;
};

export function availablePaymentProviders(configs: readonly AdminPaymentProvider[]): PublicPaymentProvider[] {
  return configs.filter((config) => config.integrated && config.configured && config.enabled && config.available)
    .sort((a, b) => a.priority - b.priority || a.provider.localeCompare(b.provider))
    .map((config) => ({ id: config.provider, label: config.label, priority: config.priority, sandbox: config.sandbox }));
}
