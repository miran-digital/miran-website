import { randomUUID } from "node:crypto";
import { withPostgresTransaction } from "./database.js";

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

export class PostgresProductMediaUploadService {
  constructor(pool, catalogService, publicStorage) {
    this.pool = pool;
    this.catalog = catalogService;
    this.publicStorage = publicStorage;
  }

  async issueUploadTicket(actorId, productId, input) {
    await this.catalog.requireManageable(actorId, productId);
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
    await this.catalog.requireManageable(actorId, productId);
    const media = validate(input);
    const storageKey = String(input.storageKey || "").trim();
    if (!storageKey.startsWith(`public/products/${productId}/`)) {
      fail("Product media key does not belong to this product", "FORBIDDEN");
    }

    const existing = await this.pool.query(
      "SELECT * FROM product_media WHERE storage_key=$1",
      [storageKey],
    );
    if (existing.rows[0]) return { media: existing.rows[0], alreadyCompleted: true };

    await this.publicStorage.verifyObject({
      key: storageKey,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      sha256: media.sha256,
    });
    const url = this.publicStorage.publicUrl(storageKey);

    return withPostgresTransaction(this.pool, async (client) => {
      await this.catalog.requireManageable(actorId, productId, client, { forUpdate: true });
      const duplicate = await client.query(
        "SELECT * FROM product_media WHERE storage_key=$1",
        [storageKey],
      );
      if (duplicate.rows[0]) return { media: duplicate.rows[0], alreadyCompleted: true };
      if (media.isPrimary) {
        await client.query(
          "UPDATE product_media SET is_primary=FALSE WHERE product_id=$1 AND media_type='IMAGE' AND is_primary=TRUE",
          [productId],
        );
      }
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO product_media
         (id,product_id,media_type,url,sort_order,is_primary,storage_key,mime_type,size_bytes,sha256)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          id,
          productId,
          media.mediaType,
          url,
          media.sortOrder,
          media.isPrimary,
          storageKey,
          media.mimeType,
          media.sizeBytes,
          media.sha256,
        ],
      );
      await client.query(
        `INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,details_json)
         VALUES($1,$2,'PRODUCT_MEDIA_UPLOADED','PRODUCT_MEDIA',$3,$4)`,
        [
          randomUUID(),
          actorId,
          id,
          JSON.stringify({ productId, mediaType: media.mediaType, storageKey, sizeBytes: media.sizeBytes }),
        ],
      );
      return { media: inserted.rows[0], alreadyCompleted: false };
    });
  }
}
