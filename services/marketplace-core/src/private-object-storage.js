import { createHash, createHmac } from "node:crypto";

function fail(message, code = "STORAGE_ERROR") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function encodeRfc3986(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function normalizeHeaderValue(value) {
  return String(value).trim().replace(/\s+/g, " ");
}

function amzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function dateStamp(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function safeExpiry(value, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number) || number < 30 || number > 3600) {
    fail("Storage signed URL expiry must be between 30 and 3600 seconds", "STORAGE_CONFIG_INVALID");
  }
  return number;
}

export class S3PrivateObjectStorage {
  constructor({
    endpoint = process.env.MIRAN_OBJECT_STORAGE_ENDPOINT,
    bucket = process.env.MIRAN_OBJECT_STORAGE_BUCKET,
    region = process.env.MIRAN_OBJECT_STORAGE_REGION || "auto",
    accessKeyId = process.env.MIRAN_OBJECT_STORAGE_ACCESS_KEY_ID,
    secretAccessKey = process.env.MIRAN_OBJECT_STORAGE_SECRET_ACCESS_KEY,
    forcePathStyle = parseBoolean(process.env.MIRAN_OBJECT_STORAGE_FORCE_PATH_STYLE, false),
    uploadExpiresSeconds = process.env.MIRAN_OBJECT_STORAGE_UPLOAD_EXPIRES_SECONDS,
    downloadExpiresSeconds = process.env.MIRAN_OBJECT_STORAGE_DOWNLOAD_EXPIRES_SECONDS,
    now = () => new Date(),
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.endpoint = String(endpoint || "").replace(/\/+$/, "");
    this.bucket = String(bucket || "").trim();
    this.region = String(region || "auto").trim();
    this.accessKeyId = String(accessKeyId || "").trim();
    this.secretAccessKey = String(secretAccessKey || "");
    this.forcePathStyle = Boolean(forcePathStyle);
    this.uploadExpiresSeconds = safeExpiry(uploadExpiresSeconds, 600);
    this.downloadExpiresSeconds = safeExpiry(downloadExpiresSeconds, 300);
    this.now = now;
    this.fetchImpl = fetchImpl;
  }

  isConfigured() {
    return Boolean(
      this.endpoint &&
        this.bucket &&
        this.region &&
        this.accessKeyId &&
        this.secretAccessKey,
    );
  }

  requireConfigured() {
    if (!this.isConfigured()) {
      fail(
        "Private object storage is not configured",
        "STORAGE_NOT_CONFIGURED",
      );
    }
    const endpoint = new URL(this.endpoint);
    if (endpoint.search || endpoint.hash) {
      fail("Object storage endpoint must not contain query or hash", "STORAGE_CONFIG_INVALID");
    }
    if (process.env.NODE_ENV === "production" && endpoint.protocol !== "https:") {
      fail("Production object storage endpoint must use HTTPS", "STORAGE_CONFIG_INVALID");
    }
  }

  validatePrivateKey(key) {
    const value = String(key || "");
    if (
      !value.startsWith("private/") ||
      value.length > 900 ||
      value.includes("..") ||
      value.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(value)
    ) {
      fail("Invalid private object key", "STORAGE_KEY_INVALID");
    }
    return value;
  }

  objectTarget(key) {
    this.requireConfigured();
    const privateKey = this.validatePrivateKey(key);
    const endpoint = new URL(this.endpoint);
    const encodedKey = privateKey.split("/").map(encodeRfc3986).join("/");
    const basePath = endpoint.pathname.replace(/\/+$/, "");

    if (this.forcePathStyle) {
      return {
        origin: `${endpoint.protocol}//${endpoint.host}`,
        host: endpoint.host,
        pathname: `${basePath}/${encodeRfc3986(this.bucket)}/${encodedKey}`.replace(/\/{2,}/g, "/"),
      };
    }

    return {
      origin: `${endpoint.protocol}//${this.bucket}.${endpoint.host}`,
      host: `${this.bucket}.${endpoint.host}`,
      pathname: `${basePath}/${encodedKey}`.replace(/\/{2,}/g, "/"),
    };
  }

  signingKey(stamp) {
    const kDate = hmac(`AWS4${this.secretAccessKey}`, stamp);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, "s3");
    return hmac(kService, "aws4_request");
  }

