import { getRuntimeEnv } from "../lib/runtime-env.ts";
import type {
  CustomerAddress,
  CustomerAddressInput,
} from "../features/account/address-types.ts";

type AddressRow = {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  address_line: string;
  city: string;
  province: string;
  postcode: string;
  latitude_e6: number | null;
  longitude_e6: number | null;
  is_default: number;
  created_at: string;
  updated_at: string;
};

export async function listCustomerAddresses(
  ownerEmail: string,
  database?: D1Database,
) {
  const result = await (database ?? await requireDatabase())
    .prepare(
      `SELECT id, label, recipient_name, phone, address_line, city, province,
              postcode, latitude_e6, longitude_e6, is_default,
              created_at, updated_at
         FROM customer_addresses
        WHERE owner_email = ?
        ORDER BY is_default DESC, updated_at DESC
        LIMIT 10`,
    )
    .bind(normalizeEmail(ownerEmail))
    .all<AddressRow>();
  return result.results.map(mapAddress);
}

export async function getOwnedCustomerAddress(
  ownerEmail: string,
  id: string,
  database?: D1Database,
) {
  const row = await (database ?? await requireDatabase())
    .prepare(
      `SELECT id, label, recipient_name, phone, address_line, city, province,
              postcode, latitude_e6, longitude_e6, is_default,
              created_at, updated_at
         FROM customer_addresses
        WHERE id = ? AND owner_email = ?
        LIMIT 1`,
    )
    .bind(id, normalizeEmail(ownerEmail))
    .first<AddressRow>();
  return row ? mapAddress(row) : null;
}

export async function createCustomerAddress(
  ownerEmail: string,
  input: CustomerAddressInput,
  database?: D1Database,
) {
  database ??= await requireDatabase();
  const email = normalizeEmail(ownerEmail);
  const count = await database
    .prepare("SELECT COUNT(*) AS count FROM customer_addresses WHERE owner_email = ?")
    .bind(email)
    .first<{ count: number }>();
  if ((count?.count ?? 0) >= 10) throw new Error("ADDRESS_LIMIT");

  const id = crypto.randomUUID();
  const isDefault = input.isDefault || (count?.count ?? 0) === 0;
  const statements = [];
  if (isDefault) {
    statements.push(
      database
        .prepare(
          "UPDATE customer_addresses SET is_default = 0, updated_at = CURRENT_TIMESTAMP WHERE owner_email = ?",
        )
        .bind(email),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO customer_addresses (
           id, owner_email, label, recipient_name, phone, address_line, city,
           province, postcode, latitude_e6, longitude_e6, is_default,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .bind(
        id,
        email,
        input.label,
        input.recipientName,
        input.phone,
        input.addressLine,
        input.city,
        input.province,
        input.postcode,
        coordinateToInteger(input.latitude),
        coordinateToInteger(input.longitude),
        isDefault ? 1 : 0,
      ),
  );
  await database.batch(statements);
  return (await listCustomerAddresses(email, database)).find((item) => item.id === id)!;
}

export async function setDefaultCustomerAddress(
  ownerEmail: string,
  id: string,
  database?: D1Database,
) {
  database ??= await requireDatabase();
  const email = normalizeEmail(ownerEmail);
  const owned = await database
    .prepare("SELECT id FROM customer_addresses WHERE id = ? AND owner_email = ?")
    .bind(id, email)
    .first<{ id: string }>();
  if (!owned) throw new Error("ADDRESS_NOT_FOUND");
  await database.batch([
    database
      .prepare(
        "UPDATE customer_addresses SET is_default = 0, updated_at = CURRENT_TIMESTAMP WHERE owner_email = ?",
      )
      .bind(email),
    database
      .prepare(
        "UPDATE customer_addresses SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_email = ?",
      )
      .bind(id, email),
  ]);
}

export async function deleteCustomerAddress(
  ownerEmail: string,
  id: string,
  database?: D1Database,
) {
  database ??= await requireDatabase();
  const email = normalizeEmail(ownerEmail);
  const owned = await database
    .prepare(
      "SELECT id, is_default FROM customer_addresses WHERE id = ? AND owner_email = ?",
    )
    .bind(id, email)
    .first<{ id: string; is_default: number }>();
  if (!owned) throw new Error("ADDRESS_NOT_FOUND");
  await database
    .prepare("DELETE FROM customer_addresses WHERE id = ? AND owner_email = ?")
    .bind(id, email)
    .run();
  if (owned.is_default === 1) {
    await database
      .prepare(
        `UPDATE customer_addresses SET is_default = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = (
            SELECT id FROM customer_addresses WHERE owner_email = ?
            ORDER BY updated_at DESC LIMIT 1
          )`,
      )
      .bind(email)
      .run();
  }
}

function mapAddress(row: AddressRow): CustomerAddress {
  return {
    id: row.id,
    label: row.label,
    recipientName: row.recipient_name,
    phone: row.phone,
    addressLine: row.address_line,
    city: row.city,
    province: row.province,
    postcode: row.postcode,
    latitude: coordinateFromInteger(row.latitude_e6),
    longitude: coordinateFromInteger(row.longitude_e6),
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase().slice(0, 200);
}

function coordinateToInteger(value: number | null) {
  return value === null || !Number.isFinite(value)
    ? null
    : Math.round(value * 1_000_000);
}

function coordinateFromInteger(value: number | null) {
  return value === null ? null : value / 1_000_000;
}

async function requireDatabase() {
  const bindings = await getRuntimeEnv<{ DB?: D1Database }>();
  if (!bindings.DB) throw new Error("پایگاه‌داده فروشگاه در دسترس نیست.");
  return bindings.DB;
}
