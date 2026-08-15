import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { migratePostgres, openPostgresPool } from "./database.js";

const scryptAsync = promisify(scrypt);

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const email = required("MIRAN_BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
const password = required("MIRAN_BOOTSTRAP_ADMIN_PASSWORD");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error("MIRAN_BOOTSTRAP_ADMIN_EMAIL is invalid");
}
if (password.length < 14) {
  throw new Error("MIRAN_BOOTSTRAP_ADMIN_PASSWORD must be at least 14 characters");
}

const pool = openPostgresPool();
try {
  await migratePostgres(pool);
  const existingAdmin = await pool.query(
    "SELECT id,email FROM users WHERE role='ADMIN' LIMIT 1",
  );
  if (existingAdmin.rowCount) {
    throw new Error("An ADMIN already exists; bootstrap is intentionally one-time only");
  }
  const existingEmail = await pool.query(
    "SELECT id FROM users WHERE email=$1 LIMIT 1",
    [email],
  );
  if (existingEmail.rowCount) {
    throw new Error("Bootstrap email already belongs to an existing non-admin account");
  }

  const salt = randomBytes(16).toString("hex");
  const digest = Buffer.from(await scryptAsync(password, salt, 64)).toString("hex");
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users(id,email,password_salt,password_hash,role,status)
     VALUES($1,$2,$3,$4,'ADMIN','ACTIVE')`,
    [id, email, salt, digest],
  );
  console.log("Initial Miran ADMIN created", { id, email });
} catch (error) {
  console.error("Admin bootstrap failed", {
    name: error?.name,
    code: error?.code,
    message: error?.message,
  });
  process.exitCode = 1;
} finally {
  await pool.end();
}
