// Extracción de texto (OCR) de las fotos, con candidatos de asistencia (V50).
import { parseAttendance } from "./attendance-parse.js";

const OCR_PROVIDER = "tesseract";
const OCR_MODEL = "tesseract";

async function fetchImageBytes(webUrl, sha256) {
  const res = await fetch(`${webUrl}/api/whatsapp/media/${sha256}`);
  if (!res.ok) throw new Error(`web ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function recordOcr(pool, sha256, state, error, result) {
  await pool.query(
    `DELETE FROM whatsapp_capture.media_analyses
      WHERE sha256 = $1 AND analysis_type = 'ocr' AND provider = $2`,
    [sha256, OCR_PROVIDER]
  );
  await pool.query(
    `INSERT INTO whatsapp_capture.media_analyses
       (sha256, analysis_type, provider, model, model_version, state, result, error_message, completed_at)
     VALUES ($1, 'ocr', $2, $3, NULL, $4::whatsapp_capture.analysis_state, $5::jsonb, $6, $7)`,
    [sha256, OCR_PROVIDER, OCR_MODEL, state, JSON.stringify(result || {}), error, state === "completed" ? new Date() : null]
  );
}

export async function runOcrScan({ pool, webUrl, faceUrl, batchSize = 25, log = console }) {
  if (!faceUrl) return { skipped: true, processed: 0, pending: 0 };

  const { rows } = await pool.query(
    `SELECT mo.sha256,
            (SELECT m.body_text
               FROM whatsapp_capture.message_media mm
               JOIN whatsapp_capture.messages m ON m.id = mm.message_id
              WHERE mm.sha256 = mo.sha256
              ORDER BY m.received_at DESC LIMIT 1) AS caption
       FROM whatsapp_capture.media_objects mo
      WHERE mo.state = 'stored' AND mo.content_type LIKE 'image/%'
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_capture.media_analyses a
           WHERE a.sha256 = mo.sha256 AND a.analysis_type = 'ocr'
             AND a.state IN ('completed', 'running', 'failed')
        )
      ORDER BY mo.created_at ASC
      LIMIT $1`,
    [batchSize]
  );

  let processed = 0;
  let failed = 0;

  for (const { sha256, caption } of rows) {
    try {
      const buf = await fetchImageBytes(webUrl, sha256);
      const res = await fetch(`${faceUrl}/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: buf.toString("base64") }),
      });
      if (!res.ok) {
        const text = (await res.text()).slice(0, 300);
        const hard = res.status >= 400 && res.status < 500;
        if (hard) failed++;
        await recordOcr(pool, sha256, hard ? "failed" : "pending", text, {});
        continue;
      }
      const data = await res.json();
      const lines = data.lines || [];
      const parsed = parseAttendance(lines, caption);
      await recordOcr(pool, sha256, "completed", null, {
        text: data.text ?? "",
        lines,
        mean_conf: data.mean_conf ?? null,
        lang: data.lang ?? null,
        parsed,
      });
      processed++;
    } catch (err) {
      failed++;
      log.error(`[ocr] error en ${sha256.slice(0, 10)}: ${err.message}`);
    }
  }

  return { processed, failed, pending: rows.length };
}
