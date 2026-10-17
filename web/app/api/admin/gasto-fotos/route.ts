import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk } from "@/app/lib/api";
import { requireExpensePhotoAccess } from "@/app/lib/expense-photo-review";

export async function GET(request: NextRequest) {
  const access = await requireExpensePhotoAccess("view");
  if (access.response) return access.response;

  const sp = request.nextUrl.searchParams;
  const status = sp.get("status") ?? "pending";
  const q = sp.get("q")?.trim() ?? "";
  const limitValue = Number(sp.get("limit"));
  const limit = Number.isFinite(limitValue) ? Math.min(Math.max(Math.trunc(limitValue), 1), 200) : 100;
  if (!new Set(["pending", "reviewed", "all"]).has(status)) return jsonError("status inválido");

  const eligiblePhotoConditions = [
    `EXISTS (
       SELECT 1 FROM whatsapp_capture.message_media image_copy
        WHERE image_copy.sha256 = mo.sha256
          AND image_copy.state = 'stored'
          AND image_copy.media_kind = 'image'
     )`,
    `EXISTS (
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
     )`,
    `NOT EXISTS (
       SELECT 1 FROM whatsapp_capture.faces face
        WHERE face.sha256 = mo.sha256
     )`,
  ];
  const values: unknown[] = [];
  const where = ["mo.state = 'stored'", "appearance.media_kind = 'image'", ...eligiblePhotoConditions];
  if (status === "pending") where.push("COALESCE(r.review_status, 'pending') = 'pending'");
  if (status === "reviewed") where.push("r.review_status IN ('confirmed', 'corrected', 'rejected')");
  if (q) {
    values.push(`%${q}%`);
    const p = `$${values.length}`;
    where.push(`(appearance.file_name ILIKE ${p}
      OR appearance.caption ILIKE ${p}
      OR appearance.sender_display_name ILIKE ${p}
      OR COALESCE(ocr.result->>'text', '') ILIKE ${p}
      OR COALESCE(r.reviewed_vendor, r.model_suggestion->>'vendor', '') ILIKE ${p}
      OR COALESCE(reviewed_project.code, suggested_project.code, '') ILIKE ${p}
      OR COALESCE(reviewed_project.name, suggested_project.name, '') ILIKE ${p}
      OR COALESCE(reviewed_ticket.code, '') ILIKE ${p}
      OR COALESCE(reviewed_ticket.title, reviewed_policy.name, '') ILIKE ${p})`);
  }
  values.push(limit);

  try {
    const [photosResult, totalsResult] = await Promise.all([
      pool.query(
      `SELECT mo.sha256, mo.content_type, mo.size_bytes,
              appearance.file_name, appearance.caption, appearance.sender_display_name,
              appearance.conversation_name, appearance.at,
              COALESCE(r.review_status, 'pending') AS review_status,
              r.model_suggestion,
              r.suggested_project_id,
              suggested_project.code AS suggested_project_code,
              suggested_project.name AS suggested_project_name,
              r.reviewed_is_expense, r.reviewed_category, r.reviewed_project_id,
              reviewed_project.code AS reviewed_project_code,
              reviewed_project.name AS reviewed_project_name,
              r.reviewed_ticket_id, reviewed_ticket.code AS reviewed_ticket_code,
              reviewed_ticket.title AS reviewed_ticket_title,
              r.reviewed_maintenance_policy_id,
              reviewed_policy.name AS reviewed_maintenance_policy_name,
              reviewed_policy_client.name AS reviewed_maintenance_policy_client,
              r.reviewed_vendor, r.reviewed_expense_date, r.reviewed_total, r.reviewed_tax,
              r.reviewed_currency, r.reviewed_description, r.reviewed_text, r.review_note,
              ocr.result->>'text' AS ocr_text,
              count(*) OVER()::int AS total
         FROM whatsapp_capture.media_objects mo
         JOIN LATERAL (
           SELECT mm.media_kind, mm.file_name, m.body_text AS caption, m.sender_display_name,
                  c.display_name AS conversation_name, COALESCE(m.sent_at, m.received_at) AS at
             FROM whatsapp_capture.message_media mm
             JOIN whatsapp_capture.messages m ON m.id = mm.message_id
             JOIN whatsapp_capture.conversations c ON c.id = m.conversation_id
            WHERE mm.sha256 = mo.sha256 AND mm.state = 'stored'
            ORDER BY COALESCE(m.sent_at, m.received_at) DESC, mm.ordinal DESC
            LIMIT 1
         ) appearance ON true
         LEFT JOIN whatsapp_capture.expense_photo_reviews r ON r.sha256 = mo.sha256
         LEFT JOIN projects suggested_project ON suggested_project.id = r.suggested_project_id
         LEFT JOIN projects reviewed_project ON reviewed_project.id = r.reviewed_project_id
         LEFT JOIN tickets reviewed_ticket ON reviewed_ticket.id = r.reviewed_ticket_id
         LEFT JOIN maintenance_policies reviewed_policy ON reviewed_policy.id = r.reviewed_maintenance_policy_id
         LEFT JOIN clients reviewed_policy_client ON reviewed_policy_client.id = reviewed_policy.client_id
         LEFT JOIN LATERAL (
           SELECT a.result
             FROM whatsapp_capture.media_analyses a
            WHERE a.sha256 = mo.sha256 AND a.analysis_type = 'ocr' AND a.state = 'completed'
            ORDER BY a.created_at DESC
            LIMIT 1
         ) ocr ON true
        WHERE ${where.join(" AND ")}
        ORDER BY appearance.at DESC NULLS LAST
        LIMIT $${values.length}`,
      values
      ),
      pool.query(
        `SELECT p.id AS project_id, p.code, p.name, r.reviewed_currency AS currency,
                count(*)::int AS evidence_count, sum(r.reviewed_total)::numeric(14,2) AS total
           FROM whatsapp_capture.expense_photo_reviews r
           JOIN whatsapp_capture.media_objects mo ON mo.sha256 = r.sha256
           JOIN projects p ON p.id = r.reviewed_project_id
          WHERE r.review_status IN ('confirmed', 'corrected')
            AND r.reviewed_is_expense = true AND r.reviewed_total IS NOT NULL
            AND p.status NOT IN ('closed', 'cancelled')
            AND ${eligiblePhotoConditions.join(" AND ")}
          GROUP BY p.id, p.code, p.name, r.reviewed_currency
          ORDER BY sum(r.reviewed_total) DESC, p.code`
      ),
    ]);
    const rows = photosResult.rows;
    const total = rows.length ? rows[0].total : 0;
    return jsonOk({ items: rows.map(({ total: _total, ...row }) => row), total, project_totals: totalsResult.rows, limit });
  } catch (err) {
    return jsonError("No se pudo cargar la bandeja de gastos", 500, String(err));
  }
}
