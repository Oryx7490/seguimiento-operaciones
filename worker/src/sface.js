// Prueba paralela OpenCV SFace. No escribe en face_assignments ni afecta el
// reconocimiento, la asistencia o el entrenamiento de buffalo_l.

const PROVIDER = "opencv";
const MODEL = "opencv_sface";
const MODEL_VERSION = "2021dec";
const DETECTOR_MODEL = "buffalo_l";
const BATCH_SIZE = Math.max(1, Math.min(1000, Math.trunc(Number(process.env.FACE_SFACE_BATCH_SIZE) || 250)));

async function fetchImageBytes(webUrl, sha256) {
  const res = await fetch(`${webUrl}/api/whatsapp/media/${sha256}`);
  if (!res.ok) throw new Error(`web ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function recordAnalysis(pool, sha256, state, error, result) {
  await pool.query(
    `DELETE FROM whatsapp_capture.media_analyses
      WHERE sha256 = $1 AND analysis_type = 'face_embedding' AND model = $2`,
    [sha256, MODEL]
  );
  await pool.query(
    `INSERT INTO whatsapp_capture.media_analyses
       (sha256, analysis_type, provider, model, model_version, state, result, error_message, completed_at)
     VALUES ($1, 'face_embedding', $2, $3, $4, $5::whatsapp_capture.analysis_state, $6::jsonb, $7, $8)`,
    [
      sha256,
      PROVIDER,
      MODEL,
      MODEL_VERSION,
      state,
      JSON.stringify(result || {}),
      error,
      state === "completed" ? new Date() : null,
    ]
  );
}

function bboxKey(bbox) {
  return [bbox.x, bbox.y, bbox.w, bbox.h].map((v) => Math.round(Number(v))).join("-");
}

export async function runSfaceScan({ pool, webUrl, faceUrl, batchSize = BATCH_SIZE, log = console }) {
  if (!faceUrl) return { skipped: true, processed: 0, embeddings: 0, failed: 0, pending: 0 };

  const { rows } = await pool.query(
    `SELECT mo.sha256
       FROM whatsapp_capture.media_objects mo
      WHERE mo.state = 'stored' AND mo.content_type LIKE 'image/%'
        AND EXISTS (
          SELECT 1 FROM whatsapp_capture.media_analyses a
           WHERE a.sha256 = mo.sha256 AND a.analysis_type = 'face_detect'
             AND a.model = $1 AND a.state = 'completed'
        )
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_capture.media_analyses a
           WHERE a.sha256 = mo.sha256 AND a.analysis_type = 'face_embedding'
             AND a.model = $2 AND a.state IN ('completed', 'running', 'failed')
        )
      ORDER BY mo.created_at ASC
      LIMIT $3`,
    [DETECTOR_MODEL, MODEL, batchSize]
  );

  let processed = 0;
  let embeddings = 0;
  let failed = 0;
  for (const { sha256 } of rows) {
    try {
      const image = await fetchImageBytes(webUrl, sha256);
      const response = await fetch(`${faceUrl}/sface`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: image.toString("base64") }),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        const hard = response.status >= 400 && response.status < 500;
        if (hard) failed++;
        await recordAnalysis(pool, sha256, hard ? "failed" : "pending", detail, {});
        continue;
      }

      const data = await response.json();
      let stored = 0;
      for (const face of data.faces || []) {
        const vector = `[${face.embedding.map((v) => Number(v).toFixed(7)).join(",")}]`;
        const insert = await pool.query(
          `INSERT INTO whatsapp_capture.face_sface_embeddings
             (face_id, model_name, model_version, embedding)
           SELECT f.id, $3, $4, $5::vector
             FROM whatsapp_capture.faces f
            WHERE f.sha256 = $1 AND f.model_name = $2 AND f.bbox_key = $6
           ON CONFLICT (face_id, model_name, model_version)
           DO UPDATE SET embedding = EXCLUDED.embedding, created_at = now()`,
          [sha256, DETECTOR_MODEL, MODEL, MODEL_VERSION, vector, bboxKey(face.bbox)]
        );
        stored += insert.rowCount;
      }
      await recordAnalysis(pool, sha256, "completed", null, {
        count: data.count ?? (data.faces || []).length,
        stored,
        width: data.width,
        height: data.height,
      });
      embeddings += stored;
      processed++;
    } catch (err) {
      failed++;
      log.error(`[sface] error en ${sha256.slice(0, 10)}: ${err.message}`);
    }
  }

  return { processed, embeddings, failed, pending: rows.length };
}

export async function runSfaceSuggestions({
  pool,
  threshold = Number(process.env.FACE_SFACE_THRESHOLD || 0.363),
  margin = Number(process.env.FACE_SFACE_MARGIN || 0.05),
}) {
  await pool.query(`DELETE FROM whatsapp_capture.face_sface_suggestions`);

  const result = await pool.query(
    `WITH manual_centroids AS (
       SELECT fa.identity_id, avg(se.embedding) AS centroid
         FROM whatsapp_capture.face_assignments fa
         JOIN whatsapp_capture.face_sface_embeddings se ON se.face_id = fa.face_id
        WHERE fa.source = 'manual'
          AND se.model_name = $1 AND se.model_version = $2
        GROUP BY fa.identity_id
       HAVING count(*) >= 2
     ), ranked AS (
       SELECT se.face_id, mc.identity_id,
              1 - (se.embedding <=> mc.centroid) AS similarity,
              row_number() OVER (
                PARTITION BY se.face_id ORDER BY se.embedding <=> mc.centroid, mc.identity_id
              ) AS place,
              lead(1 - (se.embedding <=> mc.centroid)) OVER (
                PARTITION BY se.face_id ORDER BY se.embedding <=> mc.centroid, mc.identity_id
              ) AS second_similarity
         FROM whatsapp_capture.face_sface_embeddings se
         CROSS JOIN manual_centroids mc
        WHERE se.model_name = $1 AND se.model_version = $2
          AND (SELECT count(*) FROM manual_centroids) >= 2
          AND NOT EXISTS (
            SELECT 1 FROM whatsapp_capture.face_assignments fa
             WHERE fa.face_id = se.face_id AND fa.source = 'manual'
          )
     )
     INSERT INTO whatsapp_capture.face_sface_suggestions
       (face_id, identity_id, best_similarity, second_similarity, accepted, model_version)
     SELECT face_id, identity_id, similarity, second_similarity,
            similarity >= $3 AND (second_similarity IS NULL OR similarity - second_similarity >= $4),
            $2
       FROM ranked WHERE place = 1
     ON CONFLICT (face_id) DO UPDATE SET
       identity_id = EXCLUDED.identity_id,
       best_similarity = EXCLUDED.best_similarity,
       second_similarity = EXCLUDED.second_similarity,
       accepted = EXCLUDED.accepted,
       model_version = EXCLUDED.model_version,
       created_at = now()`,
    [MODEL, MODEL_VERSION, threshold, margin]
  );

  const counts = await pool.query(
    `SELECT
       (SELECT count(DISTINCT fa.identity_id)::int
          FROM whatsapp_capture.face_assignments fa
          JOIN whatsapp_capture.face_sface_embeddings se ON se.face_id = fa.face_id
         WHERE fa.source = 'manual' AND se.model_name = $1 AND se.model_version = $2) AS identities,
       (SELECT count(*)::int FROM whatsapp_capture.face_sface_embeddings
         WHERE model_name = $1 AND model_version = $2) AS embeddings,
       (SELECT count(*)::int FROM whatsapp_capture.face_sface_suggestions WHERE accepted) AS accepted_suggestions`,
    [MODEL, MODEL_VERSION]
  );
  return { suggestions: result.rowCount, ...counts.rows[0] };
}
