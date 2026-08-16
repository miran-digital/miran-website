import { S3PrivateObjectStorage } from "./private-object-storage.js";

function fail(message, code = "STORAGE_ERROR") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function encodedPath(key) {
  return String(key)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export class S3PublicAssetStorage extends S3PrivateObjectStorage {
  constructor({
    endpoint = process.env.MIRAN_PUBLIC_MEDIA_ENDPOINT,
    bucket = process.env.MIRAN_PUBLIC_MEDIA_BUCKET,
    region = process.env.MIRAN_PUBLIC_MEDIA_REGION || "auto",
    accessKeyId = process.env.MIRAN_PUBLIC_MEDIA_ACCESS_KEY_ID,
    secretAccessKey = process.env.MIRAN_PUBLIC_MEDIA_SECRET_ACCESS_KEY,
    forcePathStyle = bool(process.env.MIRAN_PUBLIC_MEDIA_FORCE_PATH_STYLE, false),
    uploadExpiresSeconds = process.env.MIRAN_PUBLIC_MEDIA_UPLOAD_EXPIRES_SECONDS,
    publicBaseUrl = process.env.MIRAN_PUBLIC_MEDIA_BASE_URL,
    now,
    fetchImpl,
  } = {}) {
    super({
      endpoint,
      bucket,
      region,
      accessKeyId,
      secretAccessKey,
      forcePathStyle,
      uploadExpiresSeconds,
      downloadExpiresSeconds: 300,
      now,
      fetchImpl,
    });
    this.publicBaseUrl = String(publicBaseUrl || "").replace(/\/+$/, "");
  }

  requireConfigured() {
    super.requireConfigured();
    if (!this.publicBaseUrl) {
      fail("Public media base URL is not configured", "STORAGE_NOT_CONFIGURED");
    }
    const url = new URL(this.publicBaseUrl);
    if (url.search || url.hash) {
      fail("Public media base URL must not contain query or hash", "STORAGE_CONFIG_INVALID");
    }
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      fail("Production public media URL must use HTTPS", "STORAGE_CONFIG_INVALID");
    }
  }

  validatePrivateKey(key) {
    const value = String(key || "");
    if (
      !value.startsWith("public/") ||
      value.length > 900 ||
      value.includes("..") ||
      value.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(value)
    ) {
      fail("Invalid public asset key", "STORAGE_KEY_INVALID");
    }
    return value;
  }

  issueAssetUpload({ key, mimeType, sha256 }) {
    return this.issueUpload({ key, mimeType, sha256 });
  }

  publicUrl(key) {
    this.requireConfigured();
    const validKey = this.validatePrivateKey(key);
    return `${this.publicBaseUrl}/${encodedPath(validKey)}`;
  }
}
