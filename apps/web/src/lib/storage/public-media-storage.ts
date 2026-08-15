import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";

export class MediaStorageError extends Error {
  constructor(
    public readonly code: "STORAGE_NOT_CONFIGURED" | "STORAGE_CONFIG_INVALID" | "STORAGE_OBJECT_MISMATCH",
    message: string,
  ) {
    super(message);
  }
}

type MediaTicket = {
  storageKey: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

const imageExtensions = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function dateStamp(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function amzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function booleanEnv(value: string | undefined) {
  return value?.toLowerCase() === "true";
}

function config() {
  const endpoint = String(process.env.MIRAN_PUBLIC_MEDIA_ENDPOINT || "").replace(/\/+$/, "");
  const bucket = String(process.env.MIRAN_PUBLIC_MEDIA_BUCKET || "").trim();
  const region = String(process.env.MIRAN_PUBLIC_MEDIA_REGION || "auto").trim();
  const accessKeyId = String(process.env.MIRAN_PUBLIC_MEDIA_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.MIRAN_PUBLIC_MEDIA_SECRET_ACCESS_KEY || "");
  const publicBaseUrl = String(process.env.MIRAN_PUBLIC_MEDIA_BASE_URL || "").replace(/\/+$/, "");
  const forcePathStyle = booleanEnv(process.env.MIRAN_PUBLIC_MEDIA_FORCE_PATH_STYLE);
  const expiresSeconds = Number(process.env.MIRAN_PUBLIC_MEDIA_UPLOAD_EXPIRES_SECONDS || 600);

  if (!endpoint || !bucket || !region || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    throw new MediaStorageError("STORAGE_NOT_CONFIGURED", "Public media storage is not configured");
  }
  if (!Number.isSafeInteger(expiresSeconds) || expiresSeconds < 30 || expiresSeconds > 3600) {
    throw new MediaStorageError("STORAGE_CONFIG_INVALID", "Invalid media upload expiry");
  }
  const endpointUrl = new URL(endpoint);
  const publicUrl = new URL(publicBaseUrl);
  if (endpointUrl.search || endpointUrl.hash || publicUrl.search || publicUrl.hash) {
    throw new MediaStorageError("STORAGE_CONFIG_INVALID", "Media URLs must not contain query or hash");
  }
  if (
    process.env.NODE_ENV === "production" &&
    (endpointUrl.protocol !== "https:" || publicUrl.protocol !== "https:")
  ) {
    throw new MediaStorageError("STORAGE_CONFIG_INVALID", "Production media URLs must use HTTPS");
  }
  return {
    endpointUrl,
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
    forcePathStyle,
    expiresSeconds,
  };
}

function validateKey(key: string) {
  if (
    !key.startsWith("public/") ||
    key.length > 900 ||
    key.includes("..") ||
    key.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(key)
  ) {
    throw new MediaStorageError("STORAGE_CONFIG_INVALID", "Invalid media object key");
  }
  return key;
}

function target(key: string) {
  const cfg = config();
  const validKey = validateKey(key);
  const encodedKey = validKey.split("/").map(encodeRfc3986).join("/");
  const basePath = cfg.endpointUrl.pathname.replace(/\/+$/, "");
  if (cfg.forcePathStyle) {
    return {
      cfg,
      origin: `${cfg.endpointUrl.protocol}//${cfg.endpointUrl.host}`,
      host: cfg.endpointUrl.host,
      pathname: `${basePath}/${encodeRfc3986(cfg.bucket)}/${encodedKey}`.replace(/\/{2,}/g, "/"),
    };
  }
  return {
    cfg,
    origin: `${cfg.endpointUrl.protocol}//${cfg.bucket}.${cfg.endpointUrl.host}`,
    host: `${cfg.bucket}.${cfg.endpointUrl.host}`,
    pathname: `${basePath}/${encodedKey}`.replace(/\/{2,}/g, "/"),
  };
}

function signingKey(secretAccessKey: string, region: string, stamp: string) {
  const kDate = hmac(`AWS4${secretAccessKey}`, stamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function presign(
  method: "PUT" | "HEAD",
  key: string,
  headers: Record<string, string>,
  expiresSeconds: number,
) {
  const { cfg, origin, host, pathname } = target(key);
  const now = new Date();
  const timestamp = amzDate(now);
  const stamp = dateStamp(now);
  const scope = `${stamp}/${cfg.region}/s3/aws4_request`;
  const normalizedHeaders = new Map<string, string>([["host", host]]);
  for (const [name, value] of Object.entries(headers)) {
    normalizedHeaders.set(name.toLowerCase(), String(value).trim().replace(/\s+/g, " "));
  }
  const names = [...normalizedHeaders.keys()].sort();
  const canonicalHeaders = names.map((name) => `${name}:${normalizedHeaders.get(name)}\n`).join("");
  const signedHeaders = names.join(";");
  const query = new Map<string, string>([
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${cfg.accessKeyId}/${scope}`],
    ["X-Amz-Date", timestamp],
    ["X-Amz-Expires", String(expiresSeconds)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ]);
  const canonicalQuery = [...query.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
    .join("&");
  const canonicalRequest = [
    method,
    pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = createHmac("sha256", signingKey(cfg.secretAccessKey, cfg.region, stamp))
    .update(stringToSign)
    .digest("hex");
  return {
    url: `${origin}${pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    expiresAt: new Date(now.getTime() + expiresSeconds * 1000).toISOString(),
  };
}

export function issueBannerUploadTicket(
  bannerId: string,
  input: { mimeType: string; sizeBytes: number; sha256: string },
): MediaTicket & { mimeType: string; sizeBytes: number; sha256: string } {
  const mimeType = String(input.mimeType || "").trim().toLowerCase();
  const extension = imageExtensions.get(mimeType);
  const sizeBytes = Number(input.sizeBytes);
  const sha256 = String(input.sha256 || "").trim().toLowerCase();
  if (!extension) throw new MediaStorageError("STORAGE_OBJECT_MISMATCH", "Unsupported banner image type");
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 10_000_000) {
    throw new MediaStorageError("STORAGE_OBJECT_MISMATCH", "Banner image must be at most 10 MB");
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new MediaStorageError("STORAGE_OBJECT_MISMATCH", "Valid SHA-256 is required");
  }
  const storageKey = `public/banners/${encodeURIComponent(bannerId)}/${randomUUID()}.${extension}`;
  const headers = { "content-type": mimeType, "x-amz-meta-sha256": sha256 };
  const cfg = config();
  const signed = presign("PUT", storageKey, headers, cfg.expiresSeconds);
  return {
    storageKey,
    uploadUrl: signed.url,
    method: "PUT",
    headers,
    expiresAt: signed.expiresAt,
    mimeType,
    sizeBytes,
    sha256,
  };
}

export async function verifyPublicMediaObject(input: {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}) {
  const signed = presign("HEAD", input.storageKey, {}, 60);
  const response = await fetch(signed.url, { method: "HEAD", redirect: "error", cache: "no-store" });
  if (!response.ok) {
    throw new MediaStorageError("STORAGE_OBJECT_MISMATCH", "Uploaded media could not be verified");
  }
  const length = Number(response.headers.get("content-length"));
  const type = String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  const digest = String(response.headers.get("x-amz-meta-sha256") || "").trim().toLowerCase();
  if (
    !Number.isSafeInteger(length) ||
    length !== input.sizeBytes ||
    type !== input.mimeType.toLowerCase() ||
    digest !== input.sha256.toLowerCase()
  ) {
    throw new MediaStorageError("STORAGE_OBJECT_MISMATCH", "Uploaded media metadata does not match");
  }
}

export function publicMediaUrl(storageKey: string) {
  const cfg = config();
  const key = validateKey(storageKey);
  return `${cfg.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
