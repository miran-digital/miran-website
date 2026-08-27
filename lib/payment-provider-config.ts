import { getRuntimeEnv } from "./runtime-env.ts";

type PaymentConfigBindings = {
  DB?: D1Database;
  PAYMENT_CONFIG_ENCRYPTION_KEY?: string;
};

type StoredProviderRow = {
  provider: string;
  enabled: number;
  sandbox: number;
  credentials_ciphertext: string;
  credentials_iv: string;
};

export type PaymentProviderAdminConfig = {
  provider: "zarinpal";
  enabled: boolean;
  sandbox: boolean;
  configured: boolean;
  credentialHint: string;
  encryptionReady: boolean;
};

type ZarinpalCredentials = { merchantId: string };

const PROVIDER = "zarinpal" as const;
const AAD = new TextEncoder().encode("miran-payment-provider:zarinpal:v1");

export async function getPaymentProviderAdminConfig(
  databaseOverride?: D1Database,
  encryptionSecretOverride?: string,
): Promise<PaymentProviderAdminConfig> {
  const env = databaseOverride
    ? { DB: databaseOverride, PAYMENT_CONFIG_ENCRYPTION_KEY: encryptionSecretOverride }
    : await getRuntimeEnv<PaymentConfigBindings>();
  const row = env.DB ? await readRow(env.DB) : null;
  const key = await getEncryptionKey(env, encryptionSecretOverride).catch(() => null);
  let credentialHint = "";
  if (row?.credentials_ciphertext && row.credentials_iv && key) {
    const credentials = await decryptCredentials(row, key).catch(() => null);
    if (credentials) credentialHint = `••••${credentials.merchantId.slice(-4)}`;
  }
  return {
    provider: PROVIDER,
    enabled: row?.enabled === 1,
    sandbox: row?.sandbox === 1,
    configured: Boolean(row?.credentials_ciphertext && row.credentials_iv),
    credentialHint,
    encryptionReady: Boolean(key),
  };
}

export async function savePaymentProviderAdminConfig(input: {
  enabled: boolean;
  sandbox: boolean;
  merchantId?: string;
  actorEmail: string;
}, databaseOverride?: D1Database, encryptionSecretOverride?: string): Promise<PaymentProviderAdminConfig> {
  const env = databaseOverride
    ? { DB: databaseOverride, PAYMENT_CONFIG_ENCRYPTION_KEY: encryptionSecretOverride }
    : await getRuntimeEnv<PaymentConfigBindings>();
  if (!env.DB) throw new Error("PAYMENT_CONFIG_DATABASE_MISSING");
  const key = await getEncryptionKey(env, encryptionSecretOverride);
  const existing = await readRow(env.DB);
  const merchantId = input.merchantId?.trim() ?? "";
  let credentialsCiphertext = existing?.credentials_ciphertext ?? "";
  let credentialsIv = existing?.credentials_iv ?? "";
  if (merchantId) {
    if (!isValidMerchantId(merchantId)) throw new Error("PAYMENT_MERCHANT_INVALID");
    const encrypted = await encryptCredentials({ merchantId }, key);
    credentialsCiphertext = encrypted.ciphertext;
    credentialsIv = encrypted.iv;
  }
  if (input.enabled && (!credentialsCiphertext || !credentialsIv)) {
    throw new Error("PAYMENT_MERCHANT_REQUIRED");
  }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO payment_provider_configs (
         provider, enabled, sandbox, credentials_ciphertext,
         credentials_iv, updated_at, updated_by
       ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
       ON CONFLICT(provider) DO UPDATE SET
         enabled = excluded.enabled,
         sandbox = excluded.sandbox,
         credentials_ciphertext = excluded.credentials_ciphertext,
         credentials_iv = excluded.credentials_iv,
         updated_at = CURRENT_TIMESTAMP,
         updated_by = excluded.updated_by`,
    ).bind(
      PROVIDER,
      input.enabled ? 1 : 0,
      input.sandbox ? 1 : 0,
      credentialsCiphertext,
      credentialsIv,
      input.actorEmail,
    ),
    env.DB.prepare(
      `INSERT INTO admin_audit_log (actor_email, action, subject_id)
       VALUES (?, 'payment-provider.updated', ?)`,
    ).bind(input.actorEmail, PROVIDER),
  ]);
  return getPaymentProviderAdminConfig(env.DB, encryptionSecretOverride);
}

export async function readZarinpalVaultConfig(
  databaseOverride?: D1Database,
  encryptionSecretOverride?: string,
) {
  const env = databaseOverride
    ? { DB: databaseOverride, PAYMENT_CONFIG_ENCRYPTION_KEY: encryptionSecretOverride }
    : await getRuntimeEnv<PaymentConfigBindings>().catch(
        () => ({} as PaymentConfigBindings),
      );
  if (!env.DB) return null;
  const row = await readRow(env.DB).catch(() => null);
  if (!row) return null;
  if (row.enabled !== 1 || !row.credentials_ciphertext || !row.credentials_iv) {
    return { disabled: true as const };
  }
  const key = await getEncryptionKey(env, encryptionSecretOverride).catch(() => null);
  if (!key) return { disabled: true as const };
  const credentials = await decryptCredentials(row, key).catch(() => null);
  if (!credentials || !isValidMerchantId(credentials.merchantId)) {
    return { disabled: true as const };
  }
  return {
    disabled: false as const,
    merchantId: credentials.merchantId,
    sandbox: row.sandbox === 1,
  };
}

function isValidMerchantId(value: string) {
  return /^[a-f0-9-]{36}$/i.test(value);
}

async function readRow(database: D1Database) {
  return database.prepare(
    `SELECT provider, enabled, sandbox, credentials_ciphertext, credentials_iv
       FROM payment_provider_configs WHERE provider = ? LIMIT 1`,
  ).bind(PROVIDER).first<StoredProviderRow>();
}

async function getEncryptionKey(env: PaymentConfigBindings, secretOverride?: string) {
  const encoded = (
    secretOverride ??
    env.PAYMENT_CONFIG_ENCRYPTION_KEY ??
    process.env.PAYMENT_CONFIG_ENCRYPTION_KEY ??
    ""
  ).trim();
  if (!encoded) throw new Error("PAYMENT_CONFIG_ENCRYPTION_KEY_MISSING");
  const raw = /^[a-f0-9]{64}$/i.test(encoded)
    ? Uint8Array.from(encoded.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16))
    : base64ToBytes(encoded);
  if (raw.byteLength !== 32) throw new Error("PAYMENT_CONFIG_ENCRYPTION_KEY_INVALID");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptCredentials(credentials: ZarinpalCredentials, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(credentials));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: AAD },
    key,
    plaintext,
  );
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv) };
}

async function decryptCredentials(row: StoredProviderRow, key: CryptoKey) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(row.credentials_iv), additionalData: AAD },
    key,
    base64ToBytes(row.credentials_ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as ZarinpalCredentials;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
