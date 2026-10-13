// Detección de rostros + embeddings (V49).
// - runFaceScan: busca fotos sin analizar, pide embeddings a face-service y los guarda en pgvector.
// - runFaceTraining: recalcula centroides por identidad, versiona el modelo y sugiere asignaciones.

const MODEL = "buffalo_l";

async function fetchImageBytes(webUrl, sha256) {
  const res = await fetch(`${webUrl}/api/whatsapp/media/${sha256}`);
  if (!res.ok) throw new Error(`web ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function recordAnalysis(pool, sha256, state, error, result) {
  await pool.query(
    `DELETE FROM whatsapp_capture.media_analyses WHERE sha256 = $1 AND analysis_type = 'face_detect' AND model = $2`,
    [sha256, MODEL]
  );
  await pool.query(
    `INSERT INTO whatsapp_capture.media_analyses
       (sha256, analysis_type, provider, model, model_version, state, result, error_message, completed_at)
     VALUES ($1, 'face_detect', 'insightface', $2, $2, $3::whatsapp_capture.analysis_state, $4::jsonb, $5, $6)`,
    [sha256, MODEL, state, JSON.stringify(result || {}), error, state === "completed" ? new Date() : null]
  );
}

function bboxKey(bbox) {
  return [
    Math.round(bbox.x),
    Math.round(bbox.y),
    Math.round(bbox.w),
    Math.round(bbox.h),
  ].join("-");
}

export async function runFaceScan({ pool, webUrl, faceUrl, batchSize = 25, log = console }) {
  if (!faceUrl) return { skipped: true, processed: 0, faces: 0, failed: 0, pending: 0 };

  const { rows } = await pool.query(
    `SELECT mo.sha256
       FROM whatsapp_capture.media_objects mo
      WHERE mo.state = 'stored' AND mo.content_type LIKE 'image/%'
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_capture.media_analyses a
           WHERE a.sha256 = mo.sha256 AND a.analysis_type = 'face_detect' AND a.model = $1
             AND a.state IN ('completed', 'running', 'failed')
        )
      ORDER BY mo.created_at ASC
      LIMIT $2`,
    [MODEL, batchSize]
  );

  let processed = 0;
  let faces = 0;
  let failed = 0;

  for (const { sha256 } of rows) {
    try {
      const buf = await fetchImageBytes(webUrl, sha256);
      const detRes = await fetch(`${faceUrl}/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: buf.toString("base64") }),
      });
      if (!detRes.ok) {
        const text = (await detRes.text()).slice(0, 300);
        const hard = detRes.status >= 400 && detRes.status < 500;
        if (hard) failed++;
        await recordAnalysis(pool, sha256, hard ? "failed" : "pending", text, {});
        continue;
      }
      const data = await detRes.json();
      for (const f of data.faces || []) {
        const vec = `[${f.embedding.map((v) => Number(v).toFixed(6)).join(",")}]`;
        await pool.query(
          `INSERT INTO whatsapp_capture.faces
             (sha256, bbox, bbox_key, det_score, embedding, model_name, model_version)
           VALUES ($1, $2::jsonb, $3, $4, $5::vector, $6, $6)
           ON CONFLICT (sha256, model_name, bbox_key) DO NOTHING`,
          [sha256, JSON.stringify(f.bbox), bboxKey(f.bbox), f.det_score, vec, MODEL]
        );
      }
      await recordAnalysis(pool, sha256, "completed", null, {
        count: data.count ?? (data.faces || []).length,
        width: data.width,
        height: data.height,
      });
      faces += data.count ?? (data.faces || []).length;
      processed++;
    } catch (err) {
      // Error transitorio (red/MinIO): no se marca, se reintenta en el siguiente ciclo.
      failed++;
      log.error(`[faces] error en ${sha256.slice(0, 10)}: ${err.message}`);
    }
  }

  return { processed, faces, failed, pending: rows.length };
}

