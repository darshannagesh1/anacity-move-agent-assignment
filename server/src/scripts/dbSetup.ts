import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "../db.js";

const sqlDir = path.resolve(import.meta.dirname, "../../sql");

async function runFile(name: string) {
  const sql = await readFile(path.join(sqlDir, name), "utf8");
  await pool.query(sql);
  console.log(`Ran ${name}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it to server/.env.");
  }

  await runFile("schema.sql");
  await runFile("seed.sql");

  const { rows } = await pool.query<{
    id: string;
    name: string;
    units: number;
    units_with_dues: number;
    residents: number;
  }>(`
    SELECT c.id, c.name,
      (SELECT count(*)::int FROM units u WHERE u.community_id = c.id) AS units,
      (SELECT count(*)::int FROM units u WHERE u.community_id = c.id AND u.pending_dues > 0) AS units_with_dues,
      (SELECT count(*)::int FROM residents r WHERE r.community_id = c.id) AS residents
    FROM communities c
    ORDER BY c.id
  `);

  console.log(`\nSeeded ${rows.length} communities:`);
  for (const row of rows) {
    console.log(
      `  ${row.id} (${row.name}): ${row.units} units, ${row.units_with_dues} with pending dues, ${row.residents} residents`,
    );
  }
}

main()
  .catch((err) => {
    console.error("DB setup failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
