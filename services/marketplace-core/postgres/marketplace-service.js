import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { withPostgresTransaction } from "./database.js";

const scryptAsync = promisify(scrypt);
const HOUR = 60 * 60 * 1000;

function fail(message, code = "INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function assert(condition, message, code = "INVALID_INPUT") {
  if (!condition) fail(message, code);
}

function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

async function passwordDigest(password, salt) {
  return scryptAsync(String(password), String(salt), 64);
}

function money(value, field = "money") {
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number >= 0, `${field} is invalid`);
  return number;
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function priceProduct(row, at = new Date()) {
  const baseIrr = money(row.base_price_irr, "base price");
  const start = row.discount_starts_at ? new Date(row.discount_starts_at) : null;
  const end = row.discount_ends_at ? new Date(row.discount_ends_at) : null;
  const active = (!start || at >= start) && (!end || at < end);
  if (!active || row.discount_type === "NONE") {
    return { baseIrr, finalIrr: baseIrr, discountIrr: 0 };
  }
  const value = money(row.discount_value, "discount");
  let discountIrr = 0;
  if (row.discount_type === "PERCENTAGE") {
    assert(value <= 100, "Percentage discount cannot exceed 100");
    discountIrr = Math.floor((baseIrr * value) / 100);
  } else if (row.discount_type === "FIXED_IRR") {
    discountIrr = Math.min(baseIrr, value);
  }
  return {
    baseIrr,
    finalIrr: Math.max(0, baseIrr - discountIrr),
    discountIrr,
  };
}

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapAddress(row) {
  return {
    id: row.id,
    label: row.label,
    fullName: row.full_name,
    phone: row.phone,
    province: row.province,
    city: row.city,
    addressLine: row.address_line,
    postalCode: row.postal_code,
    isDefault: Boolean(row.is_default),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapOrder(row) {
  return {
    id: row.id,
    userId: row.user_id,
    addressId: row.address_id,
    status: row.status,
    subtotalIrr: money(row.subtotal_irr, "subtotal"),
    discountIrr: money(row.discount_irr, "discount"),
    totalIrr: money(row.total_irr, "total"),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export class PostgresMarketplaceService {
  constructor(pool, { sessionHours = 720, reservationMinutes = 30 } = {}) {
    this.pool = pool;
    this.sessionHours = sessionHours;
    this.reservationMinutes = reservationMinutes;
  }

  async register({ email, password }) {
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
    const digest = Buffer.from(await passwordDigest(password, salt)).toString("hex");
    const id = randomUUID();
    try {
      await this.pool.query(
        `INSERT INTO users(id,email,password_salt,password_hash,role)
         VALUES($1,$2,$3,$4,'CUSTOMER')`,
        [id, normalizedEmail, salt, digest],
      );
    } catch (error) {
      if (error?.code === "23505") fail("Email is already registered", "CONFLICT");
      throw error;
    }
    return { id, email: normalizedEmail, role: "CUSTOMER" };
  }

  async login({ email, password, now = new Date() }) {
    const result = await this.pool.query(
      "SELECT * FROM users WHERE email=$1 AND status='ACTIVE'",
      [String(email || "").trim().toLowerCase()],
    );
    const user = result.rows[0];
    assert(user, "Invalid credentials", "UNAUTHORIZED");
    const expected = Buffer.from(user.password_hash, "hex");
    const actual = Buffer.from(await passwordDigest(password, user.password_salt));
    assert(
      expected.length === actual.length && timingSafeEqual(expected, actual),
      "Invalid credentials",
      "UNAUTHORIZED",
    );
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + this.sessionHours * HOUR);
    await this.pool.query(
      "INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)",
      [randomUUID(), user.id, hashToken(token), expiresAt],
    );
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async authenticate(token, now = new Date()) {
    const result = await this.pool.query(
      `SELECT u.id,u.email,u.role,u.status,s.expires_at
       FROM sessions s
       JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1`,
      [hashToken(token)],
    );
    const row = result.rows[0];
    assert(
      row && row.status === "ACTIVE" && new Date(row.expires_at) > now,
      "Session is invalid or expired",
      "UNAUTHORIZED",
    );
    return { id: row.id, email: row.email, role: row.role };
  }

  async logout(token) {
    await this.pool.query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
  }

  async listAddresses(userId) {
    const result = await this.pool.query(
      `SELECT * FROM addresses
       WHERE user_id=$1
       ORDER BY is_default DESC,created_at DESC`,
      [userId],
    );
    return result.rows.map(mapAddress);
  }

  async addAddress(userId, input) {
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
    return withPostgresTransaction(this.pool, async (client) => {
      const current = await client.query(
        "SELECT id FROM addresses WHERE user_id=$1 FOR UPDATE",
        [userId],
      );
      const isDefault = Boolean(input.isDefault) || current.rowCount === 0;
      if (isDefault) {
        await client.query(
          "UPDATE addresses SET is_default=FALSE,updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND is_default=TRUE",
          [userId],
        );
      }
      const id = randomUUID();
      const created = await client.query(
        `INSERT INTO addresses
         (id,user_id,label,full_name,phone,province,city,address_line,postal_code,is_default)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          id,
          userId,
          String(input.label || "نشانی").slice(0, 120),
          String(input.fullName).trim(),
          String(input.phone).trim(),
          String(input.province).trim(),
          String(input.city).trim(),
          String(input.addressLine).trim(),
          String(input.postalCode).trim(),
          isDefault,
        ],
      );
      return mapAddress(created.rows[0]);
    });
  }

  async setDefaultAddress(userId, addressId) {
    return withPostgresTransaction(this.pool, async (client) => {
      const found = await client.query(
        "SELECT id FROM addresses WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [addressId, userId],
      );
      assert(found.rowCount === 1, "Address not found", "NOT_FOUND");
      await client.query(
        "UPDATE addresses SET is_default=FALSE,updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND is_default=TRUE",
        [userId],
      );
      const updated = await client.query(
        "UPDATE addresses SET is_default=TRUE,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",
        [addressId],
      );
      return mapAddress(updated.rows[0]);
    });
  }

  async removeAddress(userId, addressId) {
    return withPostgresTransaction(this.pool, async (client) => {
      const found = await client.query(
        "SELECT * FROM addresses WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [addressId, userId],
      );
      const address = found.rows[0];
      assert(address, "Address not found", "NOT_FOUND");
      const dependency = await client.query(
        "SELECT 1 FROM orders WHERE address_id=$1 LIMIT 1",
        [addressId],
      );
      assert(dependency.rowCount === 0, "Address is already used by an order", "CONFLICT");
      await client.query("DELETE FROM addresses WHERE id=$1", [addressId]);
      if (address.is_default) {
        const replacement = await client.query(
          `SELECT id FROM addresses
           WHERE user_id=$1
           ORDER BY created_at DESC
           LIMIT 1
           FOR UPDATE`,
          [userId],
        );
        if (replacement.rows[0]) {
          await client.query(
            "UPDATE addresses SET is_default=TRUE,updated_at=CURRENT_TIMESTAMP WHERE id=$1",
            [replacement.rows[0].id],
          );
        }
      }
      return { id: addressId, deleted: true };
    });
  }

  async listCategories() {
    const result = await this.pool.query(
      `SELECT id,parent_id,name,slug,image_url,sort_order,description
       FROM categories
       WHERE is_visible=TRUE
       ORDER BY sort_order ASC,name ASC`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      slug: row.slug,
      imageUrl: row.image_url,
      sortOrder: Number(row.sort_order || 0),
      description: row.description || "",
    }));
  }

  async productMedia(productId, client = this.pool) {
    const result = await client.query(
      `SELECT id,media_type,url,sort_order,is_primary
       FROM product_media
       WHERE product_id=$1
       ORDER BY is_primary DESC,sort_order ASC,created_at ASC`,
      [productId],
    );
    return result.rows.map((item) => ({
      id: item.id,
      type: item.media_type,
      url: item.url,
      sortOrder: Number(item.sort_order || 0),
      isPrimary: Boolean(item.is_primary),
    }));
  }

  async mapPublicProduct(row, client = this.pool) {
    const pricing = priceProduct(row);
    const media = await this.productMedia(row.id, client);
    const stockOnHand = Number(row.stock_on_hand);
    const stockReserved = Number(row.stock_reserved);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      brand: row.brand || "Miran",
      category: row.category_id
        ? {
            id: row.category_id,
            slug: row.category_slug,
            name: row.category_name,
            description: row.category_description || "",
          }
        : null,
      pricing,
      currency: "IRR",
      inStock: stockOnHand - stockReserved > 0,
      availableQuantity: Math.max(0, stockOnHand - stockReserved),
      isAmazing: Boolean(row.is_amazing),
      highlights: parseArray(row.highlights_json),
      specifications: parseArray(row.specifications_json),
      media,
      publishedAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    };
  }

  async listProducts({
    limit = 24,
    offset = 0,
    categorySlug = null,
    amazingOnly = false,
    query = "",
  } = {}) {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 24));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const values = [];
    const filters = ["p.status='PUBLISHED'"];
    if (categorySlug) {
      values.push(String(categorySlug));
      filters.push(`c.slug=$${values.length}`);
    }
    if (amazingOnly) filters.push("p.is_amazing=TRUE");
    const normalizedQuery = String(query || "").trim();
    if (normalizedQuery) {
      values.push(`%${normalizedQuery}%`);
      const marker = `$${values.length}`;
      filters.push(`(p.title ILIKE ${marker} OR p.brand ILIKE ${marker} OR p.description ILIKE ${marker})`);
    }
    values.push(safeLimit, safeOffset);
    const result = await this.pool.query(
      `SELECT p.*,i.stock_on_hand,i.stock_reserved,
              c.slug AS category_slug,c.name AS category_name,c.description AS category_description
       FROM products p
       JOIN inventory i ON i.product_id=p.id
       LEFT JOIN categories c ON c.id=p.category_id
       WHERE ${filters.join(" AND ")}
       ORDER BY p.is_amazing DESC,p.updated_at DESC,p.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return Promise.all(result.rows.map((row) => this.mapPublicProduct(row)));
  }

  async getProduct(idOrSlug) {
    const result = await this.pool.query(
      `SELECT p.*,i.stock_on_hand,i.stock_reserved,
              c.slug AS category_slug,c.name AS category_name,c.description AS category_description
       FROM products p
       JOIN inventory i ON i.product_id=p.id
       LEFT JOIN categories c ON c.id=p.category_id
       WHERE p.status='PUBLISHED' AND (p.id=$1 OR p.slug=$1)
       LIMIT 1`,
      [idOrSlug],
    );
    assert(result.rows[0], "Product not found", "NOT_FOUND");
    return this.mapPublicProduct(result.rows[0]);
  }

  async releaseExpiredReservations(now = new Date()) {
    return withPostgresTransaction(this.pool, async (client) => {
      const expired = await client.query(
        `SELECT id,order_id,product_id,quantity
         FROM inventory_reservations
         WHERE status='ACTIVE' AND expires_at <= $1
         ORDER BY product_id,id
         FOR UPDATE`,
        [now],
      );
      for (const reservation of expired.rows) {
        const updated = await client.query(
          `UPDATE inventory
           SET stock_reserved=stock_reserved-$1,
               version=version+1,
               updated_at=CURRENT_TIMESTAMP
           WHERE product_id=$2 AND stock_reserved >= $1`,
          [reservation.quantity, reservation.product_id],
        );
        assert(updated.rowCount === 1, "Inventory reservation invariant violated", "CONFLICT");
        await client.query(
          "UPDATE inventory_reservations SET status='RELEASED' WHERE id=$1 AND status='ACTIVE'",
          [reservation.id],
        );
        await client.query(
          `UPDATE orders
           SET status='PAYMENT_FAILED',updated_at=CURRENT_TIMESTAMP
           WHERE id=$1 AND status='PENDING_PAYMENT'`,
          [reservation.order_id],
        );
      }
      return expired.rowCount;
    });
  }

  async createOrder(userId, { addressId, items, idempotencyKey, now = new Date() }) {
    assert(String(idempotencyKey || "").length >= 8, "Idempotency key is required");
    assert(Array.isArray(items) && items.length > 0, "Order must contain items");
    assert(items.length <= 100, "Order contains too many lines");
    await this.releaseExpiredReservations(now);

    const normalizedItems = items.map((item) => ({
      productId: String(item.productId || ""),
      quantity: Number(item.quantity),
    }));
    for (const item of normalizedItems) {
      assert(item.productId, "Product id is required");
      assert(Number.isSafeInteger(item.quantity) && item.quantity > 0, "Quantity must be positive integer");
      assert(item.quantity <= 1000, "Quantity is too large");
    }
    normalizedItems.sort((left, right) => left.productId.localeCompare(right.productId, "en"));

    return withPostgresTransaction(this.pool, async (client) => {
      const existing = await client.query(
        "SELECT * FROM orders WHERE user_id=$1 AND idempotency_key=$2",
        [userId, String(idempotencyKey)],
      );
      if (existing.rows[0]) return mapOrder(existing.rows[0]);

      const address = await client.query(
        "SELECT id FROM addresses WHERE id=$1 AND user_id=$2",
        [addressId, userId],
      );
      assert(address.rowCount === 1, "Address not found", "NOT_FOUND");

      let subtotalIrr = 0;
      let discountIrr = 0;
      let totalIrr = 0;
      const lines = [];

      for (const item of normalizedItems) {
        const locked = await client.query(
          `SELECT p.*,i.stock_on_hand,i.stock_reserved
           FROM products p
           JOIN inventory i ON i.product_id=p.id
           WHERE p.id=$1 AND p.status='PUBLISHED'
           FOR UPDATE OF p,i`,
          [item.productId],
        );
        const product = locked.rows[0];
        assert(product, "Published product not found", "NOT_FOUND");
        const available = Number(product.stock_on_hand) - Number(product.stock_reserved);
        assert(available >= item.quantity, "Insufficient stock", "OUT_OF_STOCK");
        const pricing = priceProduct(product, now);
        subtotalIrr += pricing.baseIrr * item.quantity;
        discountIrr += pricing.discountIrr * item.quantity;
        totalIrr += pricing.finalIrr * item.quantity;
        assert(
          Number.isSafeInteger(subtotalIrr) &&
            Number.isSafeInteger(discountIrr) &&
            Number.isSafeInteger(totalIrr),
          "Order total exceeds supported integer range",
        );
        lines.push({ product, pricing, quantity: item.quantity });
      }

      const orderId = randomUUID();
      const inserted = await client.query(
        `INSERT INTO orders
         (id,user_id,address_id,idempotency_key,status,subtotal_irr,discount_irr,total_irr)
         VALUES($1,$2,$3,$4,'PENDING_PAYMENT',$5,$6,$7)
         ON CONFLICT (user_id,idempotency_key) DO NOTHING
         RETURNING *`,
        [
          orderId,
          userId,
          addressId,
          String(idempotencyKey),
          subtotalIrr,
          discountIrr,
          totalIrr,
        ],
      );
      if (!inserted.rows[0]) {
        const duplicate = await client.query(
          "SELECT * FROM orders WHERE user_id=$1 AND idempotency_key=$2",
          [userId, String(idempotencyKey)],
        );
        assert(duplicate.rows[0], "Idempotent order could not be resolved", "CONFLICT");
        return mapOrder(duplicate.rows[0]);
      }

      const expiresAt = new Date(now.getTime() + this.reservationMinutes * 60_000);
      for (const line of lines) {
        const reserved = await client.query(
          `UPDATE inventory
           SET stock_reserved=stock_reserved+$1,
               version=version+1,
               updated_at=CURRENT_TIMESTAMP
           WHERE product_id=$2 AND stock_on_hand-stock_reserved >= $1`,
          [line.quantity, line.product.id],
        );
        assert(reserved.rowCount === 1, "Insufficient stock", "OUT_OF_STOCK");
        await client.query(
          `INSERT INTO order_items
           (id,order_id,product_id,title_snapshot,unit_base_price_irr,unit_final_price_irr,quantity,line_total_irr)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            randomUUID(),
            orderId,
            line.product.id,
            line.product.title,
            line.pricing.baseIrr,
            line.pricing.finalIrr,
            line.quantity,
            line.pricing.finalIrr * line.quantity,
          ],
        );
        await client.query(
          `INSERT INTO inventory_reservations
           (id,order_id,product_id,quantity,status,expires_at)
           VALUES($1,$2,$3,$4,'ACTIVE',$5)`,
          [randomUUID(), orderId, line.product.id, line.quantity, expiresAt],
        );
      }
      await this.audit(client, userId, "ORDER_CREATED", "ORDER", orderId, {
        totalIrr,
      });
      return mapOrder(inserted.rows[0]);
    });
  }

  async markOrderPaid(
    orderId,
    { provider, authority = null, referenceId = null, providerPayload = null, now = new Date() },
  ) {
    await this.releaseExpiredReservations(now);
    return withPostgresTransaction(this.pool, async (client) => {
      const orderResult = await client.query(
        "SELECT * FROM orders WHERE id=$1 FOR UPDATE",
        [orderId],
      );
      const order = orderResult.rows[0];
      assert(order, "Order not found", "NOT_FOUND");
      if (order.status === "PAID") return mapOrder(order);
      assert(order.status === "PENDING_PAYMENT", "Order is not payable", "CONFLICT");

      const reservations = await client.query(
        `SELECT * FROM inventory_reservations
         WHERE order_id=$1 AND status='ACTIVE'
         ORDER BY product_id
         FOR UPDATE`,
        [orderId],
      );
      assert(reservations.rowCount > 0, "No active reservation", "CONFLICT");
      for (const reservation of reservations.rows) {
        assert(new Date(reservation.expires_at) > now, "Reservation expired", "CONFLICT");
        const inventory = await client.query(
          "SELECT * FROM inventory WHERE product_id=$1 FOR UPDATE",
          [reservation.product_id],
        );
        const row = inventory.rows[0];
        assert(
          row &&
            Number(row.stock_reserved) >= Number(reservation.quantity) &&
            Number(row.stock_on_hand) >= Number(reservation.quantity),
          "Inventory invariant violated",
          "CONFLICT",
        );
        await client.query(
          `UPDATE inventory
           SET stock_on_hand=stock_on_hand-$1,
               stock_reserved=stock_reserved-$1,
               version=version+1,
               updated_at=CURRENT_TIMESTAMP
           WHERE product_id=$2`,
          [reservation.quantity, reservation.product_id],
        );
      }
      await client.query(
        "UPDATE inventory_reservations SET status='CONSUMED' WHERE order_id=$1 AND status='ACTIVE'",
        [orderId],
      );
      const paid = await client.query(
        "UPDATE orders SET status='PAID',updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",
        [orderId],
      );
      await client.query(
        `INSERT INTO payments
         (id,order_id,provider,amount_irr,status,authority,reference_id,provider_payload)
         VALUES($1,$2,$3,$4,'VERIFIED',$5,$6,$7)`,
        [
          randomUUID(),
          orderId,
          String(provider || "UNKNOWN"),
          money(order.total_irr, "order total"),
          authority,
          referenceId,
          providerPayload ? JSON.stringify(providerPayload) : null,
        ],
      );
      await this.audit(client, null, "ORDER_PAID", "ORDER", orderId, {
        provider,
        authority,
        referenceId,
      });
      return mapOrder(paid.rows[0]);
    });
  }

  async listOrders(userId, { limit = 50, offset = 0 } = {}) {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const result = await this.pool.query(
      `SELECT * FROM orders
       WHERE user_id=$1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, safeLimit, safeOffset],
    );
    return result.rows.map(mapOrder);
  }

  async getOrder(userId, orderId) {
    const order = await this.pool.query(
      "SELECT * FROM orders WHERE id=$1 AND user_id=$2",
      [orderId, userId],
    );
    assert(order.rows[0], "Order not found", "NOT_FOUND");
    const items = await this.pool.query(
      `SELECT id,product_id,title_snapshot,unit_base_price_irr,unit_final_price_irr,quantity,line_total_irr
       FROM order_items
       WHERE order_id=$1
       ORDER BY id`,
      [orderId],
    );
    return {
      ...mapOrder(order.rows[0]),
      items: items.rows.map((item) => ({
        id: item.id,
        productId: item.product_id,
        title: item.title_snapshot,
        unitBasePriceIrr: money(item.unit_base_price_irr),
        unitFinalPriceIrr: money(item.unit_final_price_irr),
        quantity: Number(item.quantity),
        lineTotalIrr: money(item.line_total_irr),
      })),
    };
  }

  async audit(client, actorUserId, action, entityType, entityId, details = {}) {
    await client.query(
      `INSERT INTO audit_log
       (id,actor_user_id,action,entity_type,entity_id,details_json)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [
        randomUUID(),
        actorUserId || null,
        action,
        entityType,
        entityId || null,
        JSON.stringify(details),
      ],
    );
  }
}
