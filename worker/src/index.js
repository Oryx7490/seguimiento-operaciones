import "dotenv/config";
import pg from "pg";
import { runFaceScan, runFaceTraining } from "./faces.js";
import { runSfaceScan, runSfaceSuggestions } from "./sface.js";
import { runOcrScan } from "./ocr.js";
import { runAttendanceCandidates } from "./attendance-candidates.js";
import { scheduleNightlyExpensePhotoScan } from "./expense-photos.js";

const connectionString = process.env.DATABASE_URL;
const webUrl = process.env.WEB_INTERNAL_URL || "http://web:3000";
const workerToken = process.env.WORKER_TOKEN;
const faceUrl = process.env.FACE_SERVICE_URL || "";
const faceEnabled = process.env.FACE_SCAN_ENABLED !== "false" && Boolean(faceUrl);
const faceSfaceEnabled = process.env.FACE_SFACE_ENABLED !== "false";
const faceIntervalMs = Number(process.env.FACE_SCAN_INTERVAL_MS || 15 * 60 * 1000);
const trainingIntervalMs = Number(process.env.FACE_TRAIN_INTERVAL_MS || 24 * 60 * 60 * 1000);
const expensePhotoEnabled = process.env.EXPENSE_PHOTO_SCAN_ENABLED !== "false";
const parsedExpensePhotoHour = Number(process.env.EXPENSE_PHOTO_SCAN_HOUR || 1);
const expensePhotoHour = Number.isFinite(parsedExpensePhotoHour)
  ? Math.min(23, Math.max(0, Math.trunc(parsedExpensePhotoHour)))
  : 1;

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
  let stopExpensePhotoScan;

  if (expensePhotoEnabled) {
    stopExpensePhotoScan = scheduleNightlyExpensePhotoScan({
      pool,
      webUrl,
      workerToken,
      hour: expensePhotoHour,
    });
    console.log(`[expense photos] programación nocturna activa a las ${String(expensePhotoHour).padStart(2, "0")}:00; hasta 100 fotos por lote`);
  }

  if (faceEnabled) {
    const faceScan = async () => {
      if (shuttingDown) return;
      // Se repite hasta ponerse al día (las fotos del día entran en pocos minutos).
      const MAX_ROUNDS = 40;
      for (let round = 0; round < MAX_ROUNDS && !shuttingDown; round++) {
        let pending = 0;
        try {
          const r = await runFaceScan({ pool, webUrl, faceUrl });
          pending += r.pending || 0;
          if (r.pending > 0) {
            console.log(
              `[faces] ${new Date().toISOString()} pendientes=${r.pending} procesadas=${r.processed} rostros=${r.faces} fallidas=${r.failed}`
            );
          }
          if (faceSfaceEnabled) {
            const s = await runSfaceScan({ pool, webUrl, faceUrl });
            pending += s.pending || 0;
            if (s.pending > 0) {
              console.log(
                `[sface] ${new Date().toISOString()} pendientes=${s.pending} procesadas=${s.processed} embeddings=${s.embeddings} fallidas=${s.failed}`
              );
            }
          }
        } catch (err) {
          console.error("[faces] error en escaneo:", err.message);
          break;
        }
        try {
          const o = await runOcrScan({ pool, webUrl, faceUrl });
          pending += o.pending || 0;
          if (o.pending > 0) {
            console.log(`[ocr] ${new Date().toISOString()} pendientes=${o.pending} procesadas=${o.processed} fallidas=${o.failed}`);
          }
        } catch (err) {
          console.error("[ocr] error en escaneo:", err.message);
          break;
        }
        if (pending === 0) break;
      }
      try {
        const c = await runAttendanceCandidates({ pool });
        if (c.processed > 0) {
          console.log(`[asistencia] ${new Date().toISOString()} candidatos=${c.processed}`);
        }
      } catch (err) {
        console.error("[asistencia] error al generar candidatos:", err.message);
      }
    };
    const faceTraining = async () => {
      if (shuttingDown) return;
      try {
        const t = await runFaceTraining({ pool });
        const clf = t.classifier && !t.classifier.skipped ? ` clasificador=v${t.classifier.version} acc_entrenamiento=${Number(t.classifier.accuracy).toFixed(3)}` : " clasificador=sin-datos";
        let sface = "";
        if (faceSfaceEnabled) {
          try {
            const s = await runSfaceSuggestions({ pool });
            sface = ` sface_embeddings=${s.embeddings} identidades=${s.identities} candidatos=${s.suggestions} aceptados=${s.accepted_suggestions}`;
          } catch (err) {
            console.error("[sface] error en comparación experimental:", err.message);
          }
        }
        console.log(
          `[faces] ${new Date().toISOString()} entrenamiento v${t.version} identidades=${t.identities} caras=${t.faces} ejemplos_confirmados=${t.assignments} sug_centroide=${t.suggestions} sug_clf=${t.classifierSuggestions}${clf}${sface}`
        );
      } catch (err) {
        console.error("[faces] error en entrenamiento:", err.message);
      }
    };
    console.log(`[faces] activo, escaneo cada ${Math.round(faceIntervalMs / 60000)}min; sface_experimental=${faceSfaceEnabled}`);
    setTimeout(async () => {
      await faceScan();
      await faceTraining();
    }, 15000);
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
    if (stopExpensePhotoScan) stopExpensePhotoScan();
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
