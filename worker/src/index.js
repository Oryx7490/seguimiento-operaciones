import "dotenv/config";
import pg from "pg";
import { runFaceScan, runFaceTraining } from "./faces.js";

const connectionString = process.env.DATABASE_URL;
const webUrl = process.env.WEB_INTERNAL_URL || "http://web:3000";
const workerToken = process.env.WORKER_TOKEN;
const faceUrl = process.env.FACE_SERVICE_URL || "";
const faceEnabled = process.env.FACE_SCAN_ENABLED !== "false" && Boolean(faceUrl);
const faceIntervalMs = Number(process.env.FACE_SCAN_INTERVAL_MS || 6 * 60 * 60 * 1000);
const trainingIntervalMs = Number(process.env.FACE_TRAIN_INTERVAL_MS || 24 * 60 * 60 * 1000);

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

  let faceTimer;
  let trainingTimer;

  if (faceEnabled) {
    const faceScan = async () => {
      if (shuttingDown) return;
      try {
        const r = await runFaceScan({ pool, webUrl, faceUrl });
        if (r.pending > 0) {
          console.log(
            `[faces] ${new Date().toISOString()} pendientes=${r.pending} procesadas=${r.processed} rostros=${r.faces} fallidas=${r.failed}`
          );
        }
      } catch (err) {
        console.error("[faces] error en escaneo:", err.message);
      }
    };
    const faceTraining = async () => {
      if (shuttingDown) return;
      try {
        const t = await runFaceTraining({ pool });
        const clf = t.classifier && !t.classifier.skipped ? ` clasificador=v${t.classifier.version} acc=${Number(t.classifier.accuracy).toFixed(3)}` : " clasificador=sin-datos";
        console.log(
          `[faces] ${new Date().toISOString()} entrenamiento v${t.version} identidades=${t.identities} caras=${t.faces} sug_centroide=${t.suggestions} sug_clf=${t.classifierSuggestions}${clf}`
        );
      } catch (err) {
        console.error("[faces] error en entrenamiento:", err.message);
      }
    };
    console.log(`[faces] activo, escaneo cada ${Math.round(faceIntervalMs / 60000)}min`);
    setTimeout(faceScan, 15000);
    faceTimer = setInterval(faceScan, faceIntervalMs);
    trainingTimer = setInterval(faceTraining, trainingIntervalMs);
  } else {
    console.log("[faces] deshabilitado (FACE_SCAN_ENABLED=false o sin FACE_SERVICE_URL)");
  }

  const stop = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(timer);
    if (faceTimer) clearInterval(faceTimer);
    if (trainingTimer) clearInterval(trainingTimer);
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
