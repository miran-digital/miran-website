import { timingSafeEqual } from "node:crypto";
import { MarketplaceCore } from "../src/core.js";
import { migrateSqlite, openSqliteDatabase } from "../src/database.js";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const databasePath = required("MIRAN_SQLITE_PATH");
if (databasePath === ":memory:") {
  throw new Error("Admin bootstrap requires a persistent development database path");
}

const suppliedSecret = Buffer.from(required("MIRAN_ADMIN_BOOTSTRAP_SECRET"));
const confirmationSecret = Buffer.from(required("MIRAN_ADMIN_BOOTSTRAP_CONFIRM"));
if (
  suppliedSecret.length !== confirmationSecret.length ||
  !timingSafeEqual(suppliedSecret, confirmationSecret)
) {
  throw new Error("Bootstrap confirmation secret does not match");
}

const email = required("MIRAN_ADMIN_BOOTSTRAP_EMAIL").trim().toLowerCase();
const password = required("MIRAN_ADMIN_BOOTSTRAP_PASSWORD");
const db = openSqliteDatabase(databasePath);
migrateSqlite(db);

try {
  const existingAdmin = db
    .prepare("SELECT id,email FROM users WHERE role='ADMIN' LIMIT 1")
    .get();
  if (existingAdmin) {
    throw new Error(`An admin already exists (${existingAdmin.email}); bootstrap refused`);
  }
  const existingEmail = db.prepare("SELECT id FROM users WHERE email=?").get(email);
  if (existingEmail) {
    throw new Error("Bootstrap email already belongs to an existing account; bootstrap refused");
  }

  const core = new MarketplaceCore(db);
  const user = core.register({ email, password });
  db.prepare("UPDATE users SET role='ADMIN',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(
    user.id,
  );
  console.log(`Initial development admin created: ${email}`);
} finally {
  db.close();
}
