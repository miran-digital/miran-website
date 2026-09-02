import { getRuntimeEnv } from "./runtime-env.ts";
import { findPaymentProvider, paymentProviderCatalog, validCredential, type AdminPaymentProvider, type PaymentProviderDefinition } from "./payments/provider-catalog.ts";
import type { PaymentRuntimeConfig } from "./payments/provider-types.ts";

type PaymentConfigBindings = {
  DB?: D1Database; PAYMENT_CONFIG_ENCRYPTION_KEY?: string;
  ZARINPAL_MERCHANT_ID?: string; ZARINPAL_SANDBOX?: string;
};
type StoredProviderRow = {
  provider: string; enabled: number; sandbox: number; credentials_ciphertext: string;
  credentials_iv: string; updated_at: string;
};
type VaultDocument = Record<string, unknown> & { __meta?: { priority?: number } };

export class PaymentConfigError extends Error {
  readonly field?: string;
  constructor(code: string, field?: string) { super(code); this.name = "PaymentConfigError"; this.field = field; }
}

export type PaymentProviderAdminConfig = {
  provider: "zarinpal"; enabled: boolean; sandbox: boolean; configured: boolean;
  credentialHint: string; encryptionReady: boolean;
};

export async function listPaymentProviderAdminConfigs(databaseOverride?: D1Database, secretOverride?: string): Promise<AdminPaymentProvider[]> {
  const env = await bindings(databaseOverride, secretOverride);
  const rows = env.DB ? (await env.DB.prepare("SELECT provider, enabled, sandbox, credentials_ciphertext, credentials_iv, updated_at FROM payment_provider_configs").all<StoredProviderRow>()).results : [];
  const key = await encryptionKey(env, secretOverride).catch(() => null);
  return Promise.all(paymentProviderCatalog.map(async (definition): Promise<AdminPaymentProvider> => {
    const row = rows.find((candidate) => candidate.provider === definition.id);
    const legacy = !row ? legacyEnvironmentConfig(definition.id, env) : null;
    const document = row?.credentials_ciphertext && key ? await decryptCredentials(row, key).catch(() => null) : null;
    const credentials = document ? credentialValues(definition, document) : legacy?.credentials;
    const configured = Boolean(credentials && validCredentials(definition, credentials));
    const integrated = definition.integration === "integrated";
    const enabled = row ? row.enabled === 1 : Boolean(legacy);
    const sandbox = row ? row.sandbox === 1 : legacy?.sandbox ?? false;
    return {
      provider: definition.id, label: definition.label, added: Boolean(row || legacy), enabled, sandbox,
      integrated, configured, available: integrated && configured && enabled && (!sandbox || definition.supportsSandbox),
      encryptionReady: Boolean(key), priority: priorityOf(document), updatedAt: row?.updated_at ?? "",
      credentialHints: credentials ? Object.fromEntries(Object.entries(credentials).filter(([, value]) => value).map(([name, value]) => [name, value.length > 4 ? "••••" + value.slice(-4) : "••••"])) : {},
      configurationSource: row ? "vault" : legacy ? "environment" : "none",
      configurationError: row?.credentials_ciphertext && !document ? "unreadable" : configured ? null : "missing",
    };
  }));
}

