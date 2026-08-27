import { getRuntimeEnv } from "../lib/runtime-env.ts";

const CREDENTIAL_ID = "owner";
// Cloudflare Workers caps one PBKDF2 operation at 100,000 iterations.
// Use the maximum supported value and reinforce it with the strict password
// policy plus persistent login rate limits.
const PASSWORD_ITERATIONS = 100_000;
const SESSION_SECONDS = 12 * 60 * 60;

type CredentialRow = {
  username: string;
  password_salt: string;
  password_hash: string;
  password_iterations: number;
  owner_email: string;
  updated_at: string;
};

export type OwnerCredentialStatus = {
  configured: boolean;
  username: string;
  updatedAt: string;
};

export function normalizeOwnerUsername(value: string) {
  return value.trim().toLowerCase();
}

export function ownerUsernameError(value: string) {
  const username = normalizeOwnerUsername(value);
  if (username.length < 4 || username.length > 40) {
    return "نام کاربری باید بین ۴ تا ۴۰ نویسه باشد.";
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(username)) {
    return "نام کاربری فقط می‌تواند شامل حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط باشد.";
  }
  return "";
}

export function ownerPasswordError(value: string, username = "") {
  if (value.length < 12 || value.length > 128) {
    return "رمز مالک باید بین ۱۲ تا ۱۲۸ نویسه باشد.";
  }
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    return "رمز باید شامل حرف کوچک، حرف بزرگ، عدد و نشانه باشد.";
  }
  const normalizedUsername = normalizeOwnerUsername(username);
  if (normalizedUsername.length >= 4 && value.toLowerCase().includes(normalizedUsername)) {
    return "رمز نباید نام کاربری را در خود داشته باشد.";
  }
  return "";
}

export async function getOwnerCredentialStatus(
  databaseOverride?: D1Database,
): Promise<OwnerCredentialStatus> {
  const database = databaseOverride ?? await requireDatabase();
  const row = await database
    .prepare("SELECT username, updated_at FROM admin_owner_credentials WHERE id = ? LIMIT 1")
    .bind(CREDENTIAL_ID)
    .first<{ username: string; updated_at: string }>();
  return {
    configured: Boolean(row),
    username: row?.username ?? "",
    updatedAt: row?.updated_at ?? "",
  };
}

export async function saveOwnerCredential(
  input: {
    username: string;
    password: string;
    ownerEmail: string;
    actorEmail: string;
    currentPassword?: string;
    requireCurrentPassword?: boolean;
  },
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const username = normalizeOwnerUsername(input.username);
  const usernameError = ownerUsernameError(username);
  const passwordError = ownerPasswordError(input.password, username);
  if (usernameError) throw new Error("OWNER_USERNAME_INVALID");
  if (passwordError) throw new Error("OWNER_PASSWORD_INVALID");

  const current = await readCredential(database);
  if (current && input.requireCurrentPassword) {
    const valid = await verifyPassword(input.currentPassword ?? "", current);
    if (!valid) throw new Error("OWNER_CURRENT_PASSWORD_INVALID");
  }

  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bytesToBase64Url(saltBytes);
  const passwordHash = await derivePasswordHash(input.password, saltBytes, PASSWORD_ITERATIONS);
  const ownerEmail = input.ownerEmail.trim().toLowerCase().slice(0, 200);
  const actorEmail = input.actorEmail.trim().toLowerCase().slice(0, 200);
  await database.batch([
    database
      .prepare(
        `INSERT INTO admin_owner_credentials (
           id, username, password_salt, password_hash, password_iterations,
           owner_email, updated_at, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
         ON CONFLICT(id) DO UPDATE SET
           username = excluded.username,
           password_salt = excluded.password_salt,
           password_hash = excluded.password_hash,
           password_iterations = excluded.password_iterations,
           owner_email = excluded.owner_email,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = excluded.updated_by`,
      )
      .bind(
        CREDENTIAL_ID,
        username,
        salt,
        passwordHash,
        PASSWORD_ITERATIONS,
        ownerEmail,
        actorEmail,
      ),
    database.prepare("DELETE FROM admin_owner_sessions"),
    database
      .prepare("INSERT INTO admin_audit_log (actor_email, action, subject_id) VALUES (?, 'owner.credentials-updated', 'owner')")
      .bind(actorEmail),
  ]);
  return { configured: true as const, username };
}

