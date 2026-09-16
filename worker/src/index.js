import "dotenv/config";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;

const TIMERS = {
  one_day_ms: 24 * 60 * 60 * 1000,
  scan_interval_ms: 60 * 1000,
};

let shuttingDown = false;

async function main() {
  if (!connectionString) {
    console.error("Falta DATABASE_URL");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });

  async function tick() {
    if (shuttingDown) return;
    try {
      await pool.query("SELECT 1");
      console.log(`[worker] tick ${new Date().toISOString()} — base de datos OK`);
    } catch (err) {
      console.error("[worker] error en tick:", err.message);
    }
  }

  console.log("[worker] iniciado, escaneo cada 60s");
  await tick();
  const timer = setInterval(tick, TIMERS.scan_interval_ms);

  const stop = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(timer);
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});