export async function savePaymentProviderConfiguration(input: {
  provider: string; actorEmail: string; enabled?: boolean; sandbox?: boolean; priority?: number;
  credentials?: Record<string, unknown>; mode?: "add" | "update";
}, databaseOverride?: D1Database, secretOverride?: string): Promise<AdminPaymentProvider> {
  const definition = findPaymentProvider(input.provider);
  if (!definition) throw new PaymentConfigError("PAYMENT_PROVIDER_INVALID");
  const env = await bindings(databaseOverride, secretOverride);
  const database = env.DB;
  if (!database) throw new PaymentConfigError("PAYMENT_CONFIG_DATABASE_MISSING");
  const existing = await readRow(database, input.provider);
  const legacy = !existing ? legacyEnvironmentConfig(input.provider, env) : null;
  if (input.mode === "add" && (existing || legacy)) throw new PaymentConfigError("PAYMENT_PROVIDER_EXISTS");
  if (input.mode === "update" && !existing && !legacy) throw new PaymentConfigError("PAYMENT_PROVIDER_NOT_FOUND");
  if (input.priority !== undefined && (!Number.isSafeInteger(input.priority) || input.priority < 0 || input.priority > 999)) {
    throw new PaymentConfigError("PAYMENT_PRIORITY_INVALID", "priority");
  }
  const enabled = input.enabled ?? (existing ? existing.enabled === 1 : Boolean(legacy));
  const sandbox = input.sandbox ?? (existing ? existing.sandbox === 1 : legacy?.sandbox ?? false);
  if (enabled && definition.integration !== "integrated") throw new PaymentConfigError("PAYMENT_PROVIDER_NOT_INTEGRATED");
  if (sandbox && !definition.supportsSandbox) throw new PaymentConfigError("PAYMENT_SANDBOX_UNSUPPORTED");
  const provided = input.credentials ?? {};
  for (const name of Object.keys(provided)) {
    const field = definition.credentialSchema.fields.find((candidate) => candidate.name === name);
    if (!field) throw new PaymentConfigError("PAYMENT_CREDENTIAL_FIELD_INVALID");
    if (typeof provided[name] !== "string" || (provided[name] as string).length > field.maxLength) throw new PaymentConfigError("PAYMENT_CREDENTIAL_INVALID", field.name);
  }
  const credentialsChanged = Object.values(provided).some((value) => typeof value === "string" && value.trim() !== "");
  const sandboxChanged = sandbox !== (existing ? existing.sandbox === 1 : legacy?.sandbox ?? false);
  const rotatesCredentials = credentialsChanged || sandboxChanged || Boolean(legacy);
  // Disabling a damaged vault never decrypts or replaces its credentials.
  const disableOnly = existing && input.enabled === false && input.sandbox === undefined && input.priority === undefined && !credentialsChanged;
  let ciphertext = existing?.credentials_ciphertext ?? "";
  let iv = existing?.credentials_iv ?? "";
  if (!disableOnly) {
    const key = await encryptionKey(env, secretOverride);
    const stored = existing?.credentials_ciphertext ? await decryptCredentials(existing, key).catch(() => null) : {};
    if (!stored && !definition.credentialSchema.fields.every((field) => typeof provided[field.name] === "string" && validCredential(field, (provided[field.name] as string).trim()))) {
      throw new PaymentConfigError("PAYMENT_CREDENTIALS_UNREADABLE");
    }
    const credentials = { ...(legacy?.credentials ?? credentialValues(definition, stored ?? {})) };
    for (const [name, value] of Object.entries(provided)) if (typeof value === "string" && value.trim()) credentials[name] = value.trim();
    for (const field of definition.credentialSchema.fields) {
      const value = credentials[field.name] ?? "";
      if (value && !validCredential(field, value)) throw new PaymentConfigError("PAYMENT_CREDENTIAL_INVALID", field.name);
      if ((enabled || input.mode === "add") && !validCredential(field, value)) throw new PaymentConfigError("PAYMENT_CREDENTIAL_REQUIRED", field.name);
    }
    const priority = input.priority ?? priorityOf(stored);
    if (!existing || credentialsChanged || priority !== priorityOf(stored)) {
      const encrypted = await encryptCredentials(input.provider, { ...credentials, __meta: { priority } }, key);
      ciphertext = encrypted.ciphertext; iv = encrypted.iv;
    }
  }
  // Optimistic write + pending-attempt guard protects callback verification keys.
  // Priority lives in the existing encrypted JSON envelope: no schema migration.
  const pendingGuard = "NOT EXISTS (SELECT 1 FROM payment_attempts WHERE provider = ? AND status = 'pending')";
  const mutation = existing
    ? database.prepare("UPDATE payment_provider_configs SET enabled = ?, sandbox = ?, credentials_ciphertext = ?, credentials_iv = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE provider = ? AND credentials_iv = ? AND enabled = ? AND sandbox = ? AND (? = 0 OR " + pendingGuard + ")")
      .bind(enabled ? 1 : 0, sandbox ? 1 : 0, ciphertext, iv, input.actorEmail, input.provider,
        existing.credentials_iv, existing.enabled, existing.sandbox, rotatesCredentials ? 1 : 0, input.provider)
    : database.prepare("INSERT INTO payment_provider_configs (provider, enabled, sandbox, credentials_ciphertext, credentials_iv, updated_by) SELECT ?, ?, ?, ?, ?, ? WHERE (? = 0 OR " + pendingGuard + ")")
      .bind(input.provider, enabled ? 1 : 0, sandbox ? 1 : 0, ciphertext, iv, input.actorEmail, rotatesCredentials ? 1 : 0, input.provider);
  const actions = [existing || legacy ? "provider.updated" : "provider.added",
    ...(credentialsChanged ? ["provider.credentials-updated"] : []),
    ...(enabled !== (existing ? existing.enabled === 1 : Boolean(legacy)) ? [enabled ? "provider.enabled" : "provider.disabled"] : []),
  ];
  const result = await database.batch([mutation, ...actions.map((action) => database.prepare(
    "INSERT INTO admin_audit_log (actor_email, action, subject_id) SELECT ?, ?, ? WHERE changes() = 1",
  ).bind(input.actorEmail, action, input.provider))]);
  if (result[0].meta.changes !== 1) throw new PaymentConfigError("PAYMENT_CONFIG_BUSY");
  return (await listPaymentProviderAdminConfigs(database, secretOverride ?? env.PAYMENT_CONFIG_ENCRYPTION_KEY)).find((config) => config.provider === input.provider)!;
}

