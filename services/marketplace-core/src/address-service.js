import { transaction } from "./database.js";

function assert(condition, message, code = "INVALID_INPUT") {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

export class AddressService {
  constructor(db) {
    this.db = db;
  }

  list(userId) {
    return this.db
      .prepare("SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC, created_at DESC")
      .all(userId);
  }

  setDefault(userId, addressId) {
    return transaction(this.db, () => {
      const address = this.db
        .prepare("SELECT * FROM addresses WHERE id=? AND user_id=?")
        .get(addressId, userId);
      assert(address, "Address not found", "NOT_FOUND");
      this.db.prepare("UPDATE addresses SET is_default=0,updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(userId);
      this.db.prepare("UPDATE addresses SET is_default=1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").run(addressId, userId);
      return this.db.prepare("SELECT * FROM addresses WHERE id=?").get(addressId);
    });
  }

  remove(userId, addressId) {
    return transaction(this.db, () => {
      const address = this.db
        .prepare("SELECT * FROM addresses WHERE id=? AND user_id=?")
        .get(addressId, userId);
      assert(address, "Address not found", "NOT_FOUND");

      const orderUsage = this.db
        .prepare("SELECT COUNT(*) AS n FROM orders WHERE address_id=? AND user_id=?")
        .get(addressId, userId);
      assert(orderUsage.n === 0, "Address is attached to an order and cannot be deleted", "CONFLICT");

      this.db.prepare("DELETE FROM addresses WHERE id=? AND user_id=?").run(addressId, userId);
      if (address.is_default) {
        const replacement = this.db
          .prepare("SELECT id FROM addresses WHERE user_id=? ORDER BY created_at DESC LIMIT 1")
          .get(userId);
        if (replacement) {
          this.db.prepare("UPDATE addresses SET is_default=1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(replacement.id);
        }
      }
      return { deleted: true, id: addressId };
    });
  }
}
