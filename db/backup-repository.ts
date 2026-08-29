import { getRuntimeEnv } from "../lib/runtime-env.ts";

export const LOGICAL_BACKUP_SCHEMA_VERSION = 16 as const;

export const LOGICAL_BACKUP_TABLES = [
  "storefront_settings",
  "products",
  "product_variants",
  "seller_offers",
  "catalog_attribute_definitions",
  "product_attribute_values",
  "product_variant_attribute_values",
  "product_questions",
  "product_price_history",
  "orders",
  "order_items",
  "seller_applications",
  "admin_audit_log",
  "admin_owner_credentials",
  "admin_owner_sessions",
  "storefront_revisions",
  "payment_attempts",
  "payment_provider_configs",
  "customer_accounts",
  "customer_addresses",
  "bank_transfer_receipts",
  "support_tickets",
  "support_messages",
  "product_reviews",
  "customer_notifications",
  "request_rate_limits",
] as const;

type BackupTable = (typeof LOGICAL_BACKUP_TABLES)[number];
type BackupRows = Record<BackupTable, Record<string, unknown>[]>;
type BackupSchema = Record<BackupTable, string[]>;

export type LogicalDatabaseBackup = {
  format: "miran-shop-d1-backup-v2";
  schemaVersion: typeof LOGICAL_BACKUP_SCHEMA_VERSION;
  schema: BackupSchema;
  tables: BackupRows;
  counts: Record<BackupTable, number>;
  media: {
    included: false;
    note: string;
  };
};

export type BackupInspection = {
  status: "current" | "legacy" | "future" | "invalid";
  schemaVersion: number | null;
  missingTables: string[];
  unexpectedTables: string[];
  reason: string;
};

export async function createLogicalDatabaseBackup(
  databaseOverride?: D1Database,
  options: { includeOwnerAuthentication?: boolean } = { includeOwnerAuthentication: true },
): Promise<LogicalDatabaseBackup> {
  const database = databaseOverride ?? await requireDatabase();
  await assertDatabaseTableCoverage(database);
  const includeOwnerAuthentication = options.includeOwnerAuthentication !== false;
  const entries: Array<readonly [BackupTable, string[], Record<string, unknown>[]]> = [];
  for (const table of LOGICAL_BACKUP_TABLES) {
    const omitOwnerRows = !includeOwnerAuthentication && isOwnerAuthenticationTable(table);
    const query = `SELECT * FROM ${quoteIdentifier(table)}${
      omitOwnerRows ? " WHERE 0" : ""
    } ORDER BY rowid ASC`;
    const rawRows = await database
      .prepare(query)
      .raw<unknown[]>({ columnNames: true });
    const [columns, rows] = mapRawBackupRows(rawRows);
    entries.push([table, columns, rows]);
  }
  const schema = Object.fromEntries(
    entries.map(([table, columns]) => [table, columns]),
  ) as LogicalDatabaseBackup["schema"];
  const tables = Object.fromEntries(
    entries.map(([table, , rows]) => [table, rows]),
  ) as LogicalDatabaseBackup["tables"];
  const counts = Object.fromEntries(
    entries.map(([table, , rows]) => [table, rows.length]),
  ) as LogicalDatabaseBackup["counts"];
  return {
    format: "miran-shop-d1-backup-v2",
    schemaVersion: LOGICAL_BACKUP_SCHEMA_VERSION,
    schema,
    tables,
    counts,
    media: {
      included: false,
      note: "این خروجی شامل تمام ردیف‌های D1 است؛ فایل‌های باینری R2 باید جداگانه نسخه‌برداری شوند.",
    },
  };
}

export function inspectLogicalDatabaseBackup(value: unknown): BackupInspection {
  if (!isRecord(value) || value.format !== "miran-shop-d1-backup-v2") {
    return inspection("invalid", null, [], [], "BACKUP_FORMAT_INVALID");
  }
  const schemaVersion = Number.isSafeInteger(value.schemaVersion)
    ? Number(value.schemaVersion)
    : null;
  if (schemaVersion === null || !isRecord(value.tables)) {
    return inspection("invalid", schemaVersion, [], [], "BACKUP_STRUCTURE_INVALID");
  }
  const tableNames = Object.keys(value.tables);
  const expected = new Set<string>(LOGICAL_BACKUP_TABLES);
  const actual = new Set(tableNames);
  const missingTables = LOGICAL_BACKUP_TABLES.filter((table) => !actual.has(table));
  const unexpectedTables = tableNames.filter((table) => !expected.has(table)).sort();
  if (schemaVersion < LOGICAL_BACKUP_SCHEMA_VERSION) {
    return inspection("legacy", schemaVersion, missingTables, unexpectedTables, "BACKUP_SCHEMA_LEGACY");
  }
  if (schemaVersion > LOGICAL_BACKUP_SCHEMA_VERSION) {
    return inspection("future", schemaVersion, missingTables, unexpectedTables, "BACKUP_SCHEMA_FUTURE");
  }
  if (missingTables.length || unexpectedTables.length || !isRecord(value.schema) || !isRecord(value.counts)) {
    return inspection("invalid", schemaVersion, missingTables, unexpectedTables, "BACKUP_SCHEMA_INCOMPLETE");
  }
  for (const table of LOGICAL_BACKUP_TABLES) {
    const rows = value.tables[table];
    const columns = value.schema[table];
    if (
      !Array.isArray(rows) ||
      !Array.isArray(columns) ||
      columns.length === 0 ||
      !columns.every((column) => typeof column === "string" && column.length > 0) ||
      value.counts[table] !== rows.length ||
      rows.some((row) => !rowMatchesSchema(row, columns))
    ) {
      return inspection("invalid", schemaVersion, missingTables, unexpectedTables, "BACKUP_ROWS_INVALID");
    }
  }
  return inspection("current", schemaVersion, [], [], "BACKUP_CURRENT");
}

