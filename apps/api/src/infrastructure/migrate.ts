import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(9134421)");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const directory = resolve(process.cwd(), "../../database/migrations");
    for (const name of (await readdir(directory)).filter(file => file.endsWith(".sql")).sort()) {
      const applied = await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name]);
      if (applied.rowCount) continue;
      await client.query("BEGIN");
      try { await client.query(await readFile(resolve(directory, name), "utf8")); await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]); await client.query("COMMIT"); console.log(`Applied ${name}`); } catch (error) { await client.query("ROLLBACK"); throw error; }
    }
    if (process.env.SEED_DEMO === "true") {
      if (process.env.NODE_ENV === "production") throw new Error("Seed demo não permitido em produção");
      await client.query(await readFile(resolve(directory, "../seed-demo.sql"), "utf8"));
    }
  } finally { await client.query("SELECT pg_advisory_unlock(9134421)"); client.release(); await pool.end(); }
}
migrate().catch(error => { console.error(error); process.exitCode = 1; });