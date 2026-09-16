import "dotenv/config";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const webUrl = process.env.WEB_INTERNAL_URL || "http://web:3000";
const workerToken = process.env.WORKER_TOKEN;

const TIMERS = {
  scan_interval_ms: 60 * 1000,
};

let shuttingDown = false;

async function main() {
  if (!connectionString) {
    console.error("Falta DATABASE_URL");
    process.exit(1);
  }
  if (!workerToken) {
    console.error("[worker] falta WORKER_TOKEN; el escaneo de alertas quedará deshabilitado");
  }

  const pool = new pg.Pool({ connectionString });

  async function scan() {
    if (shuttingDown) return;
    try {
      await pool.query("SELECT 1");
    } catch (err) {
      console.error("[worker] base de datos no disponible:", err.message);
      return;
    }
    if (!workerToken) return;
    try {
      const res = await fetch(`${webUrl}/api/internal/scan`, {
        method: "POST",
        headers: { "x-worker-token": workerToken },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.error(`[worker] escaneo HTTP ${res.status}:`, data?.error ?? "");
        return;
      }
      const { alerts, delivered } = data;
      if (alerts > 0 || delivered?.sent > 0 || delivered?.failed > 0) {
        console.log(
          `[worker] ${new Date().toISOString()} alertas=${alerts} enviadas=${delivered?.sent ?? 0} fallidas=${delivered?.failed ?? 0}`
        );
      }
    } catch (err) {
      console.error("[worker] error al escanear alertas:", err.message);
    }
  }

  console.log("[worker] iniciado, escaneo cada 60s");
  await scan();
  const timer = setInterval(scan, TIMERS.scan_interval_ms);

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
