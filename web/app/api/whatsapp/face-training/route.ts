import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export const runtime = "nodejs";

const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL || "http://face-service:8000";
const SFACE_THRESHOLD = Number(process.env.FACE_SFACE_THRESHOLD || 0.363);
const SFACE_MARGIN = Number(process.env.FACE_SFACE_MARGIN || 0.05);

type ValidationResult = {
  status: "correct" | "incorrect" | "abstained" | "unavailable";
  predicted_name: string | null;
  similarity: number | null;
  margin: number | null;
  reason: string | null;
};

function parseVector(value: unknown): number[] | null {
  try {
    const parsed = Array.isArray(value) ? value : JSON.parse(String(value));
    if (!Array.isArray(parsed) || parsed.some((n) => !Number.isFinite(Number(n)))) return null;
    return parsed.map(Number);
  } catch {
    return null;
  }
}

/** Evaluación cruzada leave-one-out para no validar cada foto contra sí misma. */
function evaluateLeaveOneOut(
  rows: Array<{ identity_id: string; display_name: string; vector: unknown }>,
  threshold: number,
  marginThreshold: number
) {
  const vectors = rows.map((row) => parseVector(row.vector));
  const groups = new Map<string, { name: string; count: number; sum: number[] }>();
  rows.forEach((row, index) => {
    const vector = vectors[index];
    if (!vector) return;
    const group = groups.get(row.identity_id) ?? { name: row.display_name, count: 0, sum: new Array(vector.length).fill(0) };
    if (group.sum.length !== vector.length) return;
    group.count++;
    vector.forEach((value, dim) => { group.sum[dim] += value; });
    groups.set(row.identity_id, group);
  });

  const results: ValidationResult[] = rows.map((row, index) => {
    const vector = vectors[index];
    const own = groups.get(row.identity_id);
    if (!vector || !own || own.count < 2) {
      return { status: "unavailable", predicted_name: null, similarity: null, margin: null, reason: "Se necesita otra foto confirmada de esta identidad." };
    }

    const candidates: Array<{ identity_id: string; name: string; similarity: number }> = [];
    for (const [identityId, group] of groups) {
      const count = group.count - (identityId === row.identity_id ? 1 : 0);
      if (count < 1 || group.sum.length !== vector.length) continue;
      let dot = 0;
      let a2 = 0;
      let b2 = 0;
      for (let dim = 0; dim < vector.length; dim++) {
        const centroid = (group.sum[dim] - (identityId === row.identity_id ? vector[dim] : 0)) / count;
        dot += vector[dim] * centroid;
        a2 += vector[dim] * vector[dim];
        b2 += centroid * centroid;
      }
      const denom = Math.sqrt(a2 * b2);
      if (denom > 0) candidates.push({ identity_id: identityId, name: group.name, similarity: dot / denom });
    }
    candidates.sort((a, b) => b.similarity - a.similarity);
    if (candidates.length < 2) {
      return { status: "unavailable", predicted_name: null, similarity: null, margin: null, reason: "Se necesitan al menos dos identidades con fotos comparables." };
    }

    const best = candidates[0];
    const gap = best.similarity - candidates[1].similarity;
    const accepted = best.similarity >= 1 - threshold && gap >= marginThreshold;
    const correct = best.identity_id === row.identity_id;
    return {
      status: accepted ? (correct ? "correct" : "incorrect") : "abstained",
      predicted_name: best.name,
      similarity: Number(best.similarity.toFixed(4)),
      margin: Number(gap.toFixed(4)),
      reason: accepted ? null : best.similarity < 1 - threshold ? "Confianza debajo del umbral." : "Separación insuficiente entre las dos identidades más cercanas.",
    } as ValidationResult;
  });

  const tested = results.filter((result) => result.status !== "unavailable");
  const accepted = results.filter((result) => result.status === "correct" || result.status === "incorrect");
  return {
    threshold,
    margin_threshold: marginThreshold,
    tested: tested.length,
    accepted: accepted.length,
    correct: results.filter((result) => result.status === "correct").length,
    incorrect: results.filter((result) => result.status === "incorrect").length,
    abstained: results.filter((result) => result.status === "abstained").length,
    unavailable: results.filter((result) => result.status === "unavailable").length,
    results,
  };
}

type EvaluationSummary = Omit<ReturnType<typeof evaluateLeaveOneOut>, "results">;

