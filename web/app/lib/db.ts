import { Pool } from "pg";

declare global {
  var __dbPool: import("pg").Pool | undefined;
}

const connectionString =
  process.env.DATABASE_URL ??
  `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.PGHOST ?? "localhost"}:${process.env.PGPORT ?? "5433"}/${process.env.POSTGRES_DB}`;

function createPool() {
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}

const pool = global.__dbPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
  global.__dbPool = pool;
}

export default pool;