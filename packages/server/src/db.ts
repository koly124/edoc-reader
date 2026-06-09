import { appConfig } from "@file-reader/shared";
import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: appConfig.server.databaseUrl,
});

export async function runMigrations(): Promise<void> {
  const sql = readFileSync(join(__dirname, "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("Migrations applied.");
}