export async function readPaymentProviderRuntimeConfig(provider: string, options: { forVerification?: boolean } = {}, databaseOverride?: D1Database, secretOverride?: string): Promise<PaymentRuntimeConfig | null> {
  const definition = findPaymentProvider(provider);
  if (!definition || definition.integration !== "integrated") return null;
  const env = await bindings(databaseOverride, secretOverride);
  const row = env.DB ? await readRow(env.DB, provider) : null;
  if (!row) return legacyEnvironmentConfig(provider, env);
  if ((!options.forVerification && row.enabled !== 1) || !row.credentials_ciphertext || !row.credentials_iv) return null;
  const key = await encryptionKey(env, secretOverride).catch(() => null);
  if (!key) return null;
  const document = await decryptCredentials(row, key).catch(() => null);
  if (!document) return null;
  const credentials = credentialValues(definition, document);
  if (!validCredentials(definition, credentials) || (row.sandbox === 1 && !definition.supportsSandbox)) return null;
  return { provider, credentials, sandbox: row.sandbox === 1, vaultRevision: row.credentials_iv };
}

export async function auditPaymentProviderHealth(provider: string, actorEmail: string, databaseOverride?: D1Database) {
  if (!findPaymentProvider(provider)) throw new PaymentConfigError("PAYMENT_PROVIDER_INVALID");
  const { DB } = await bindings(databaseOverride);
  if (!DB) throw new PaymentConfigError("PAYMENT_CONFIG_DATABASE_MISSING");
  await DB.prepare("INSERT INTO admin_audit_log (actor_email, action, subject_id) VALUES (?, 'provider.health-check', ?)").bind(actorEmail, provider).run();
}

// V55 callers and existing encrypted { merchantId } documents remain supported.
export async function getPaymentProviderAdminConfig(databaseOverride?: D1Database, secretOverride?: string): Promise<PaymentProviderAdminConfig> {
  const config = (await listPaymentProviderAdminConfigs(databaseOverride, secretOverride)).find((item) => item.provider === "zarinpal")!;
  return { provider: "zarinpal", enabled: config.enabled, sandbox: config.sandbox, configured: config.configured, credentialHint: config.credentialHints.merchantId ?? "", encryptionReady: config.encryptionReady };
}

export async function savePaymentProviderAdminConfig(input: { enabled: boolean; sandbox: boolean; merchantId?: string; actorEmail: string }, databaseOverride?: D1Database, secretOverride?: string) {
  await savePaymentProviderConfiguration({ provider: "zarinpal", enabled: input.enabled, sandbox: input.sandbox, actorEmail: input.actorEmail,
    credentials: input.merchantId ? { merchantId: input.merchantId } : {} }, databaseOverride, secretOverride);
  return getPaymentProviderAdminConfig(databaseOverride, secretOverride);
}

