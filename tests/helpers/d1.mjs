import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

export async function createD1Database() {
  const sqlite = new DatabaseSync(":memory:");
  const journal = JSON.parse(await readFile(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const migration of journal.entries) {
    const sql = await readFile(new URL("../../drizzle/" + migration.tag + ".sql", import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  let failPattern = null;
  const queries = [];
  const database = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      const execute = (operation) => {
        queries.push(sql);
        if (failPattern?.test(sql)) { failPattern = null; throw new Error("D1_TEST_FAILURE"); }
        return operation();
      };
      const prepared = {
        bind(...next) { values = next; return prepared; },
        async first() { return execute(() => statement.get(...values) ?? null); },
        async all() { return execute(() => ({ results: statement.all(...values), success: true, meta: {} })); },
        async run() { return execute(() => ({ results: [], success: true, meta: { changes: Number(statement.run(...values).changes) } })); },
      };
      return prepared;
    },
    async batch(statements) {
      // Match D1's all-or-nothing batch contract, including dependency failures.
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  return { database, sqlite, queries, failNext: (pattern) => { failPattern = pattern; }, close: () => sqlite.close() };
}
