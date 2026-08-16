import { randomUUID } from "node:crypto";
import { transaction } from "./database.js";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

const imageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);
const videoTypes = new Map([
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
]);

function validate(input) {
  const mediaType = String(input.mediaType || "").toUpperCase();
  const mimeType = String(input.mimeType || "").trim().toLowerCase();
  const sizeBytes = Number(input.sizeBytes);
  const sha256 = String(input.sha256 || "").trim().toLowerCase();
  const sortOrder = Number(input.sortOrder || 0);
  const typeMap = mediaType === "IMAGE" ? imageTypes : mediaType === "VIDEO" ? videoTypes : null;
  if (!typeMap) fail("Invalid media type");
  if (!typeMap.has(mimeType)) fail("Unsupported product media content type");
  const limit = mediaType === "IMAGE" ? 10_000_000 : 50_000_000;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > limit) {
    fail(mediaType === "IMAGE" ? "Product image must be at most 10 MB" : "Product video must be at most 50 MB");
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) fail("Valid SHA-256 is required");
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) {
    fail("Invalid media sort order");
  }
  return {
    mediaType,
    mimeType,
    sizeBytes,
    sha256,
    sortOrder,
    isPrimary: mediaType === "IMAGE" && Boolean(input.isPrimary),
    extension: typeMap.get(mimeType),
  };
}

export class ProductMediaUploadService {
  constructor(db, catalogService, publicStorage) {
    this.db = db;
    this.catalog = catalogService;
    this.publicStorage = publicStorage;
  }

  issueUploadTicket(actorId, productId, input) {
    this.catalog.requireManageable(actorId, productId);
    const media = validate(input);
    const storageKey = `public/products/${productId}/${randomUUID()}.${media.extension}`;
    return {
      storageKey,
      ...media,
      ...this.publicStorage.issueAssetUpload({
        key: storageKey,
        mimeType: media.mimeType,
        sha256: media.sha256,
      }),
    };
  }

  async completeUpload(actorId, productId, input) {
    this.catalog.requireManageable(actorId, productId);
    const media = validate(input);
    const storageKey = String(input.storageKey || "").trim();
    if (!storageKey.startsWith(`public/products/${productId}/`)) {
      fail("Product media key does not belong to this product", "FORBIDDEN");
    }

    const existing = this.db
      .prepare("SELECT * FROM product_media WHERE storage_key=?")
      .get(storageKey);
    if (existing) return { media: existing, alreadyCompleted: true };

    await this.publicStorage.verifyObject({
      key: storageKey,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      sha256: media.sha256,
    });
    const url = this.publicStorage.publicUrl(storageKey);

    return transaction(this.db, () => {
      const duplicate = this.db
        .prepare("SELECT * FROM product_media WHERE storage_key=?")
        .get(storageKey);
      if (duplicate) return { media: duplicate, alreadyCompleted: true };

      if (media.isPrimary) {
        this.db
          .prepare("UPDATE product_media SET is_primary=0 WHERE product_id=? AND media_type='IMAGE'")
          .run(productId);
      }
      const id = randomUUID();
      this.db.prepare(
        `INSERT INTO product_media
         (id,product_id,media_type,url,sort_order,is_primary,storage_key,mime_type,size_bytes,sha256)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        productId,
        media.mediaType,
        url,
        media.sortOrder,
        media.isPrimary ? 1 : 0,
        storageKey,
        media.mimeType,
        media.sizeBytes,
        media.sha256,
      );
      const row = this.db.prepare("SELECT * FROM product_media WHERE id=?").get(id);
      this.db.prepare(
        "INSERT INTO audit_log (id,actor_user_id,action,entity_type,entity_id,details_json) VALUES (?,?,?,?,?,?)",
      ).run(
        randomUUID(),
        actorId,
        "PRODUCT_MEDIA_UPLOADED",
        "PRODUCT_MEDIA",
        id,
        JSON.stringify({ productId, mediaType: media.mediaType, storageKey, sizeBytes: media.sizeBytes }),
      );
      return { media: row, alreadyCompleted: false };
    });
  }
}