export async function readZarinpalVaultConfig(databaseOverride?: D1Database, secretOverride?: string) {
  const env = await bindings(databaseOverride, secretOverride);
  if (!env.DB || !await readRow(env.DB, "zarinpal")) return null;
  const config = await readPaymentProviderRuntimeConfig("zarinpal", {}, env.DB, secretOverride ?? env.PAYMENT_CONFIG_ENCRYPTION_KEY);
  return config ? { disabled: false as const, merchantId: config.credentials.merchantId, sandbox: config.sandbox } : { disabled: true as const };
}

function priorityOf(document: VaultDocument | null) {
  const priority = document?.__meta?.priority;
  return typeof priority === "number" && Number.isSafeInteger(priority) && priority >= 0 && priority <= 999 ? priority : 100;
}
function credentialValues(definition: PaymentProviderDefinition, document: VaultDocument) {
  return Object.fromEntries(definition.credentialSchema.fields.map((field) => [field.name, typeof document[field.name] === "string" ? document[field.name] as string : ""]));
}
function validCredentials(definition: PaymentProviderDefinition, credentials: Readonly<Record<string, string>>) {
  return definition.credentialSchema.verified && definition.credentialSchema.fields.length > 0 && definition.credentialSchema.fields.every((field) => validCredential(field, credentials[field.name] ?? ""));
}
function legacyEnvironmentConfig(provider: string, env: PaymentConfigBindings): PaymentRuntimeConfig | null {
  if (provider !== "zarinpal") return null;
  const merchantId = (env.ZARINPAL_MERCHANT_ID ?? process.env.ZARINPAL_MERCHANT_ID ?? "").trim();
  if (!validCredentials(findPaymentProvider(provider)!, { merchantId })) return null;
  return { provider, credentials: { merchantId }, sandbox: /^(1|true|yes)$/i.test(env.ZARINPAL_SANDBOX ?? process.env.ZARINPAL_SANDBOX ?? "") };
}
async function bindings(databaseOverride?: D1Database, secretOverride?: string): Promise<PaymentConfigBindings> {
  return databaseOverride ? { DB: databaseOverride, PAYMENT_CONFIG_ENCRYPTION_KEY: secretOverride }
    : getRuntimeEnv<PaymentConfigBindings>().catch(() => ({}));
}
async function readRow(database: D1Database, provider: string) {
  return database.prepare("SELECT provider, enabled, sandbox, credentials_ciphertext, credentials_iv, updated_at FROM payment_provider_configs WHERE provider = ? LIMIT 1").bind(provider).first<StoredProviderRow>();
}
async function encryptionKey(env: PaymentConfigBindings, secretOverride?: string) {
  const encoded = (secretOverride ?? env.PAYMENT_CONFIG_ENCRYPTION_KEY ?? process.env.PAYMENT_CONFIG_ENCRYPTION_KEY ?? "").trim();
  if (!encoded) throw new PaymentConfigError("PAYMENT_CONFIG_ENCRYPTION_KEY_MISSING");
  let raw: Uint8Array<ArrayBuffer>;
  try { raw = /^[a-f0-9]{64}$/i.test(encoded) ? Uint8Array.from(encoded.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16)) : base64ToBytes(encoded); }
  catch { throw new PaymentConfigError("PAYMENT_CONFIG_ENCRYPTION_KEY_INVALID"); }
  if (raw.byteLength !== 32) throw new PaymentConfigError("PAYMENT_CONFIG_ENCRYPTION_KEY_INVALID");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const aad = (provider: string) => new TextEncoder().encode("miran-payment-provider:" + provider + ":v1");
async function encryptCredentials(provider: string, document: VaultDocument, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(provider) }, key, new TextEncoder().encode(JSON.stringify(document)));
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv) };
}
async function decryptCredentials(row: StoredProviderRow, key: CryptoKey): Promise<VaultDocument> {
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(row.credentials_iv), additionalData: aad(row.provider) }, key, base64ToBytes(row.credentials_ciphertext));
  const document: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new PaymentConfigError("PAYMENT_CREDENTIALS_UNREADABLE");
  return document as VaultDocument;
}
function bytesToBase64(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}
function base64ToBytes(value: string) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
