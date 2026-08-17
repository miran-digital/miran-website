import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const transactionCriticalConsumers = [
  "services/marketplace-core/postgres/checkout-service.js",
  "services/marketplace-core/postgres/payment-service.js",
  "services/marketplace-core/postgres/maintenance-service.js",
];

const forbiddenDirectWrites = [
  /UPDATE\s+inventory\b/i,
  /INSERT\s+INTO\s+inventory_reservations\b/i,
  /UPDATE\s+inventory_reservations\b/i,
];

test("transaction-critical consumers delegate inventory reservation writes to Inventory", async () => {
  for (const path of transactionCriticalConsumers) {
    const source = await readFile(path, "utf8");
    for (const pattern of forbiddenDirectWrites) {
      assert.equal(
        pattern.test(source),
        false,
        `${path} must not own inventory command SQL matching ${pattern}`,
      );
    }
    assert.match(
      source,
      /PostgresInventoryService|this\.inventory/,
      `${path} must use the explicit Inventory command boundary`,
    );
  }
});

test("Inventory is the owner of reservation mutation SQL", async () => {
  const source = await readFile(
    "services/marketplace-core/postgres/inventory-service.js",
    "utf8",
  );
  assert.match(source, /UPDATE\s+inventory\b/i);
  assert.match(source, /INSERT\s+INTO\s+inventory_reservations\b/i);
  assert.match(source, /UPDATE\s+inventory_reservations\b/i);
});