export async function authenticateOwnerCredential(
  usernameValue: string,
  password: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const username = normalizeOwnerUsername(usernameValue);
  const row = await database
    .prepare(
      `SELECT username, password_salt, password_hash, password_iterations,
              owner_email, updated_at
         FROM admin_owner_credentials
        WHERE id = ? AND username = ?
        LIMIT 1`,
    )
    .bind(CREDENTIAL_ID, username)
    .first<CredentialRow>();
  const verificationRow = row ?? {
    username: "missing",
    password_salt: "AAAAAAAAAAAAAAAAAAAAAA",
    password_hash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    password_iterations: PASSWORD_ITERATIONS,
    owner_email: "",
    updated_at: "",
  };
  const valid = await verifyPassword(password, verificationRow);
  if (!row || !valid) return null;
  return { ownerEmail: row.owner_email.trim().toLowerCase(), username: row.username };
}

export async function createOwnerSession(
  ownerEmailValue: string,
  databaseOverride?: D1Database,
) {
  const database = databaseOverride ?? await requireDatabase();
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToBase64Url(tokenBytes);
  const tokenHash = await hashSessionToken(token);
  const ownerEmail = ownerEmailValue.trim().toLowerCase().slice(0, 200);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1_000).toISOString();
  await database.batch([
    database.prepare("DELETE FROM admin_owner_sessions WHERE expires_at <= ?").bind(new Date().toISOString()),
    database
      .prepare(
        `INSERT INTO admin_owner_sessions (
           token_hash, owner_email, expires_at
         ) VALUES (?, ?, ?)`,
      )
      .bind(tokenHash, ownerEmail, expiresAt),
  ]);
  await database
    .prepare(
      `DELETE FROM admin_owner_sessions
        WHERE token_hash NOT IN (
          SELECT token_hash FROM admin_owner_sessions
           WHERE owner_email = ? ORDER BY created_at DESC LIMIT 10
        ) AND owner_email = ?`,
    )
    .bind(ownerEmail, ownerEmail)
    .run();
  return { token, expiresAt, maxAge: SESSION_SECONDS };
}

export async function getOwnerSession(
  token: string,
  databaseOverride?: D1Database,
) {
  if (!token || token.length > 200) return null;
  const database = databaseOverride ?? await requireDatabase();
  const tokenHash = await hashSessionToken(token);
  const row = await database
    .prepare(
      `SELECT owner_email, expires_at
         FROM admin_owner_sessions
        WHERE token_hash = ? AND expires_at > ?
        LIMIT 1`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<{ owner_email: string; expires_at: string }>();
  return row
    ? { ownerEmail: row.owner_email.trim().toLowerCase(), expiresAt: row.expires_at }
    : null;
}

export async function deleteOwnerSession(
  token: string,
  databaseOverride?: D1Database,
) {
  if (!token || token.length > 200) return;
  const database = databaseOverride ?? await requireDatabase();
  await database
    .prepare("DELETE FROM admin_owner_sessions WHERE token_hash = ?")
    .bind(await hashSessionToken(token))
    .run();
}

async function readCredential(database: D1Database) {
  return database
    .prepare(
      `SELECT username, password_salt, password_hash, password_iterations,
              owner_email, updated_at
         FROM admin_owner_credentials WHERE id = ? LIMIT 1`,
    )
    .bind(CREDENTIAL_ID)
    .first<CredentialRow>();
}

async function verifyPassword(password: string, row: CredentialRow) {
  const salt = base64UrlToBytes(row.password_salt);
  const candidate = await derivePasswordHash(password, salt, row.password_iterations);
  return constantTimeEqual(candidate, row.password_hash);
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    256,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

async function hashSessionToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let different = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    different |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return different === 0;
}

function bytesToBase64Url(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function requireDatabase() {
  const bindings = await getRuntimeEnv<{ DB?: D1Database }>();
  if (!bindings.DB) throw new Error("DATABASE_UNAVAILABLE");
  return bindings.DB;
}
