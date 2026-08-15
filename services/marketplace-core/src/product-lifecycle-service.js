import { randomUUID } from "node:crypto";
import { transaction } from "./database.js";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireManageable(db, actorId, productId) {
  const actor = db.prepare("SELECT id,role,status FROM users WHERE id=?").get(actorId);
  if (!actor || actor.status !== "ACTIVE") fail("Actor not found", "FORBIDDEN");
  const product = db.prepare("SELECT * FROM products WHERE id=?").get(productId);
  if (!product) fail("Product not found", "NOT_FOUND");
  if (actor.role === "ADMIN") return product;
  if (actor.role !== "SELLER") fail("Seller or admin role required", "FORBIDDEN");
  const seller = db.prepare(
    "SELECT id FROM sellers WHERE id=? AND user_id=? AND status='APPROVED'",
  ).get(product.seller_id, actorId);
  if (!seller) fail("Seller cannot manage this product", "FORBIDDEN");
  return product;
}

export class ProductLifecycleService {
  constructor(db) {
    this.db = db;
  }

  setArchived(actorId, productId, archived = true) {
    const product = requireManageable(this.db, actorId, productId);
    const nextStatus = archived ? "ARCHIVED" : "DRAFT";
    this.db.prepare(
      "UPDATE products SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(nextStatus, productId);
    this.audit(actorId, archived ? "PRODUCT_ARCHIVED" : "PRODUCT_RESTORED", productId, {
      previousStatus: product.status,
      nextStatus,
    });
    return { id: productId, status: nextStatus };
  }

  removeMedia(actorId, productId, mediaId) {
    requireManageable(this.db, actorId, productId);
    return transaction(this.db, () => {
      const media = this.db.prepare(
        "SELECT * FROM product_media WHERE id=? AND product_id=?",
      ).get(mediaId, productId);
      if (!media) fail("Product media not found", "NOT_FOUND");
      this.db.prepare("DELETE FROM product_media WHERE id=? AND product_id=?").run(mediaId, productId);

      if (media.media_type === "IMAGE" && media.is_primary) {
        const nextImage = this.db.prepare(
          `SELECT id FROM product_media
           WHERE product_id=? AND media_type='IMAGE'
           ORDER BY sort_order ASC,created_at ASC LIMIT 1`,
        ).get(productId);
        if (nextImage) {
          this.db.prepare("UPDATE product_media SET is_primary=1 WHERE id=?").run(nextImage.id);
        }
      }

      this.audit(actorId, "PRODUCT_MEDIA_REMOVED", productId, { mediaId });
      return { deleted: true, id: mediaId, productId };
    });
  }

  audit(actorId, action, productId, details) {
    this.db.prepare(
      "INSERT INTO audit_log (id,actor_user_id,action,entity_type,entity_id,details_json) VALUES (?,?,?,?,?,?)",
    ).run(randomUUID(), actorId, action, "PRODUCT", productId, JSON.stringify(details));
  }
}
