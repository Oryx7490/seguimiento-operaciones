import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk } from "@/app/lib/api";
import { getStorageObjectBuffer } from "@/app/lib/storage";
import { EXPENSE_PHOTO_CATEGORIES, requireExpensePhotoAccess } from "@/app/lib/expense-photo-review";

export const runtime = "nodejs";
export const maxDuration = 900;

const SHA_RE = /^[0-9a-f]{64}$/;

function parseModelJson(raw: string): Record<string, unknown> {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const value: unknown = JSON.parse(clean);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("La respuesta de Qwen no fue un objeto JSON");
  return value as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const access = await requireExpensePhotoAccess("update", request);
  if (access.response) return access.response;

  let body: { sha256?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const sha256 = typeof body.sha256 === "string" ? body.sha256 : "";
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");

  const eligibility = await pool.query(
    `SELECT mo.bucket, mo.object_key, mo.content_type,
            EXISTS (
              SELECT 1 FROM whatsapp_capture.message_media mm
               WHERE mm.sha256 = mo.sha256 AND mm.state = 'stored' AND mm.media_kind = 'image'
            ) AS has_image_appearance,
            EXISTS (
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
            ) AS face_scan_clear,
            (EXISTS (
              SELECT 1 FROM whatsapp_capture.faces face WHERE face.sha256 = mo.sha256
            ) OR EXISTS (
              SELECT 1 FROM whatsapp_capture.media_analyses face_analysis
               WHERE face_analysis.sha256 = mo.sha256
                 AND face_analysis.analysis_type = 'face_detect'
                 AND face_analysis.model = 'buffalo_l'
                 AND face_analysis.state = 'completed'
                 AND CASE
                       WHEN jsonb_typeof(face_analysis.result->'count') = 'number'
                       THEN (face_analysis.result->>'count')::numeric > 0
                       ELSE false
                     END
            )) AS has_detected_face
       FROM whatsapp_capture.media_objects mo
      WHERE mo.sha256 = $1 AND mo.state = 'stored'`,
    [sha256]
  );
  const eligibleMedia = eligibility.rows[0];
  if (!eligibleMedia) return jsonError("La foto no existe o no está disponible", 404);
  if (!eligibleMedia.has_image_appearance) return jsonError("El archivo no es una imagen de WhatsApp disponible", 409);
  if (eligibleMedia.has_detected_face) return jsonError("La imagen contiene rostros detectados y se omite de esta sección", 409);
  if (!eligibleMedia.face_scan_clear) return jsonError("El análisis facial aún no confirma que la imagen esté libre de rostros", 409);

  const baseUrl = process.env.OLLAMA_BASE_URL?.trim().replace(/\/$/, "");
  if (!baseUrl) return jsonError("Configura OLLAMA_BASE_URL para habilitar el análisis con Qwen", 503);
  const model = process.env.OLLAMA_MODEL?.trim() || "frob/qwen3.5-instruct:9b";

  const analysis = await pool.query(
    `INSERT INTO whatsapp_capture.media_analyses
       (sha256, analysis_type, provider, model, model_version, state, started_at)
     SELECT sha256, 'expense_document', 'ollama', $2, $2, 'running', now()
       FROM whatsapp_capture.media_objects
      WHERE sha256 = $1 AND state = 'stored'
     RETURNING id`,
    [sha256, model]
  );
  if (!analysis.rows.length) return jsonError("La foto no existe o no está disponible", 404);
  const analysisId = analysis.rows[0].id as string;

  try {
    const projectsResult = await pool.query(
      `SELECT p.id, p.code, p.name, p.status, c.name AS client, l.name AS location
         FROM projects p
         LEFT JOIN clients c ON c.id = p.client_id
         LEFT JOIN locations l ON l.id = p.location_id
        WHERE p.status NOT IN ('closed', 'cancelled')
        ORDER BY p.planned_start_date NULLS LAST, p.code
        LIMIT 300`
    );
    const bytes = await getStorageObjectBuffer(eligibleMedia.bucket, eligibleMedia.object_key);
    const projects = projectsResult.rows;
    const prompt = `Eres un asistente que clasifica documentos fotografiados y los asocia con proyectos. Examina la imagen y responde únicamente JSON válido.

Tareas: identifica el tipo de documento, incluyendo hojas de servicio y hojas de entrega; determina si prueba un gasto; extrae el texto y los datos visibles sin inventar; y sugiere un proyecto solo cuando el texto, cliente, ubicación o folio den evidencia suficiente. Si no hay evidencia, usa null para project_id. Usa únicamente un id exacto de la lista. Una hoja de servicio puede asociarse posteriormente a un proyecto, ticket o póliza de mantenimiento; no inventes una asociación.

Categorías permitidas: factura, ticket, recibo, hoja_servicio, hoja_entrega, orden_compra, nota_gasto, documento_general, sin_documento, otro.
Devuelve este formato: {"is_document":boolean,"is_expense":boolean,"document_type":"...","vendor":string|null,"expense_date":"YYYY-MM-DD"|null,"amount_total":number|null,"tax_amount":number|null,"currency":"MXN","folio":string|null,"description":string|null,"line_items":[{"description":string,"quantity":number|null,"amount":number|null}],"project_id":string|null,"project_match_reason":string|null,"project_clues":[string],"extracted_text":string,"confidence":number,"rationale":string}.

En rationale explica qué señales observables usaste y qué falta para estar seguro. Distingue comprobantes de gasto de hojas de asistencia, servicio o entrega sin importe. Una hoja de entrega no es un gasto salvo que muestre evidencia clara de un importe pagado. La confianza debe estar entre 0 y 1.

Proyectos activos disponibles:\n${JSON.stringify(projects)}`;

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        images: [bytes.toString("base64")],
        format: "json",
        stream: false,
        keep_alive: "10m",
        options: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(870_000),
    });
    if (!response.ok) throw new Error(`Ollama respondió HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`);
    const output = (await response.json()) as { response?: unknown; model?: string };
    if (typeof output.response !== "string") throw new Error("Ollama no devolvió contenido");
    const result = parseModelJson(output.response);
    const activeProjectIds = new Set(projects.map((p) => String(p.id)));
    const proposedProjectId = typeof result.project_id === "string" && activeProjectIds.has(result.project_id)
      ? result.project_id
      : null;
    const category = typeof result.document_type === "string" && (EXPENSE_PHOTO_CATEGORIES as readonly string[]).includes(result.document_type)
      ? result.document_type
      : "otro";
    const project = projects.find((candidate) => String(candidate.id) === proposedProjectId);
    const normalized = {
      ...result,
      document_type: category,
      project_id: proposedProjectId,
      project_code: project?.code ?? null,
      project_name: project?.name ?? null,
    };

    await pool.query(
      `UPDATE whatsapp_capture.media_analyses
          SET state = 'completed', result = $2::jsonb, completed_at = now()
        WHERE id = $1`,
      [analysisId, JSON.stringify(normalized)]
    );
    await pool.query(
      `INSERT INTO whatsapp_capture.expense_photo_reviews (sha256, latest_analysis_id, suggested_project_id, model_suggestion)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (sha256) DO UPDATE
         SET latest_analysis_id = EXCLUDED.latest_analysis_id,
             suggested_project_id = EXCLUDED.suggested_project_id,
             model_suggestion = EXCLUDED.model_suggestion,
             updated_at = now()`,
      [sha256, analysisId, proposedProjectId, JSON.stringify(normalized)]
    );
    await pool.query(
      `DELETE FROM whatsapp_capture.media_tags
        WHERE sha256 = $1 AND source = 'ai' AND lower(tag) LIKE 'tipo_documento:%'`,
      [sha256]
    );
    await pool.query(
      `INSERT INTO whatsapp_capture.media_tags (sha256, tag, source)
       SELECT $1, $2, 'ai'
        WHERE NOT EXISTS (
          SELECT 1 FROM whatsapp_capture.media_tags
           WHERE sha256 = $1 AND source = 'manual' AND lower(tag) LIKE 'tipo_documento:%'
        )`,
      [sha256, `tipo_documento:${category}`]
    );
    return jsonOk({ analysis_id: analysisId, model, suggestion: normalized });
  } catch (err) {
    const message = String(err);
    await pool.query(
      `UPDATE whatsapp_capture.media_analyses SET state = 'failed', error_message = $2, completed_at = now() WHERE id = $1`,
      [analysisId, message.slice(0, 4000)]
    ).catch(() => undefined);
    return jsonError("No se pudo procesar la foto con Ollama", 502, message);
  }
}
