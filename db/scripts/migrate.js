import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
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

const MIGRATIONS_TABLE = "schema_migrations";

async function ensureTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version     integer PRIMARY KEY,
      name        text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now(),
      checksum    text NOT NULL
    );
  `);
}

function parseVersion(filename) {
  const match = /^(\d{3})[-_](.+)\.sql$/i.exec(filename);
  if (!match) return null;
  return { version: Number(match[1]), name: filename };
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function main() {
  await client.connect();
  try {
    await ensureTable();

    const files = readdirSync(MIGRATIONS_DIR)
      .map(parseVersion)
      .filter(Boolean)
      .sort((a, b) => a.version - b.version);

    if (files.length === 0) {
      console.log("No hay migraciones pendientes (directorio vacío).");
      return;
    }

    const { rows } = await client.query(
      `SELECT version, checksum FROM ${MIGRATIONS_TABLE} ORDER BY version`
    );
    const applied = new Map(rows.map((r) => [r.version, r.checksum]));

    for (const file of files) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file.name), "utf8");
      const checksum = sha256(sql);

      const previous = applied.get(file.version);
      if (previous !== undefined) {
        if (previous !== checksum) {
          throw new Error(
            `Migración ${file.name} ya aplicada con distinto contenido. ` +
              `Revisa el archivo o restaura el respaldo; no edites migraciones aplicadas.`
          );
        }
        console.log(`- ${file.name}: ya aplicada`);
        continue;
      }

      console.log(`Aplicando ${file.name}...`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          `INSERT INTO ${MIGRATIONS_TABLE} (version, name, checksum) VALUES ($1, $2, $3)`,
          [file.version, file.name, checksum]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Fallo en ${file.name}: ${err.message}`, { cause: err });
      }
    }
    console.log("Migraciones al día.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});