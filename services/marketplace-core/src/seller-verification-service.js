import { randomUUID } from "node:crypto";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireActor(db, actorId) {
  const actor = db.prepare("SELECT id,role,status FROM users WHERE id=?").get(actorId);
  if (!actor || actor.status !== "ACTIVE") fail("Actor not found", "FORBIDDEN");
  return actor;
}

function requireAdmin(db, actorId) {
  const actor = requireActor(db, actorId);
  if (actor.role !== "ADMIN") fail("Admin role required", "FORBIDDEN");
  return actor;
}

export class SellerVerificationService {
  constructor(db) {
    this.db = db;
  }

  getMine(userId) {
    requireActor(this.db, userId);
    const seller = this.db.prepare("SELECT * FROM sellers WHERE user_id=?").get(userId);
    if (!seller) fail("Seller application not found", "NOT_FOUND");
    return this.withEvidence(seller);
  }

  listManaged(actorId) {
    requireAdmin(this.db, actorId);
    return this.db
      .prepare("SELECT * FROM sellers ORDER BY created_at DESC")
      .all()
      .map((seller) => this.withEvidence(seller));
  }

  addDocument(userId, input) {
    const seller = this.requireSellerOwner(userId);
    const kind = String(input.kind || "").trim();
    const storageKey = String(input.storageKey || "").trim();
    const mimeType = String(input.mimeType || "").trim().toLowerCase();
    const sizeBytes = Number(input.sizeBytes);
    const sha256 = String(input.sha256 || "").trim().toLowerCase();
    if (!kind || kind.length > 80) fail("Document kind is required");
    if (!storageKey.startsWith(`private/sellers/${seller.id}/`) || storageKey.length > 500) {
      fail("Seller documents must use the private seller storage namespace");
    }
    const allowedMime = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    if (!allowedMime.has(mimeType)) fail("Unsupported seller document type");
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 10_000_000) {
      fail("Seller document must be between 1 byte and 10 MB");
    }
    if (!/^[a-f0-9]{64}$/.test(sha256)) fail("Valid SHA-256 is required");
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO seller_documents (id,seller_id,kind,storage_key,mime_type,size_bytes,sha256) VALUES (?,?,?,?,?,?,?)",
      )
      .run(id, seller.id, kind, storageKey, mimeType, sizeBytes, sha256);
    return this.db.prepare("SELECT * FROM seller_documents WHERE id=?").get(id);
  }

  addGuarantee(userId, input) {
    const seller = this.requireSellerOwner(userId);
    const kind = String(input.kind || "").trim();
    const reference = String(input.reference || "").trim();
    const amountIrr = input.amountIrr === null || input.amountIrr === undefined || input.amountIrr === "" ? null : Number(input.amountIrr);
    if (!kind || kind.length > 80) fail("Guarantee kind is required");
    if (!reference || reference.length > 200) fail("Guarantee reference is required");
    if (amountIrr !== null && (!Number.isSafeInteger(amountIrr) || amountIrr < 0)) {
      fail("Guarantee amount must be a non-negative integer IRR value");
    }
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO seller_guarantees (id,seller_id,kind,reference,amount_irr) VALUES (?,?,?,?,?)",
      )
      .run(id, seller.id, kind, reference, amountIrr);
    return this.db.prepare("SELECT * FROM seller_guarantees WHERE id=?").get(id);
  }

  reviewDocument(adminId, documentId, status) {
    requireAdmin(this.db, adminId);
    if (!["APPROVED", "REJECTED"].includes(status)) fail("Invalid document review status");
    const document = this.db.prepare("SELECT * FROM seller_documents WHERE id=?").get(documentId);
    if (!document) fail("Seller document not found", "NOT_FOUND");
    this.db.prepare("UPDATE seller_documents SET status=? WHERE id=?").run(status, documentId);
    this.audit(adminId, "SELLER_DOCUMENT_REVIEWED", "SELLER_DOCUMENT", documentId, { status });
    return this.db.prepare("SELECT * FROM seller_documents WHERE id=?").get(documentId);
  }

  reviewGuarantee(adminId, guaranteeId, status) {
    requireAdmin(this.db, adminId);
    if (!["APPROVED", "REJECTED"].includes(status)) fail("Invalid guarantee review status");
    const guarantee = this.db.prepare("SELECT * FROM seller_guarantees WHERE id=?").get(guaranteeId);
    if (!guarantee) fail("Seller guarantee not found", "NOT_FOUND");
    this.db.prepare("UPDATE seller_guarantees SET status=? WHERE id=?").run(status, guaranteeId);
    this.audit(adminId, "SELLER_GUARANTEE_REVIEWED", "SELLER_GUARANTEE", guaranteeId, { status });
    return this.db.prepare("SELECT * FROM seller_guarantees WHERE id=?").get(guaranteeId);
  }

  approve(adminId, sellerId) {
    requireAdmin(this.db, adminId);
    const seller = this.requireSeller(sellerId);
    const documents = this.db.prepare("SELECT status FROM seller_documents WHERE seller_id=?").all(sellerId);
    const guarantees = this.db.prepare("SELECT status FROM seller_guarantees WHERE seller_id=?").all(sellerId);
    if (documents.length === 0 || documents.some((item) => item.status !== "APPROVED")) {
      fail("All submitted seller documents must be approved before seller approval", "CONFLICT");
    }
    if (guarantees.length === 0 || guarantees.some((item) => item.status !== "APPROVED")) {
      fail("All submitted seller guarantees must be approved before seller approval", "CONFLICT");
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "UPDATE sellers SET status='APPROVED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,rejection_reason=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .run(adminId, sellerId);
      this.db.prepare("UPDATE users SET role='SELLER',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(seller.user_id);
      this.audit(adminId, "SELLER_APPROVED", "SELLER", sellerId, { userId: seller.user_id });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.withEvidence(this.requireSeller(sellerId));
  }

  reject(adminId, sellerId, reason) {
    requireAdmin(this.db, adminId);
    const seller = this.requireSeller(sellerId);
    const rejectionReason = String(reason || "").trim();
    if (!rejectionReason || rejectionReason.length > 500) fail("Rejection reason is required");
    this.db
      .prepare(
        "UPDATE sellers SET status='REJECTED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,rejection_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      )
      .run(adminId, rejectionReason, sellerId);
    if (this.db.prepare("SELECT role FROM users WHERE id=?").get(seller.user_id)?.role === "SELLER") {
      this.db.prepare("UPDATE users SET role='CUSTOMER',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(seller.user_id);
    }
    this.audit(adminId, "SELLER_REJECTED", "SELLER", sellerId, { reason: rejectionReason });
    return this.withEvidence(this.requireSeller(sellerId));
  }

  suspend(adminId, sellerId, reason = "") {
    requireAdmin(this.db, adminId);
    const seller = this.requireSeller(sellerId);
    const note = String(reason || "").trim().slice(0, 500);
    this.db
      .prepare(
        "UPDATE sellers SET status='SUSPENDED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,rejection_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      )
      .run(adminId, note || null, sellerId);
    this.db.prepare("UPDATE users SET role='CUSTOMER',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(seller.user_id);
    this.audit(adminId, "SELLER_SUSPENDED", "SELLER", sellerId, { reason: note });
    return this.withEvidence(this.requireSeller(sellerId));
  }

  requireSellerOwner(userId) {
    requireActor(this.db, userId);
    const seller = this.db.prepare("SELECT * FROM sellers WHERE user_id=?").get(userId);
    if (!seller) fail("Seller application not found", "NOT_FOUND");
    if (!["PENDING", "REJECTED"].includes(seller.status)) {
      fail("Seller evidence cannot be changed in the current status", "CONFLICT");
    }
    return seller;
  }

  requireSeller(sellerId) {
    const seller = this.db.prepare("SELECT * FROM sellers WHERE id=?").get(sellerId);
    if (!seller) fail("Seller not found", "NOT_FOUND");
    return seller;
  }

  withEvidence(seller) {
    const documents = this.db
      .prepare("SELECT id,kind,storage_key,mime_type,size_bytes,sha256,status,created_at FROM seller_documents WHERE seller_id=? ORDER BY created_at ASC")
      .all(seller.id);
    const guarantees = this.db
      .prepare("SELECT id,kind,reference,amount_irr,status,created_at FROM seller_guarantees WHERE seller_id=? ORDER BY created_at ASC")
      .all(seller.id);
    return { ...seller, documents, guarantees };
  }

  audit(actorUserId, action, entityType, entityId, details = {}) {
    this.db
      .prepare("INSERT INTO audit_log (id,actor_user_id,action,entity_type,entity_id,details_json) VALUES (?,?,?,?,?,?)")
      .run(randomUUID(), actorUserId, action, entityType, entityId, JSON.stringify(details));
  }
}