export async function runFaceTraining({ pool, scanThreshold = 0.35, log = console }) {
  // 1) Centroide y conteo por identidad.
  await pool.query(
    `WITH c AS (
       SELECT fa.identity_id, count(*)::int AS cnt, avg(f.embedding) AS cent
         FROM whatsapp_capture.face_assignments fa
         JOIN whatsapp_capture.faces f ON f.id = fa.face_id
        GROUP BY fa.identity_id
     )
     UPDATE whatsapp_capture.face_identities fi
        SET face_count = c.cnt, centroid = c.cent, updated_at = now()
       FROM c WHERE fi.id = c.identity_id`
  );
  await pool.query(
    `UPDATE whatsapp_capture.face_identities fi
        SET face_count = 0, centroid = NULL, updated_at = now()
      WHERE NOT EXISTS (SELECT 1 FROM whatsapp_capture.face_assignments fa WHERE fa.identity_id = fi.id)`
  );

  const counts = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM whatsapp_capture.face_identities WHERE centroid IS NOT NULL) AS identities,
       (SELECT count(*)::int FROM whatsapp_capture.faces) AS faces,
       (SELECT count(*)::int FROM whatsapp_capture.face_assignments) AS assignments`
  );

  // 2) Nueva versión del modelo (centroides).
  const versionRes = await pool.query(
    `SELECT COALESCE(max(version), 0) + 1 AS v FROM whatsapp_capture.face_models WHERE kind = 'centroids'`
  );
  const version = versionRes.rows[0].v;
  await pool.query(`UPDATE whatsapp_capture.face_models SET active = false WHERE kind = 'centroids'`);
  await pool.query(
    `INSERT INTO whatsapp_capture.face_models (kind, version, params, metrics, active)
     VALUES ('centroids', $1, $2::jsonb, $3::jsonb, true)`,
    [version, JSON.stringify({ model: MODEL, threshold: scanThreshold }), JSON.stringify(counts.rows[0])]
  );

  // 3) Sugerencias por centroide: cara sin asignar -> identidad más cercana (coseno).
  const ins = await pool.query(
    `INSERT INTO whatsapp_capture.face_assignments (face_id, identity_id, source, confidence)
     SELECT f.id, best.id, 'model', 1 - (f.embedding <=> best.centroid)
       FROM whatsapp_capture.faces f
       JOIN LATERAL (
         SELECT fi.id, fi.centroid
           FROM whatsapp_capture.face_identities fi
          WHERE fi.centroid IS NOT NULL
          ORDER BY f.embedding <=> fi.centroid ASC
          LIMIT 1
       ) best ON true
      WHERE (f.embedding <=> best.centroid) <= $1
        AND NOT EXISTS (SELECT 1 FROM whatsapp_capture.face_assignments fa WHERE fa.face_id = f.id)
     ON CONFLICT (face_id) DO NOTHING`,
    [scanThreshold]
  );

  // 4) Cabeza clasificadora (regresión logística softmax) sobre embeddings etiquetados.
  const classifier = await runClassifierTraining({ pool, log });

  // 5) Sugerencias del clasificador para las caras que siguen sin asignar.
  const classified = await suggestWithClassifier({ pool, log });

  return {
    version,
    ...counts.rows[0],
    suggestions: ins.rowCount,
    classifier,
    classifierSuggestions: classified.suggestions,
  };
}

const CLASSIFIER_LABELS_MIN = 2;
const CLASSIFIER_SAMPLES_MIN = 4;
const CLASSIFIER_MAX_SAMPLES = 2000;

function parseEmbedding(value) {
  if (Array.isArray(value)) return value.map(Number);
  return JSON.parse(String(value)).map(Number);
}

function softmaxProbabilities(weights, biases, x) {
  const classes = biases.length;
  const z = new Array(classes);
  for (let c = 0; c < classes; c++) {
    let s = biases[c];
    const wc = weights[c];
    for (let d = 0; d < x.length; d++) s += wc[d] * x[d];
    z[c] = s;
  }
  let max = -Infinity;
  for (const v of z) if (v > max) max = v;
  let sum = 0;
  const p = z.map((v) => {
    const e = Math.exp(v - max);
    sum += e;
    return e;
  });
  return p.map((e) => e / sum);
}

/** Entrena una regresión logística multinomial (full-batch). Devuelve W (C x D) y b (C). */
function trainSoftmax(X, y, classes, { epochs = 400, lr = 0.5, reg = 1e-4 } = {}) {
  const n = X.length;
  const dim = X[0].length;
  const weights = Array.from({ length: classes }, () => new Float64Array(dim));
  const biases = new Float64Array(classes);

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gW = Array.from({ length: classes }, () => new Float64Array(dim));
    const gB = new Float64Array(classes);

    for (let i = 0; i < n; i++) {
      const x = X[i];
      const p = softmaxProbabilities(weights, biases, x);
      for (let c = 0; c < classes; c++) {
        const g = p[c] - (y[i] === c ? 1 : 0);
        if (g === 0) continue;
        const gw = gW[c];
        for (let d = 0; d < dim; d++) gw[d] += g * x[d];
        gB[c] += g;
      }
    }

    for (let c = 0; c < classes; c++) {
      const wc = weights[c];
      const gw = gW[c];
      for (let d = 0; d < dim; d++) wc[d] -= lr * (gw[d] / n + reg * wc[d]);
      biases[c] -= lr * (gB[c] / n);
    }
  }

  return { weights: weights.map((w) => Array.from(w)), biases: Array.from(biases) };
}

/**
 * Entrena la cabeza clasificadora con las asignaciones **manuales** (etiquetas humanas)
 * y guarda una versión activa en `face_models`. No reentrena el backbone (ArcFace).
 */
export async function runClassifierTraining({ pool, log = console }) {
  const { rows } = await pool.query(
    `SELECT f.embedding::text AS emb, fa.identity_id
       FROM whatsapp_capture.faces f
       JOIN whatsapp_capture.face_assignments fa ON fa.face_id = f.id
      WHERE fa.source = 'manual'`
  );

  const labels = [...new Set(rows.map((r) => r.identity_id))];
  if (rows.length < CLASSIFIER_SAMPLES_MIN || labels.length < CLASSIFIER_LABELS_MIN) {
    return { skipped: true, samples: rows.length, classes: labels.length };
  }

  const sample = rows.length > CLASSIFIER_MAX_SAMPLES ? rows.slice(0, CLASSIFIER_MAX_SAMPLES) : rows;
  const labelIndex = new Map(labels.map((l, i) => [l, i]));
  const X = sample.map((r) => parseEmbedding(r.emb));
  const y = sample.map((r) => labelIndex.get(r.identity_id));

  const { weights, biases } = trainSoftmax(X, y, labels.length);

  let correct = 0;
  for (let i = 0; i < X.length; i++) {
    const p = softmaxProbabilities(weights, biases, X[i]);
    let bi = 0;
    for (let c = 1; c < p.length; c++) if (p[c] > p[bi]) bi = c;
    if (bi === y[i]) correct++;
  }
  const accuracy = correct / X.length;

  const versionRes = await pool.query(
    `SELECT COALESCE(max(version), 0) + 1 AS v FROM whatsapp_capture.face_models WHERE kind = 'classifier'`
  );
  const version = versionRes.rows[0].v;
  await pool.query(`UPDATE whatsapp_capture.face_models SET active = false WHERE kind = 'classifier'`);
  await pool.query(
    `INSERT INTO whatsapp_capture.face_models (kind, version, params, metrics, active)
     VALUES ('classifier', $1, $2::jsonb, $3::jsonb, true)`,
    [
      version,
      JSON.stringify({ labels, weights, biases, dim: X[0].length, model: MODEL }),
      JSON.stringify({ accuracy, samples: X.length, classes: labels.length }),
    ]
  );
  log.log?.(`[faces] clasificador v${version} accuracy=${accuracy.toFixed(3)} clases=${labels.length} muestras=${X.length}`);
  return { version, accuracy, samples: X.length, classes: labels.length };
}

/** Usa el clasificador activo para sugerir asignaciones a caras sin asignar. */
export async function suggestWithClassifier({ pool, threshold = 0.6, margin = 0.1 }) {
  const model = await pool.query(
    `SELECT params FROM whatsapp_capture.face_models WHERE kind = 'classifier' AND active ORDER BY version DESC LIMIT 1`
  );
  if (model.rowCount === 0) return { skipped: true, suggestions: 0 };

  const { labels, weights, biases } = model.rows[0].params;
  const faces = await pool.query(
    `SELECT f.id, f.embedding::text AS emb
       FROM whatsapp_capture.faces f
      WHERE NOT EXISTS (SELECT 1 FROM whatsapp_capture.face_assignments fa WHERE fa.face_id = f.id)`
  );

  let suggestions = 0;
  for (const f of faces.rows) {
    const p = softmaxProbabilities(weights, biases, parseEmbedding(f.emb));
    let bi = 0;
    for (let c = 1; c < p.length; c++) if (p[c] > p[bi]) bi = c;
    const best = p[bi];
    let second = 0;
    for (let c = 0; c < p.length; c++) if (c !== bi && p[c] > second) second = p[c];
    if (best >= threshold && best - second >= margin) {
      await pool.query(
        `INSERT INTO whatsapp_capture.face_assignments (face_id, identity_id, source, confidence)
         VALUES ($1, $2, 'model', $3) ON CONFLICT (face_id) DO NOTHING`,
        [f.id, labels[bi], best]
      );
      suggestions++;
    }
  }
  return { suggestions };
}

