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

function integerMoney(value, field) {
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number >= 0, `${field} must be a non-negative integer IRR amount`);
  return number;
}

function optionalIntegerMoney(value, field) {
  if (value === null || value === undefined || value === "") return null;
  return integerMoney(value, field);
}

function optionalDays(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  assert(Number.isSafeInteger(number) && number >= 0 && number <= 365, `${field} is invalid`);
  return number;
}

function normalizeCode(value) {
  const code = String(value || "").trim().toUpperCase();
  assert(/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code), "Shipping method code is invalid");
  return code;
}

function mapMethod(row, merchandiseTotalIrr = null) {
  const priceIrr = Number(row.price_irr);
  const freeOverIrr = row.free_over_irr === null ? null : Number(row.free_over_irr);
  const appliedPriceIrr =
    merchandiseTotalIrr !== null && freeOverIrr !== null && merchandiseTotalIrr >= freeOverIrr
      ? 0
      : priceIrr;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description || "",
    priceIrr,
    freeOverIrr,
    appliedPriceIrr,
    minDeliveryDays: row.min_delivery_days === null ? null : Number(row.min_delivery_days),
    maxDeliveryDays: row.max_delivery_days === null ? null : Number(row.max_delivery_days),
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order || 0),
  };
}

export async function quoteShippingMethod(
  client,
  { userId, addressId, methodCode, merchandiseTotalIrr },
) {
  const address = await client.query(
    "SELECT id FROM addresses WHERE id=$1 AND user_id=$2",
    [addressId, userId],
  );
  assert(address.rowCount === 1, "Address not found", "NOT_FOUND");
  const method = await client.query(
    "SELECT * FROM shipping_methods WHERE code=$1 AND active=TRUE FOR SHARE",
    [normalizeCode(methodCode)],
  );
  const row = method.rows[0];
  assert(row, "Shipping method is not available", "NOT_FOUND");
  const mapped = mapMethod(row, integerMoney(merchandiseTotalIrr, "merchandise total"));
  return {
    code: mapped.code,
    name: mapped.name,
    shippingIrr: mapped.appliedPriceIrr,
    minDeliveryDays: mapped.minDeliveryDays,
    maxDeliveryDays: mapped.maxDeliveryDays,
  };
}

export class PostgresLogisticsService {
  constructor(pool) {
    this.pool = pool;
  }

  async requireAdmin(userId, client = this.pool) {
    const actor = await client.query(
      "SELECT role FROM users WHERE id=$1 AND status='ACTIVE'",
      [userId],
    );
    assert(actor.rows[0]?.role === "ADMIN", "Admin role required", "FORBIDDEN");
  }

  async listAvailable(userId, addressId, { merchandiseTotalIrr = null } = {}) {
    const address = await this.pool.query(
      "SELECT id FROM addresses WHERE id=$1 AND user_id=$2",
      [addressId, userId],
    );
    assert(address.rowCount === 1, "Address not found", "NOT_FOUND");
    const normalizedTotal =
      merchandiseTotalIrr === null || merchandiseTotalIrr === undefined
        ? null
        : integerMoney(merchandiseTotalIrr, "merchandise total");
    const result = await this.pool.query(
      `SELECT * FROM shipping_methods
       WHERE active=TRUE
       ORDER BY sort_order ASC,name ASC`,
    );
    return result.rows.map((row) => mapMethod(row, normalizedTotal));
  }

  async listManaged(adminId) {
    await this.requireAdmin(adminId);
    const result = await this.pool.query(
      "SELECT * FROM shipping_methods ORDER BY sort_order ASC,name ASC",
    );
    return result.rows.map((row) => mapMethod(row));
  }

