import { randomUUID } from "node:crypto";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

const allowedMimeTypes = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function validateEvidenceInput(input) {
  const kind = String(input.kind || "").trim();
  const mimeType = String(input.mimeType || "").trim().toLowerCase();
  const sizeBytes = Number(input.sizeBytes);
  const sha256 = String(input.sha256 || "").trim().toLowerCase();

  if (!kind || kind.length > 80) fail("Document kind is required");
  if (!allowedMimeTypes.has(mimeType)) fail("Unsupported seller document type");
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 10_000_000) {
    fail("Seller document must be between 1 byte and 10 MB");
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) fail("Valid SHA-256 is required");

  return { kind, mimeType, sizeBytes, sha256 };
}

function requireAdmin(db, actorId) {
  const actor = db.prepare("SELECT id,role,status FROM users WHERE id=?").get(actorId);
  if (!actor || actor.status !== "ACTIVE" || actor.role !== "ADMIN") {
    fail("Admin role required", "FORBIDDEN");
  }
}

export class SellerDocumentUploadService {
  constructor(db, sellerVerificationService, privateStorage) {
    this.db = db;
    this.sellerVerification = sellerVerificationService;
    this.privateStorage = privateStorage;
  }

  issueUploadTicket(userId, input) {
    const seller = this.sellerVerification.requireSellerOwner(userId);
    const evidence = validateEvidenceInput(input);
    const extension = allowedMimeTypes.get(evidence.mimeType);
    const storageKey = `private/sellers/${seller.id}/${randomUUID()}.${extension}`;
    const ticket = this.privateStorage.issueUpload({
      key: storageKey,
      mimeType: evidence.mimeType,
      sha256: evidence.sha256,
    });
    return {
      storageKey,
      kind: evidence.kind,
      mimeType: evidence.mimeType,
      sizeBytes: evidence.sizeBytes,
      sha256: evidence.sha256,
      ...ticket,
    };
  }

  async completeUpload(userId, input) {
    const seller = this.sellerVerification.requireSellerOwner(userId);
    const evidence = validateEvidenceInput(input);
    const storageKey = String(input.storageKey || "").trim();
    if (!storageKey.startsWith(`private/sellers/${seller.id}/`)) {
      fail("Document storage key does not belong to this seller", "FORBIDDEN");
    }

    const duplicate = this.db
      .prepare("SELECT id FROM seller_documents WHERE storage_key=?")
      .get(storageKey);
    if (duplicate) fail("Seller document upload was already completed", "CONFLICT");

    await this.privateStorage.verifyObject({
      key: storageKey,
      mimeType: evidence.mimeType,
      sizeBytes: evidence.sizeBytes,
      sha256: evidence.sha256,
    });

    return this.sellerVerification.addDocument(userId, {
      kind: evidence.kind,
      storageKey,
      mimeType: evidence.mimeType,
      sizeBytes: evidence.sizeBytes,
      sha256: evidence.sha256,
    });
  }

  issueAdminDownloadTicket(adminId, documentId) {
    requireAdmin(this.db, adminId);
    const document = this.db
      .prepare(
        "SELECT id,seller_id,kind,storage_key,mime_type,size_bytes,sha256,status,created_at FROM seller_documents WHERE id=?",
      )
      .get(documentId);
    if (!document) fail("Seller document not found", "NOT_FOUND");
    const ticket = this.privateStorage.issueDownload({ key: document.storage_key });
    return {
      document: {
        id: document.id,
        sellerId: document.seller_id,
        kind: document.kind,
        mimeType: document.mime_type,
        sizeBytes: Number(document.size_bytes),
        status: document.status,
        createdAt: document.created_at,
      },
      ...ticket,
    };
  }
}
