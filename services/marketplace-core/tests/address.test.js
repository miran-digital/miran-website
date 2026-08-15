import assert from "node:assert/strict";
import test from "node:test";
import { AddressService } from "../src/address-service.js";
import { MarketplaceCore } from "../src/core.js";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";

function fixture() {
  const db = openSqliteDatabase(":memory:");
  migrateSqlite(db);
  return {
    db,
    core: new MarketplaceCore(db),
    addresses: new AddressService(db),
  };
}

function add(core, userId, label, isDefault = false) {
  return core.addAddress(userId, {
    label,
    fullName: "Test User",
    phone: "09120000000",
    province: "Tehran",
    city: "Tehran",
    addressLine: `${label} address`,
    postalCode: "1234567890",
    isDefault,
  });
}

test("address book only exposes the owner's addresses and keeps one default", () => {
  const { db, core, addresses } = fixture();
  const firstUser = core.register({ email: "a@example.com", password: "very-secure-pass-123" });
  const secondUser = core.register({ email: "b@example.com", password: "very-secure-pass-123" });
  const first = add(core, firstUser.id, "Home", true);
  const second = add(core, firstUser.id, "Work");
  add(core, secondUser.id, "Other", true);

  assert.equal(addresses.list(firstUser.id).length, 2);
  assert.equal(addresses.list(secondUser.id).length, 1);
  assert.throws(() => addresses.setDefault(secondUser.id, first.id), /not found/i);

  addresses.setDefault(firstUser.id, second.id);
  const owned = addresses.list(firstUser.id);
  assert.equal(owned[0].id, second.id);
  assert.equal(owned.filter((item) => item.is_default === 1).length, 1);
  db.close();
});

test("deleting the default address promotes another owned address", () => {
  const { db, core, addresses } = fixture();
  const user = core.register({ email: "delete@example.com", password: "very-secure-pass-123" });
  const first = add(core, user.id, "Home", true);
  const second = add(core, user.id, "Work");

  addresses.remove(user.id, first.id);
  const remaining = addresses.list(user.id);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, second.id);
  assert.equal(remaining[0].is_default, 1);
  db.close();
});