async function readToolHealth() {
  try {
    const response = await fetch(`${FACE_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return { service_error: `face-service HTTP ${response.status}`, health: null };
    return { service_error: null, health: await response.json() };
  } catch (err) {
    return { service_error: err instanceof Error ? err.message : String(err), health: null };
  }
}

export async function GET() {
  try {
    const [centroid, classifier, tool, failures, totals] = await Promise.all([
      pool.query(
        `SELECT id, version, params, metrics, created_at, active
           FROM whatsapp_capture.face_models
          WHERE kind = 'centroids'
          ORDER BY active DESC, version DESC
          LIMIT 1`
      ),
      pool.query(
        `SELECT id, version, metrics, created_at, active
           FROM whatsapp_capture.face_models
          WHERE kind = 'classifier' AND active
          ORDER BY version DESC
          LIMIT 1`
      ),
      readToolHealth(),
      pool.query(
        `SELECT analysis_type, model, sha256, error_message, created_at
           FROM whatsapp_capture.media_analyses
          WHERE analysis_type IN ('face_detect', 'face_embedding') AND state = 'failed'
          ORDER BY created_at DESC
          LIMIT 10`
      ),
      pool.query(
        `SELECT
           (SELECT count(*)::int FROM whatsapp_capture.faces) AS faces,
           (SELECT count(*)::int FROM whatsapp_capture.face_assignments WHERE source = 'manual') AS confirmed_examples,
           (SELECT count(DISTINCT identity_id)::int FROM whatsapp_capture.face_assignments WHERE source = 'manual') AS confirmed_identities,
           (SELECT count(*)::int FROM whatsapp_capture.face_sface_embeddings) AS sface_embeddings`
      ),
    ]);

    const model = centroid.rows[0] ?? null;
    const classifierModel = classifier.rows[0] ?? null;
    let examples: Record<string, unknown>[] = [];
    let examplesTruncated = false;
    let exampleCount = 0;
    let classifierExampleCount = 0;
    let recognitionQuality: { buffalo: EvaluationSummary; sface: EvaluationSummary } | null = null;
    if (model || classifierModel) {
      const sampleRows = await pool.query(
        `WITH photo_ids AS (
           SELECT DISTINCT face_id
             FROM whatsapp_capture.face_model_examples
            WHERE model_id = ANY($1::uuid[])
         )
         SELECT ids.face_id,
                COALESCE(ce.identity_id, cl.identity_id) AS identity_id,
                fi.display_name, f.sha256, f.bbox, f.det_score,
                f.created_at AS face_created_at, mo.state AS media_state,
                COALESCE(a.result->>'width', '0')::int AS image_width,
                COALESCE(a.result->>'height', '0')::int AS image_height,
                (se.face_id IS NOT NULL) AS sface_included,
                (ce.face_id IS NOT NULL) AS used_by_centroids,
                (cl.face_id IS NOT NULL) AS used_by_classifier,
                f.embedding::text AS buffalo_embedding, se.embedding::text AS sface_embedding
           FROM photo_ids ids
           LEFT JOIN whatsapp_capture.face_model_examples ce ON ce.face_id = ids.face_id AND ce.model_id = $2::uuid
           LEFT JOIN whatsapp_capture.face_model_examples cl ON cl.face_id = ids.face_id AND cl.model_id = $3::uuid
           JOIN whatsapp_capture.faces f ON f.id = ids.face_id
           JOIN whatsapp_capture.face_identities fi ON fi.id = COALESCE(ce.identity_id, cl.identity_id)
           JOIN whatsapp_capture.media_objects mo ON mo.sha256 = f.sha256
           LEFT JOIN whatsapp_capture.face_sface_embeddings se
             ON se.face_id = f.id AND se.model_name = 'opencv_sface' AND se.model_version = '2021dec'
           LEFT JOIN LATERAL (
             SELECT result FROM whatsapp_capture.media_analyses
              WHERE sha256 = f.sha256 AND analysis_type = 'face_detect'
                AND model = 'buffalo_l' AND state = 'completed'
              ORDER BY completed_at DESC NULLS LAST LIMIT 1
           ) a ON true
          ORDER BY fi.display_name, f.created_at DESC, ids.face_id`,
        [[model?.id, classifierModel?.id].filter(Boolean), model?.id ?? null, classifierModel?.id ?? null]
      );
      const centroidRows = sampleRows.rows.filter((row) => row.used_by_centroids);
      exampleCount = centroidRows.length;
      classifierExampleCount = sampleRows.rows.filter((row) => row.used_by_classifier).length;
      const centroidThreshold = Number(model?.params?.threshold ?? 0.35);
      const buffaloEvaluation = evaluateLeaveOneOut(
        centroidRows.map((row) => ({ ...row, vector: row.buffalo_embedding })),
        centroidThreshold,
        0.08
      );
      const sfaceEvaluation = evaluateLeaveOneOut(
        centroidRows.map((row) => ({ ...row, vector: row.sface_embedding })),
        SFACE_THRESHOLD,
        SFACE_MARGIN
      );
      const { results: buffaloResults, ...buffaloSummary } = buffaloEvaluation;
      const { results: sfaceResults, ...sfaceSummary } = sfaceEvaluation;
      const recognitionByFace = new Map(centroidRows.map((row, index) => [row.face_id, { buffalo: buffaloResults[index], sface: sfaceResults[index] }]));
      const exampleCards = sampleRows.rows.map((row) => {
        const { buffalo_embedding: _buffalo, sface_embedding: _sface, ...example } = row;
        const recognition = recognitionByFace.get(row.face_id) ?? {
          buffalo: { status: "unavailable", predicted_name: null, similarity: null, margin: null, reason: "Esta foto no formó parte del entrenamiento de centroides." },
          sface: { status: "unavailable", predicted_name: null, similarity: null, margin: null, reason: "Esta foto no formó parte del entrenamiento de centroides." },
        };
        return { ...example, recognition };
      });
      examplesTruncated = exampleCards.length > 160;
      examples = exampleCards.slice(0, 160);
      recognitionQuality = { buffalo: buffaloSummary, sface: sfaceSummary };
    }

    return jsonOk({
      model: model && {
        id: model.id,
        version: model.version,
        metrics: model.metrics,
        created_at: model.created_at,
        active: model.active,
        example_count: exampleCount,
      },
      classifier: classifierModel && {
        id: classifierModel.id,
        version: classifierModel.version,
        metrics: classifierModel.metrics,
        created_at: classifierModel.created_at,
        active: classifierModel.active,
        example_count: classifierExampleCount,
      },
      examples,
      examples_truncated: examplesTruncated,
      recognition_quality: recognitionQuality ?? null,
      tool_health: tool.health,
      tool_error: tool.service_error,
      photo_errors: failures.rows,
      totals: totals.rows[0],
    });
  } catch (err) {
    return jsonError("No se pudo leer la auditoría de entrenamiento facial", 500, String(err));
  }
}
