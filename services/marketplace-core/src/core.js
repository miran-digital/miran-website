import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { transaction } from "./database.js";

const HOUR = 60 * 60 * 1000;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function passwordDigest(password, salt) {
  return scryptSync(password, salt, 64);
}

function assert(condition, message, code = "INVALID_INPUT") {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

export function priceProduct(product, at = new Date()) {
  const base = Number(product.base_price_irr);
  assert(Number.isSafeInteger(base) && base >= 0, "Invalid base price");
  const start = product.discount_starts_at ? new Date(product.discount_starts_at) : null;
  const end = product.discount_ends_at ? new Date(product.discount_ends_at) : null;
  const active = (!start || at >= start) && (!end || at < end);
  if (!active || product.discount_type === "NONE") {
    return { baseIrr: base, finalIrr: base, discountIrr: 0 };
  }
  const value = Number(product.discount_value);
  let discount = 0;
  if (product.discount_type === "PERCENTAGE") {
    discount = Math.floor((base * value) / 100);
  }
  if (product.discount_type === "FIXED_IRR") {
    discount = Math.min(base, value);
  }
  const finalIrr = Math.max(0, base - discount);
  return { baseIrr: base, finalIrr, discountIrr: base - finalIrr };
}

export class MarketplaceCore {
  constructor(db, { sessionHours = 720, reservationMinutes = 15 } = {}) {
    this.db = db;
    this.sessionHours = sessionHours;
    this.reservationMinutes = reservationMinutes;
  }

  register({ email, password }) {
    assert(
      typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
      "Email is invalid",
    );
    assert(
      typeof password === "string" && password.length >= 10,
      "Password must be at least 10 characters",
    );
    const normalizedEmail = email.trim().toLowerCase();
    const salt = randomBytes(16).toString("hex");
    const digest = passwordDigest(password, salt).toString("hex");
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO users (id,email,password_salt,password_hash,role) VALUES (?,?,?,?,?)",
      )
      .run(id, normalizedEmail, salt, digest, "CUSTOMER");
    return { id, email: normalizedEmail, role: "CUSTOMER" };
  }

  login({ email, password, now = new Date() }) {
    const user = this.db
      .prepare("SELECT * FROM users WHERE email=? AND status='ACTIVE'")
      .get(String(email).trim().toLowerCase());
    assert(user, "Invalid credentials", "UNAUTHORIZED");
    const expected = Buffer.from(user.password_hash, "hex");
    const actual = passwordDigest(String(password), user.password_salt);
    assert(
      expected.length === actual.length && timingSafeEqual(expected, actual),
      "Invalid credentials",
      "UNAUTHORIZED",
    );
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      now.getTime() + this.sessionHours * HOUR,
    ).toISOString();
    this.db
      .prepare(
        "INSERT INTO sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)",
      )
      .run(randomUUID(), user.id, hashToken(token), expiresAt);
    return {
      token,
      expiresAt,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  authenticate(token, now = new Date()) {
    const row = this.db
      .prepare(
        "SELECT u.id,u.email,u.role,u.status,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?",
      )
      .get(hashToken(String(token)));
    assert(
      row && row.status === "ACTIVE" && new Date(row.expires_at) > now,
      "Session is invalid or expired",
      "UNAUTHORIZED",
    );
    return { id: row.id, email: row.email, role: row.role };
  }

  logout(token) {
    this.db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(hashToken(String(token)));
  }

  addAddress(userId, input) {
    for (const field of [
      "fullName",
      "phone",
      "province",
      "city",
      "addressLine",
      "postalCode",
    ]) {
      assert(String(input[field] || "").trim(), `${field} is required`);
    }
    return transaction(this.db, () => {
      const id = randomUUID();
      if (input.isDefault) {
        this.db
          .prepare("UPDATE addresses SET is_default=0 WHERE user_id=?")
          .run(userId);
      }
      this.db
        .prepare(
          "INSERT INTO addresses (id,user_id,label,full_name,phone,province,city,address_line,postal_code,is_default) VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          userId,
          input.label || "نشانی",
          input.fullName,
          input.phone,
          input.province,
          input.city,
          input.addressLine,
          input.postalCode,
          input.isDefault ? 1 : 0,
        );
      return this.db.prepare("SELECT * FROM addresses WHERE id=?").get(id);
    });
  }

  requestSeller(
    userId,
    { businessName, legalName = null, nationalId = null },
  ) {
    assert(String(businessName || "").trim(), "Business name is required");
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO sellers (id,user_id,business_name,legal_name,national_id) VALUES (?,?,?,?,?)",
      )
      .run(id, userId, businessName, legalName, nationalId);
    return this.db.prepare("SELECT * FROM sellers WHERE id=?").get(id);
  }

  approveSeller(adminId, sellerId) {
    const admin = this.db
      .prepare("SELECT role FROM users WHERE id=? AND status='ACTIVE'")
      .get(adminId);
    assert(admin?.role === "ADMIN", "Admin role required", "FORBIDDEN");
    return transaction(this.db, () => {
      const seller = this.db
        .prepare("SELECT * FROM sellers WHERE id=?")
        .get(sellerId);
      assert(seller, "Seller not found", "NOT_FOUND");
      this.db
        .prepare(
          "UPDATE sellers SET status='APPROVED',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .run(adminId, sellerId);
      this.db
        .prepare(
          "UPDATE users SET role='SELLER',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .run(seller.user_id);
      this.audit(adminId, "SELLER_APPROVED", "SELLER", sellerId, {
        userId: seller.user_id,
      });
      return this.db.prepare("SELECT * FROM sellers WHERE id=?").get(sellerId);
    });
  }

  createProduct(actorId, input) {
    const actor = this.db
      .prepare("SELECT role FROM users WHERE id=? AND status='ACTIVE'")
      .get(actorId);
    assert(
      actor && ["ADMIN", "SELLER"].includes(actor.role),
      "Seller or admin role required",
      "FORBIDDEN",
    );
    if (input.sellerId) {
      const seller = this.db
        .prepare("SELECT * FROM sellers WHERE id=? AND status='APPROVED'")
        .get(input.sellerId);
      assert(seller, "Approved seller required", "FORBIDDEN");
      if (actor.role === "SELLER") {
        assert(
          seller.user_id === actorId,
          "Seller cannot create products for another seller",
          "FORBIDDEN",
        );
      }
    }
    assert(
      Number.isSafeInteger(input.basePriceIrr) && input.basePriceIrr >= 0,
      "Price must be an integer IRR amount",
    );
    const discountType = input.discountType || "NONE";
    const discountValue = Number(input.discountValue || 0);
    assert(
      ["NONE", "PERCENTAGE", "FIXED_IRR"].includes(discountType),
      "Invalid discount type",
    );
    assert(
      Number.isSafeInteger(discountValue) && discountValue >= 0,
      "Invalid discount value",
    );
    if (discountType === "PERCENTAGE") {
      assert(discountValue <= 100, "Percentage discount cannot exceed 100");
    }
    if (discountType === "FIXED_IRR") {
      assert(
        discountValue <= input.basePriceIrr,
        "Fixed discount cannot exceed base price",
      );
    }
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO products (id,seller_id,category_id,title,slug,description,base_price_irr,discount_type,discount_value,discount_starts_at,discount_ends_at,is_amazing,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        input.sellerId || null,
        input.categoryId || null,
        input.title,
        input.slug,
        input.description || "",
        input.basePriceIrr,
        discountType,
        discountValue,
        input.discountStartsAt || null,
        input.discountEndsAt || null,
        input.isAmazing ? 1 : 0,
        input.status || "DRAFT",
      );
    this.db
      .prepare(
        "INSERT INTO inventory (product_id,stock_on_hand,stock_reserved) VALUES (?,?,0)",
      )
      .run(id, Number(input.stockOnHand || 0));
    this.audit(actorId, "PRODUCT_CREATED", "PRODUCT", id, {
      status: input.status || "DRAFT",
    });
    return this.getProduct(id);
  }

  getProduct(id) {
    const product = this.db
      .prepare("SELECT * FROM products WHERE id=?")
      .get(id);
    assert(product, "Product not found", "NOT_FOUND");
    return { ...product, pricing: priceProduct(product) };
  }

  releaseExpiredReservations(now = new Date()) {
    return transaction(this.db, () => {
      const expired = this.db
        .prepare(
          "SELECT * FROM inventory_reservations WHERE status='ACTIVE' AND expires_at<=?",
        )
        .all(now.toISOString());
      for (const reservation of expired) {
        this.db
          .prepare(
            "UPDATE inventory SET stock_reserved=stock_reserved-?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE product_id=? AND stock_reserved>=?",
          )
          .run(
            reservation.quantity,
            reservation.product_id,
            reservation.quantity,
          );
        this.db
          .prepare(
            "UPDATE inventory_reservations SET status='RELEASED' WHERE id=? AND status='ACTIVE'",
          )
          .run(reservation.id);
        this.db
          .prepare(
            "UPDATE orders SET status='PAYMENT_FAILED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING_PAYMENT'",
          )
          .run(reservation.order_id);
      }
      return expired.length;
    });
  }

  createOrder(userId, { addressId, items, idempotencyKey, now = new Date() }) {
    assert(
      String(idempotencyKey || "").length >= 8,
      "Idempotency key is required",
    );
    assert(Array.isArray(items) && items.length > 0, "Order must contain items");
    this.releaseExpiredReservations(now);
    const existing = this.db
      .prepare(
        "SELECT * FROM orders WHERE user_id=? AND idempotency_key=?",
      )
      .get(userId, idempotencyKey);
    if (existing) return existing;

    return transaction(this.db, () => {
      const address = this.db
        .prepare("SELECT id FROM addresses WHERE id=? AND user_id=?")
        .get(addressId, userId);
      assert(address, "Address not found", "NOT_FOUND");
      let subtotal = 0;
      let discount = 0;
      let total = 0;
      const lines = [];
      for (const item of items) {
        assert(
          Number.isSafeInteger(item.quantity) && item.quantity > 0,
          "Quantity must be positive integer",
        );
        const product = this.db
          .prepare("SELECT * FROM products WHERE id=? AND status='PUBLISHED'")
          .get(item.productId);
        assert(product, "Published product not found", "NOT_FOUND");
        const inv = this.db
          .prepare("SELECT * FROM inventory WHERE product_id=?")
          .get(item.productId);
        assert(
          inv && inv.stock_on_hand - inv.stock_reserved >= item.quantity,
          "Insufficient stock",
          "OUT_OF_STOCK",
        );
        const pricing = priceProduct(product, now);
        subtotal += pricing.baseIrr * item.quantity;
        discount += pricing.discountIrr * item.quantity;
        total += pricing.finalIrr * item.quantity;
        lines.push({ product, pricing, quantity: item.quantity });
      }
      const orderId = randomUUID();
      this.db
        .prepare(
          "INSERT INTO orders (id,user_id,address_id,idempotency_key,status,subtotal_irr,discount_irr,total_irr) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(
          orderId,
          userId,
          addressId,
          idempotencyKey,
          "PENDING_PAYMENT",
          subtotal,
          discount,
          total,
        );
      const expiresAt = new Date(
        now.getTime() + this.reservationMinutes * 60000,
      ).toISOString();
      for (const line of lines) {
        this.db
          .prepare(
            "UPDATE inventory SET stock_reserved=stock_reserved+?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE product_id=?",
          )
          .run(line.quantity, line.product.id);
        this.db
          .prepare(
            "INSERT INTO order_items (id,order_id,product_id,title_snapshot,unit_base_price_irr,unit_final_price_irr,quantity,line_total_irr) VALUES (?,?,?,?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            orderId,
            line.product.id,
            line.product.title,
            line.pricing.baseIrr,
            line.pricing.finalIrr,
            line.quantity,
            line.pricing.finalIrr * line.quantity,
          );
        this.db
          .prepare(
            "INSERT INTO inventory_reservations (id,order_id,product_id,quantity,status,expires_at) VALUES (?,?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            orderId,
            line.product.id,
            line.quantity,
            "ACTIVE",
            expiresAt,
          );
      }
      this.audit(userId, "ORDER_CREATED", "ORDER", orderId, {
        totalIrr: total,
      });
      return this.db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
    });
  }

  markOrderPaid(
    orderId,
    { provider, authority = null, referenceId = null, now = new Date() },
  ) {
    this.releaseExpiredReservations(now);
    return transaction(this.db, () => {
      const order = this.db
        .prepare("SELECT * FROM orders WHERE id=?")
        .get(orderId);
      assert(order?.status === "PENDING_PAYMENT", "Order is not payable", "CONFLICT");
      const reservations = this.db
        .prepare(
          "SELECT * FROM inventory_reservations WHERE order_id=? AND status='ACTIVE'",
        )
        .all(orderId);
      assert(reservations.length > 0, "No active reservation", "CONFLICT");
      for (const reservation of reservations) {
        const inv = this.db
          .prepare("SELECT * FROM inventory WHERE product_id=?")
          .get(reservation.product_id);
        assert(
          inv.stock_reserved >= reservation.quantity &&
            inv.stock_on_hand >= reservation.quantity,
          "Inventory invariant violated",
          "CONFLICT",
        );
        this.db
          .prepare(
            "UPDATE inventory SET stock_on_hand=stock_on_hand-?,stock_reserved=stock_reserved-?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE product_id=?",
          )
          .run(
            reservation.quantity,
            reservation.quantity,
            reservation.product_id,
          );
      }
      this.db
        .prepare(
          "UPDATE inventory_reservations SET status='CONSUMED' WHERE order_id=? AND status='ACTIVE'",
        )
        .run(orderId);
      this.db
        .prepare(
          "UPDATE orders SET status='PAID',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .run(orderId);
      this.db
        .prepare(
          "INSERT INTO payments (id,order_id,provider,amount_irr,status,authority,reference_id) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          randomUUID(),
          orderId,
          provider,
          order.total_irr,
          "VERIFIED",
          authority,
          referenceId,
        );
      return this.db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
    });
  }

  audit(actorUserId, action, entityType, entityId, details = {}) {
    this.db
      .prepare(
        "INSERT INTO audit_log (id,actor_user_id,action,entity_type,entity_id,details_json) VALUES (?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        actorUserId || null,
        action,
        entityType,
        entityId || null,
        JSON.stringify(details),
      );
  }
}