export async function restoreLogicalDatabaseBackup(
  value: unknown,
  databaseOverride?: D1Database,
) {
  const inspected = inspectLogicalDatabaseBackup(value);
  if (inspected.status !== "current") throw new Error(inspected.reason);
  const backup = value as LogicalDatabaseBackup;
  const database = databaseOverride ?? await requireDatabase();
  await assertDatabaseTableCoverage(database);
  const liveSchema = await readDatabaseSchema(database);
  for (const table of LOGICAL_BACKUP_TABLES) {
    if (!sameStrings(liveSchema[table], backup.schema[table])) {
      throw new Error("RESTORE_DATABASE_SCHEMA_MISMATCH");
    }
  }
  const statements = [
    ...[...LOGICAL_BACKUP_TABLES].reverse().map((table) =>
      database.prepare(`DELETE FROM ${quoteIdentifier(table)}`),
    ),
    ...LOGICAL_BACKUP_TABLES.map((table) => {
      const columns = backup.schema[table];
      const identifiers = columns.map(quoteIdentifier).join(", ");
      const values = columns
        .map((column) => `json_extract(value, '$.${column}')`)
        .join(", ");
      return database
        .prepare(
          `INSERT INTO ${quoteIdentifier(table)} (${identifiers}) SELECT ${values} FROM json_each(?)`,
        )
        .bind(JSON.stringify(backup.tables[table]));
    }),
  ];
  await database.batch(statements);
  return { restored: true as const, schemaVersion: LOGICAL_BACKUP_SCHEMA_VERSION };
}

async function readDatabaseSchema(database: D1Database) {
  const entries: Array<readonly [BackupTable, string[]]> = [];
  for (const table of LOGICAL_BACKUP_TABLES) {
    entries.push([table, await readTableColumns(database, table)]);
  }
  return Object.fromEntries(entries) as BackupSchema;
}

async function assertDatabaseTableCoverage(database: D1Database) {
  const result = await database
    .prepare(
      `SELECT name FROM sqlite_schema
        WHERE type = 'table'
        ORDER BY name`,
    )
    .all<{ name: string }>();
  assertBackupTableInventory(result.results.map((row) => row.name));
}

export function assertBackupTableInventory(tableNames: readonly string[]) {
  const availableTables = new Set(tableNames);
  if (LOGICAL_BACKUP_TABLES.some((table) => !availableTables.has(table))) {
    throw new Error("BACKUP_DATABASE_SCHEMA_MISMATCH");
  }
}

function isOwnerAuthenticationTable(table: BackupTable) {
  return table === "admin_owner_credentials" || table === "admin_owner_sessions";
}

function mapRawBackupRows(rawRows: unknown[][]): [string[], Record<string, unknown>[]] {
  const [rawColumns, ...rawValues] = rawRows;
  if (
    !isBackupColumnNames(rawColumns) ||
    new Set(rawColumns).size !== rawColumns.length
  ) {
    throw new Error("BACKUP_DATABASE_SCHEMA_MISMATCH");
  }
  const columns = [...rawColumns];
  const rows = rawValues.map((values) => {
    if (!Array.isArray(values) || values.length !== columns.length) {
      throw new Error("BACKUP_DATABASE_SCHEMA_MISMATCH");
    }
    return Object.fromEntries(
      columns.map((column, index) => [column, values[index]]),
    );
  });
  return [columns, rows];
}

function isBackupColumnNames(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((column) => typeof column === "string" && column.length > 0);
}

async function readTableColumns(database: D1Database, table: BackupTable) {
  const result = await database
    .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
    .all<{ name: string; cid: number }>();
  return [...result.results]
    .sort((left, right) => left.cid - right.cid)
    .map((column) => column.name);
}

function rowMatchesSchema(value: unknown, columns: readonly string[]) {
  if (!isRecord(value)) return false;
  return sameStrings(Object.keys(value).sort(), [...columns].sort());
}

function sameStrings(left: readonly string[] | undefined, right: readonly string[]) {
  return Boolean(
    left &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]),
  );
}

function inspection(
  status: BackupInspection["status"],
  schemaVersion: number | null,
  missingTables: readonly string[],
  unexpectedTables: readonly string[],
  reason: string,
): BackupInspection {
  return {
    status,
    schemaVersion,
    missingTables: [...missingTables],
    unexpectedTables: [...unexpectedTables],
    reason,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function requireDatabase() {
  const bindings = await getRuntimeEnv<{ DB?: D1Database }>();
  if (!bindings.DB) throw new Error("DATABASE_UNAVAILABLE");
  return bindings.DB;
}
