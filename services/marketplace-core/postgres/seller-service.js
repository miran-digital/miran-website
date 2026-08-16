import { randomUUID } from "node:crypto";
import { withPostgresTransaction } from "./database.js";

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function assert(condition, message, code = "INVALID_INPUT") {
  if (!condition) fail(message, code);
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapDocument(row) {
  return {
    id: row.id,
    kind: row.kind,
    storage_key: row.storage_key,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes),
    sha256: row.sha256,
    status: row.status,
    created_at: iso(row.created_at),
  };
}

function mapGuarantee(row) {
  return {
    id: row.id,
    kind: row.kind,
    reference: row.reference,
    amount_irr: row.amount_irr === null ? null : Number(row.amount_irr),
    status: row.status,
    created_at: iso(row.created_at),
  };
}

function mapSeller(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    business_name: row.business_name,
    legal_name: row.legal_name,
    national_id: row.national_id,
    status: row.status,
    reviewed_by: row.reviewed_by,
    reviewed_at: iso(row.reviewed_at),
    rejection_reason: row.rejection_reason,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

export class PostgresSellerService {
  constructor(pool) {
    this.pool = pool;
  }

  async actor(actorId, { admin = false } = {}) {
    const result = await this.pool.query(
      "SELECT id,role,status FROM users WHERE id=$1",
      [actorId],
    );
    const actor = result.rows[0];
    assert(actor && actor.status === "ACTIVE", "Actor not found", "FORBIDDEN");
    if (admin) assert(actor.role === "ADMIN", "Admin role required", "FORBIDDEN");
    return actor;
  }

  async requestSeller(userId, { businessName, legalName = null, nationalId = null }) {
    await this.actor(userId);
    const business = String(businessName || "").trim();
    assert(business && business.length <= 180, "Business name is required");
    const existing = await this.pool.query(
      "SELECT * FROM sellers WHERE user_id=$1",
      [userId],
    );
    if (existing.rows[0]) return this.withEvidence(existing.rows[0]);
    const id = randomUUID();
    try {
      const inserted = await this.pool.query(
        `INSERT INTO sellers(id,user_id,business_name,legal_name,national_id)
         VALUES($1,$2,$3,$4,$5)
         RETURNING *`,
        [
          id,
          userId,
          business,
          legalName ? String(legalName).trim().slice(0, 180) : null,
          nationalId ? String(nationalId).trim().slice(0, 120) : null,
        ],
      );
      return this.withEvidence(inserted.rows[0]);
    } catch (error) {
      if (error?.code === "23505") {
        const raced = await this.pool.query("SELECT * FROM sellers WHERE user_id=$1", [userId]);
        if (raced.rows[0]) return this.withEvidence(raced.rows[0]);
      }
      throw error;
    }
  }

  async sellerByUser(userId) {
    const result = await this.pool.query("SELECT * FROM sellers WHERE user_id=$1", [userId]);
    assert(result.rows[0], "Seller application not found", "NOT_FOUND");
    return result.rows[0];
  }

  async sellerById(sellerId, client = this.pool) {
    const result = await client.query("SELECT * FROM sellers WHERE id=$1", [sellerId]);
    assert(result.rows[0], "Seller not found", "NOT_FOUND");
    return result.rows[0];
  }

  async getMine(userId) {
    await this.actor(userId);
    return this.withEvidence(await this.sellerByUser(userId));
  }

  async listManaged(adminId) {
    await this.actor(adminId, { admin: true });
    const result = await this.pool.query(
      "SELECT * FROM sellers ORDER BY created_at DESC",
    );
    return Promise.all(result.rows.map((seller) => this.withEvidence(seller)));
  }

  async withEvidence(seller, client = this.pool) {
    const [documents, guarantees] = await Promise.all([
      client.query(
        `SELECT id,kind,storage_key,mime_type,size_bytes,sha256,status,created_at
         FROM seller_documents
         WHERE seller_id=$1
         ORDER BY created_at ASC`,
        [seller.id],
      ),
      client.query(
        `SELECT id,kind,reference,amount_irr,status,created_at
         FROM seller_guarantees
         WHERE seller_id=$1
         ORDER BY created_at ASC`,
        [seller.id],
      ),
    ]);
    return {
      ...mapSeller(seller),
      documents: documents.rows.map(mapDocument),
      guarantees: guarantees.rows.map(mapGuarantee),
    };
  }

  async requireEvidenceOwner(userId) {
    await this.actor(userId);
    const seller = await this.sellerByUser(userId);
    assert(
      ["PENDING", "REJECTED"].includes(seller.status),
      "Seller evidence cannot be changed in the current status",
      "CONFLICT",
    );
    return seller;
  }

  async requireApprovedSeller(userId) {
    const actor = await this.actor(userId);
    assert(actor.role === "SELLER", "Seller role required", "FORBIDDEN");
    const seller = await this.sellerByUser(userId);
    assert(seller.status === "APPROVED", "Approved seller required", "FORBIDDEN");
    return seller;
  }

  async addDocument(userId, input) {
    const seller = await this.requireEvidenceOwner(userId);
    const kind = String(input.kind || "").trim();
    const storageKey = String(input.storageKey || "").trim();
    const mimeType = String(input.mimeType || "").trim().toLowerCase();
    const sizeBytes = Number(input.sizeBytes);
    const sha256 = String(input.sha256 || "").trim().toLowerCase();
    assert(kind && kind.length <= 80, "Document kind is required");
    assert(
      storageKey.startsWith(`private/sellers/${seller.id}/`) && storageKey.length <= 500,
      "Seller documents must use the private seller storage namespace",
    );
    assert(
      ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mimeType),
      "Unsupported seller document type",
    );
    assert(
      Number.isSafeInteger(sizeBytes) && sizeBytes > 0 && sizeBytes <= 10_000_000,
      "Seller document must be between 1 byte and 10 MB",
    );
    assert(/^[a-f0-9]{64}$/.test(sha256), "Valid SHA-256 is required");
    const id = randomUUID();
    try {
      const inserted = await this.pool.query(
        `INSERT INTO seller_documents
         (id,seller_id,kind,storage_key,mime_type,size_bytes,sha256)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [id, seller.id, kind, storageKey, mimeType, sizeBytes, sha256],
      );
      return mapDocument(inserted.rows[0]);
    } catch (error) {
      if (error?.code === "23505") fail("Seller document upload was already completed", "CONFLICT");
      throw error;
    }
  }

  async addGuarantee(userId, input) {
    const seller = await this.requireEvidenceOwner(userId);
    const kind = String(input.kind || "").trim();
    const reference = String(input.reference || "").trim();
    const amountIrr = input.amountIrr === null || input.amountIrr === undefined || input.amountIrr === ""
      ? null
      : Number(input.amountIrr);
    assert(kind && kind.length <= 80, "Guarantee kind is required");
    assert(reference && reference.length <= 200, "Guarantee reference is required");
    assert(
      amountIrr === null || (Number.isSafeInteger(amountIrr) && amountIrr >= 0),
      "Guarantee amount must be a non-negative integer IRR value",
    );
    const inserted = await this.pool.query(
      `INSERT INTO seller_guarantees(id,seller_id,kind,reference,amount_irr)
       VALUES($1,$2,$3,$4,$5)
       RETURNING *`,
      [randomUUID(), seller.id, kind, reference, amountIrr],
    );
    return mapGuarantee(inserted.rows[0]);
  }

  async reviewDocument(adminId, documentId, status) {
    await this.actor(adminId, { admin: true });
    assert(["APPROVED", "REJECTED"].includes(status), "Invalid document review status");
    const updated = await this.pool.query(
      "UPDATE seller_documents SET status=$1 WHERE id=$2 RETURNING *",
      [status, documentId],
    );
    assert(updated.rows[0], "Seller document not found", "NOT_FOUND");
    await this.audit(this.pool, adminId, "SELLER_DOCUMENT_REVIEWED", "SELLER_DOCUMENT", documentId, { status });
    return mapDocument(updated.rows[0]);
  }

  async reviewGuarantee(adminId, guaranteeId, status) {
    await this.actor(adminId, { admin: true });
    assert(["APPROVED", "REJECTED"].includes(status), "Invalid guarantee review status");
    const updated = await this.pool.query(
      "UPDATE seller_guarantees SET status=$1 WHERE id=$2 RETURNING *",
      [status, guaranteeId],
    );
    assert(updated.rows[0], "Seller guarantee not found", "NOT_FOUND");
    await this.audit(this.pool, adminId, "SELLER_GUARANTEE_REVIEWED", "SELLER_GUARANTEE", guaranteeId, { status });
    return mapGuarantee(updated.rows[0]);
  }

  async approve(adminId, sellerId) {
    await this.actor(adminId, { admin: true });
    return withPostgresTransaction(this.pool, async (client) => {
      const sellerResult = await client.query(
        "SELECT * FROM sellers WHERE id=$1 FOR UPDATE",
        [sellerId],
      );
      const seller = sellerResult.rows[0];
      assert(seller, "Seller not found", "NOT_FOUND");
      const [documents, guarantees] = await Promise.all([
        client.query("SELECT status FROM seller_documents WHERE seller_id=$1", [sellerId]),
        client.query("SELECT status FROM seller_guarantees WHERE seller_id=$1", [sellerId]),
      ]);
      assert(
        documents.rowCount > 0 && documents.rows.every((item) => item.status === "APPROVED"),
        "All submitted seller documents must be approved before seller approval",
        "CONFLICT",
      );
      assert(
        guarantees.rowCount > 0 && guarantees.rows.every((item) => item.status === "APPROVED"),
        "All submitted seller guarantees must be approved before seller approval",
        "CONFLICT",
      );
      const updated = await client.query(
        `UPDATE sellers
         SET status='APPROVED',reviewed_by=$1,reviewed_at=CURRENT_TIMESTAMP,
             rejection_reason=NULL,updated_at=CURRENT_TIMESTAMP
         WHERE id=$2
         RETURNING *`,
        [adminId, sellerId],
      );
      await client.query(
        "UPDATE users SET role='SELLER',updated_at=CURRENT_TIMESTAMP WHERE id=$1",
        [seller.user_id],
      );
      await this.audit(client, adminId, "SELLER_APPROVED", "SELLER", sellerId, {
        userId: seller.user_id,
      });
      return this.withEvidence(updated.rows[0], client);
    });
  }

  async reject(adminId, sellerId, reason) {
    await this.actor(adminId, { admin: true });
    const rejectionReason = String(reason || "").trim();
    assert(
      rejectionReason && rejectionReason.length <= 500,
      "Rejection reason is required",
    );
    return withPostgresTransaction(this.pool, async (client) => {
      const seller = await this.sellerById(sellerId, client);
      const updated = await client.query(
        `UPDATE sellers
         SET status='REJECTED',reviewed_by=$1,reviewed_at=CURRENT_TIMESTAMP,
             rejection_reason=$2,updated_at=CURRENT_TIMESTAMP
         WHERE id=$3 RETURNING *`,
        [adminId, rejectionReason, sellerId],
      );
      await client.query(
        "UPDATE users SET role='CUSTOMER',updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND role='SELLER'",
        [seller.user_id],
      );
      await this.audit(client, adminId, "SELLER_REJECTED", "SELLER", sellerId, {
        reason: rejectionReason,
      });
      return this.withEvidence(updated.rows[0], client);
    });
  }

  async suspend(adminId, sellerId, reason = "") {
    await this.actor(adminId, { admin: true });
    const note = String(reason || "").trim().slice(0, 500);
    return withPostgresTransaction(this.pool, async (client) => {
      const seller = await this.sellerById(sellerId, client);
      const updated = await client.query(
        `UPDATE sellers
         SET status='SUSPENDED',reviewed_by=$1,reviewed_at=CURRENT_TIMESTAMP,
             rejection_reason=$2,updated_at=CURRENT_TIMESTAMP
         WHERE id=$3 RETURNING *`,
        [adminId, note || null, sellerId],
      );
      await client.query(
        "UPDATE users SET role='CUSTOMER',updated_at=CURRENT_TIMESTAMP WHERE id=$1",
        [seller.user_id],
      );
      await this.audit(client, adminId, "SELLER_SUSPENDED", "SELLER", sellerId, {
        reason: note,
      });
      return this.withEvidence(updated.rows[0], client);
    });
  }

  async audit(client, actorUserId, action, entityType, entityId, details = {}) {
    await client.query(
      `INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,details_json)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), actorUserId, action, entityType, entityId, JSON.stringify(details)],
    );
  }
}