  validateInput(input, current = null) {
    const code = normalizeCode(input.code ?? current?.code);
    const name = String(input.name ?? current?.name ?? "").trim();
    assert(name.length >= 2 && name.length <= 120, "Shipping method name is invalid");
    const description = String(input.description ?? current?.description ?? "").trim().slice(0, 500);
    const priceIrr = integerMoney(input.priceIrr ?? current?.price_irr, "Shipping price");
    const freeOverIrr = optionalIntegerMoney(
      input.freeOverIrr !== undefined ? input.freeOverIrr : current?.free_over_irr,
      "Free shipping threshold",
    );
    const minDeliveryDays = optionalDays(
      input.minDeliveryDays !== undefined ? input.minDeliveryDays : current?.min_delivery_days,
      "Minimum delivery days",
    );
    const maxDeliveryDays = optionalDays(
      input.maxDeliveryDays !== undefined ? input.maxDeliveryDays : current?.max_delivery_days,
      "Maximum delivery days",
    );
    assert(
      minDeliveryDays === null || maxDeliveryDays === null || minDeliveryDays <= maxDeliveryDays,
      "Delivery day range is invalid",
    );
    const active = input.active === undefined ? Boolean(current?.active ?? true) : Boolean(input.active);
    const sortOrder = Number(input.sortOrder ?? current?.sort_order ?? 0);
    assert(Number.isSafeInteger(sortOrder) && sortOrder >= 0 && sortOrder <= 10000, "Sort order is invalid");
    return {
      code,
      name,
      description,
      priceIrr,
      freeOverIrr,
      minDeliveryDays,
      maxDeliveryDays,
      active,
      sortOrder,
    };
  }

  async create(adminId, input) {
    return withPostgresTransaction(this.pool, async (client) => {
      await this.requireAdmin(adminId, client);
      const value = this.validateInput(input);
      const id = randomUUID();
      try {
        const result = await client.query(
          `INSERT INTO shipping_methods
           (id,code,name,description,price_irr,free_over_irr,min_delivery_days,max_delivery_days,active,sort_order)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING *`,
          [
            id,
            value.code,
            value.name,
            value.description,
            value.priceIrr,
            value.freeOverIrr,
            value.minDeliveryDays,
            value.maxDeliveryDays,
            value.active,
            value.sortOrder,
          ],
        );
        await this.audit(client, adminId, "SHIPPING_METHOD_CREATED", id, { code: value.code });
        return mapMethod(result.rows[0]);
      } catch (error) {
        if (error?.code === "23505") fail("Shipping method code already exists", "CONFLICT");
        throw error;
      }
    });
  }

  async update(adminId, methodId, input) {
    return withPostgresTransaction(this.pool, async (client) => {
      await this.requireAdmin(adminId, client);
      const currentResult = await client.query(
        "SELECT * FROM shipping_methods WHERE id=$1 FOR UPDATE",
        [methodId],
      );
      const current = currentResult.rows[0];
      assert(current, "Shipping method not found", "NOT_FOUND");
      const value = this.validateInput(input, current);
      try {
        const result = await client.query(
          `UPDATE shipping_methods
           SET code=$1,name=$2,description=$3,price_irr=$4,free_over_irr=$5,
               min_delivery_days=$6,max_delivery_days=$7,active=$8,sort_order=$9,
               updated_at=CURRENT_TIMESTAMP
           WHERE id=$10
           RETURNING *`,
          [
            value.code,
            value.name,
            value.description,
            value.priceIrr,
            value.freeOverIrr,
            value.minDeliveryDays,
            value.maxDeliveryDays,
            value.active,
            value.sortOrder,
            methodId,
          ],
        );
        await this.audit(client, adminId, "SHIPPING_METHOD_UPDATED", methodId, { code: value.code });
        return mapMethod(result.rows[0]);
      } catch (error) {
        if (error?.code === "23505") fail("Shipping method code already exists", "CONFLICT");
        throw error;
      }
    });
  }

  async remove(adminId, methodId) {
    return withPostgresTransaction(this.pool, async (client) => {
      await this.requireAdmin(adminId, client);
      const found = await client.query(
        "SELECT * FROM shipping_methods WHERE id=$1 FOR UPDATE",
        [methodId],
      );
      assert(found.rows[0], "Shipping method not found", "NOT_FOUND");
      await client.query("DELETE FROM shipping_methods WHERE id=$1", [methodId]);
      await this.audit(client, adminId, "SHIPPING_METHOD_DELETED", methodId, {
        code: found.rows[0].code,
      });
      return { id: methodId, deleted: true };
    });
  }

  async audit(client, actorUserId, action, entityId, details = {}) {
    await client.query(
      `INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,details_json)
       VALUES($1,$2,$3,'SHIPPING_METHOD',$4,$5)`,
      [randomUUID(), actorUserId, action, entityId, JSON.stringify(details)],
    );
  }
}
