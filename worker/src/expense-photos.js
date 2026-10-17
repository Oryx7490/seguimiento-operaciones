const NIGHTLY_BATCH_LIMIT = 100;

export async function runExpensePhotoScan({ pool, webUrl, workerToken }) {
  if (!workerToken) return { skipped: true, reason: "WORKER_TOKEN no configurado" };
  const { rows } = await pool.query(
    `SELECT mo.sha256
       FROM whatsapp_capture.media_objects mo
      WHERE mo.state = 'stored'
        AND EXISTS (
          SELECT 1 FROM whatsapp_capture.message_media mm
           WHERE mm.sha256 = mo.sha256 AND mm.state = 'stored' AND mm.media_kind = 'image'
        )
        AND EXISTS (
          SELECT 1 FROM whatsapp_capture.media_analyses face_analysis
           WHERE face_analysis.sha256 = mo.sha256
             AND face_analysis.analysis_type = 'face_detect'
             AND face_analysis.model = 'buffalo_l'
             AND face_analysis.state = 'completed'
             AND CASE
                   WHEN jsonb_typeof(face_analysis.result->'count') = 'number'
                   THEN (face_analysis.result->>'count')::numeric = 0
                   ELSE false
                 END
        )
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_capture.faces face
           WHERE face.sha256 = mo.sha256
        )
        AND (SELECT count(*)
               FROM whatsapp_capture.message_media duplicate_copy
              WHERE duplicate_copy.sha256 = mo.sha256
                AND duplicate_copy.state = 'stored'
                AND duplicate_copy.media_kind = 'image') = 1
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_capture.expense_photo_reviews r
           WHERE r.sha256 = mo.sha256 AND r.review_status <> 'pending'
        )
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_capture.media_analyses a
           WHERE a.sha256 = mo.sha256 AND a.analysis_type = 'expense_document'
             AND (a.state = 'completed' OR (a.state = 'running' AND a.created_at > now() - interval '2 hours'))
        )
      ORDER BY mo.created_at
      LIMIT $1`,
    [NIGHTLY_BATCH_LIMIT]
  );

  let processed = 0;
  let failed = 0;
  let stoppedForAuthOrConfig = false;
  for (const row of rows) {
    try {
      const response = await fetch(`${webUrl}/api/admin/gasto-fotos/procesar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-token": workerToken },
        body: JSON.stringify({ sha256: String(row.sha256).trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        failed += 1;
        console.error(`[expense photos] HTTP ${response.status}: ${payload?.error ?? "error desconocido"}`);
        if (response.status === 401 || response.status === 403 || response.status === 503) {
          stoppedForAuthOrConfig = true;
          break;
        }
      } else {
        processed += 1;
      }
    } catch (error) {
      failed += 1;
      console.error("[expense photos] error al procesar foto:", error?.message ?? error);
    }
  }
  return { pending: rows.length, processed, failed, stopped_for_config: stoppedForAuthOrConfig };
}

export function scheduleNightlyExpensePhotoScan({ pool, webUrl, workerToken, hour = 1 }) {
  let timer;
  let stopped = false;

  const scheduleNext = () => {
    if (stopped) return;
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - now.getTime();
    console.log(`[expense photos] siguiente lote: ${next.toLocaleString()}`);
    timer = setTimeout(async () => {
      if (stopped) return;
      try {
        console.log("[expense photos] inicia procesamiento nocturno, máximo 100 fotos");
        const result = await runExpensePhotoScan({ pool, webUrl, workerToken });
        if (result.pending > 0 || result.skipped) console.log("[expense photos] lote terminado", result);
      } catch (error) {
        console.error("[expense photos] error en lote nocturno:", error?.message ?? error);
      }
      scheduleNext();
    }, delay);
  };

  scheduleNext();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