  presign({ method, key, expiresSeconds, headers = {} }) {
    const target = this.objectTarget(key);
    const date = this.now();
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      fail("Invalid storage signing clock", "STORAGE_CONFIG_INVALID");
    }

    const timestamp = amzDate(date);
    const stamp = dateStamp(date);
    const scope = `${stamp}/${this.region}/s3/aws4_request`;
    const normalizedHeaders = new Map([["host", target.host]]);
    for (const [name, value] of Object.entries(headers)) {
      const lower = name.toLowerCase();
      if (lower === "authorization" || lower === "host") continue;
      normalizedHeaders.set(lower, normalizeHeaderValue(value));
    }
    const sortedHeaderNames = [...normalizedHeaders.keys()].sort();
    const canonicalHeaders = sortedHeaderNames
      .map((name) => `${name}:${normalizeHeaderValue(normalizedHeaders.get(name))}\n`)
      .join("");
    const signedHeaders = sortedHeaderNames.join(";");

    const query = new Map([
      ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
      ["X-Amz-Credential", `${this.accessKeyId}/${scope}`],
      ["X-Amz-Date", timestamp],
      ["X-Amz-Expires", String(expiresSeconds)],
      ["X-Amz-SignedHeaders", signedHeaders],
    ]);
    const canonicalQuery = [...query.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
      .join("&");

    const canonicalRequest = [
      String(method).toUpperCase(),
      target.pathname,
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
    const signature = createHmac("sha256", this.signingKey(stamp))
      .update(stringToSign)
      .digest("hex");

    return {
      url: `${target.origin}${target.pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`,
      expiresAt: new Date(date.getTime() + expiresSeconds * 1000).toISOString(),
      signedHeaders,
    };
  }

  issueUpload({ key, mimeType, sha256 }) {
    const type = String(mimeType || "").trim().toLowerCase();
    const digest = String(sha256 || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(digest)) {
      fail("Valid SHA-256 is required for storage upload", "STORAGE_HASH_INVALID");
    }
    if (!type) fail("Content type is required for storage upload", "STORAGE_CONTENT_TYPE_INVALID");

    const headers = {
      "content-type": type,
      "x-amz-meta-sha256": digest,
    };
    const signed = this.presign({
      method: "PUT",
      key,
      expiresSeconds: this.uploadExpiresSeconds,
      headers,
    });
    return {
      uploadUrl: signed.url,
      method: "PUT",
      headers,
      expiresAt: signed.expiresAt,
    };
  }

  issueDownload({ key }) {
    const signed = this.presign({
      method: "GET",
      key,
      expiresSeconds: this.downloadExpiresSeconds,
    });
    return {
      downloadUrl: signed.url,
      expiresAt: signed.expiresAt,
    };
  }

  async verifyObject({ key, mimeType, sizeBytes, sha256 }) {
    const signed = this.presign({ method: "HEAD", key, expiresSeconds: 60 });
    const response = await this.fetchImpl(signed.url, {
      method: "HEAD",
      redirect: "error",
    });
    if (!response.ok) {
      fail("Uploaded object could not be verified", "STORAGE_OBJECT_NOT_FOUND");
    }

    const actualLength = Number(response.headers.get("content-length"));
    if (!Number.isSafeInteger(actualLength) || actualLength !== Number(sizeBytes)) {
      fail("Uploaded object size does not match the upload request", "STORAGE_OBJECT_MISMATCH");
    }
    const actualType = String(response.headers.get("content-type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (actualType !== String(mimeType || "").trim().toLowerCase()) {
      fail("Uploaded object content type does not match", "STORAGE_OBJECT_MISMATCH");
    }
    const actualHash = String(response.headers.get("x-amz-meta-sha256") || "")
      .trim()
      .toLowerCase();
    if (actualHash !== String(sha256 || "").trim().toLowerCase()) {
      fail("Uploaded object SHA-256 does not match", "STORAGE_OBJECT_MISMATCH");
    }
    return true;
  }
}
