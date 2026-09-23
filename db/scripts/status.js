import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

// Cargar .env desde la raíz del proyecto (sea cual sea el cwd).
process.env.DOTENV_CONFIG_PATH = path.resolve(__dirname, "../../.env");
await import("dotenv/config");

const connectionString =
  process.env.DATABASE_URL ??
  `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@localhost:5433/${process.env.POSTGRES_DB}`;

const client = new pg.Client({ connectionString });

async function ensureTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     integer PRIMARY KEY,
      name        text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now(),
      checksum    text NOT NULL
    );
  `);
}

async function main() {
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(72401)");
    try {
      await ensureTable();
      const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => /^\d{3}[-_].+\.sql$/i.test(f))
        .sort();

      const { rows } = await client.query(
        "SELECT version, name, applied_at FROM schema_migrations ORDER BY version"
      );
      const applied = new Map(rows.map((r) => [String(r.version).padStart(3, "0"), r]));

      console.log("Migraciones:\n");
      if (files.length === 0) console.log("  (sin migraciones en db/migrations)");
      for (const f of files) {
        const prefix = f.slice(0, 3);
        const a = applied.get(prefix);
        console.log(`  ${a ? "[aplicada] " : "[pendiente]"} ${f}${a ? `  (${a.applied_at.toISOString()})` : ""}`);
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(72401)");
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});