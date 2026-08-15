import { randomUUID } from "node:crypto";

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

function requireAdmin(db, actorId) {
  const actor = db.prepare("SELECT role,status FROM users WHERE id=?").get(actorId);
  if (!actor || actor.status !== "ACTIVE" || actor.role !== "ADMIN") {
    fail("Admin role required", "FORBIDDEN");
  }
}

function validate(input) {
  const mimeType = String(input.mimeType || "").trim().toLowerCase();
  const sizeBytes = Number(input.sizeBytes);
  const sha256 = String(input.sha256 || "").trim().toLowerCase();
  if (!imageTypes.has(mimeType)) fail("Unsupported banner image type");
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 10_000_000) {
    fail("Banner image must be at most 10 MB");
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) fail("Valid SHA-256 is required");
  return { mimeType, sizeBytes, sha256, extension: imageTypes.get(mimeType) };
}

export class BannerMediaUploadService {
  constructor(db, storefrontCmsService, publicStorage) {
    this.db = db;
    this.cms = storefrontCmsService;
    this.publicStorage = publicStorage;
  }

  issueUploadTicket(actorId, bannerId, input) {
    requireAdmin(this.db, actorId);
    this.cms.bannerById(bannerId);
    const image = validate(input);
    const storageKey = `public/banners/${bannerId}/${randomUUID()}.${image.extension}`;
    return {
      storageKey,
      ...image,
      ...this.publicStorage.issueAssetUpload({
        key: storageKey,
        mimeType: image.mimeType,
        sha256: image.sha256,
      }),
    };
  }

  async completeUpload(actorId, bannerId, input) {
    requireAdmin(this.db, actorId);
    this.cms.bannerById(bannerId);
    const image = validate(input);
    const storageKey = String(input.storageKey || "").trim();
    if (!storageKey.startsWith(`public/banners/${bannerId}/`)) {
      fail("Banner image key does not belong to this banner", "FORBIDDEN");
    }

    const existing = this.db
      .prepare("SELECT * FROM storefront_banners WHERE id=? AND storage_key=?")
      .get(bannerId, storageKey);
    if (existing) return { banner: this.cms.bannerById(bannerId), alreadyCompleted: true };

    await this.publicStorage.verifyObject({
      key: storageKey,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      sha256: image.sha256,
    });
    const imageUrl = this.publicStorage.publicUrl(storageKey);

    this.db.prepare(
      `UPDATE storefront_banners
       SET image_url=?,storage_key=?,mime_type=?,size_bytes=?,sha256=?,updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
    ).run(
      imageUrl,
      storageKey,
      image.mimeType,
      image.sizeBytes,
      image.sha256,
      bannerId,
    );
    this.cms.audit(actorId, "BANNER_IMAGE_UPLOADED", "BANNER", bannerId, {
      storageKey,
      sizeBytes: image.sizeBytes,
    });
    return { banner: this.cms.bannerById(bannerId), alreadyCompleted: false };
  }
}
