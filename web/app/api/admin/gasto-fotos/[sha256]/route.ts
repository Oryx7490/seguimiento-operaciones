import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId } from "@/app/lib/api";
import { EXPENSE_PHOTO_CATEGORIES, requireExpensePhotoAccess, validDate } from "@/app/lib/expense-photo-review";

export const runtime = "nodejs";
const SHA_RE = /^[0-9a-f]{64}$/;
const REVIEW_STATES = new Set(["confirmed", "corrected", "rejected"]);
const ASSOCIATION_COLUMNS: Record<string, string> = {
  project: "project_id",
  ticket: "ticket_id",
  maintenance_policy: "maintenance_policy_id",
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const access = await requireExpensePhotoAccess("view");
  if (access.response) return access.response;
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");
  try {
    const [review, comments] = await Promise.all([
      pool.query(
        `SELECT r.*, u.name AS reviewer_name,
                p.code AS reviewed_project_code, p.name AS reviewed_project_name
           FROM whatsapp_capture.expense_photo_reviews r
           LEFT JOIN users u ON u.id = r.reviewed_by
           LEFT JOIN projects p ON p.id = r.reviewed_project_id
          WHERE r.sha256 = $1`,
        [sha256]
      ),
      pool.query(
        `SELECT c.id, c.body, c.created_at, u.name AS author_name
           FROM whatsapp_capture.expense_photo_review_comments c
           LEFT JOIN users u ON u.id = c.author_id
          WHERE c.sha256 = $1
          ORDER BY c.created_at`,
        [sha256]
      ),
    ]);
    return jsonOk({ review: review.rows[0] ?? null, comments: comments.rows });
  } catch (err) {
    return jsonError("No se pudo leer el historial de revisión", 500, String(err));
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const access = await requireExpensePhotoAccess("update");
  if (access.response) return access.response;
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const reviewStatus = typeof body.review_status === "string" ? body.review_status : "";
  if (!REVIEW_STATES.has(reviewStatus)) return jsonError("review_status inválido");
  if (typeof body.is_expense !== "boolean") return jsonError("is_expense debe ser boolean");

  const category = typeof body.category === "string" ? body.category : null;
  if (category && !(EXPENSE_PHOTO_CATEGORIES as readonly string[]).includes(category)) return jsonError("Categoría inválida");
  let associationType = typeof body.association_type === "string" ? body.association_type : "";
  let associationId = body.association_id === null || body.association_id === "" || body.association_id === undefined
    ? null
    : typeof body.association_id === "string" ? parseId(body.association_id) : null;
  if (associationType) {
    if (!ASSOCIATION_COLUMNS[associationType]) return jsonError("association_type inválido");
    if (body.association_id && !associationId) return jsonError("association_id inválido");
  } else {
    const legacyProjectId = body.project_id === null || body.project_id === "" || body.project_id === undefined
      ? null
      : typeof body.project_id === "string" ? parseId(body.project_id) : null;
    if (body.project_id && !legacyProjectId) return jsonError("project_id inválido");
    associationType = "project";
    associationId = legacyProjectId;
  }
  if (body.is_expense && reviewStatus !== "rejected" && !associationId) {
    return jsonError("Selecciona el proyecto, ticket o póliza al que corresponde este gasto");
  }
  const projectId = associationType === "project" ? associationId : null;
  const ticketId = associationType === "ticket" ? associationId : null;
  const policyId = associationType === "maintenance_policy" ? associationId : null;

  const expenseDate = body.expense_date === "" ? null : body.expense_date;
  if (!validDate(expenseDate)) return jsonError("expense_date debe tener formato YYYY-MM-DD");
  const amount = (key: string) => {
    const value = body[key];
    if (value === null || value === undefined || value === "") return null;
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) && number >= 0 ? number : NaN;
  };
  const total = amount("total");
  const tax = amount("tax");
  if (Number.isNaN(total) || Number.isNaN(tax)) return jsonError("Importe e impuestos deben ser números positivos");
  const currency = typeof body.currency === "string" ? body.currency.toUpperCase() : "MXN";
  if (!/^[A-Z]{3}$/.test(currency)) return jsonError("Moneda inválida; usa un código de tres letras");
  const bounded = (key: string, max: number) => {
    const value = body[key];
    if (value !== null && value !== undefined && typeof value !== "string") return null;
    const text = typeof value === "string" ? value.trim() : "";
    return text ? text.slice(0, max) : null;
  };
  const vendor = bounded("vendor", 300);
  const description = bounded("description", 2000);
  const extractedText = bounded("extracted_text", 30000);
  const note = bounded("note", 4000);
  if (reviewStatus === "corrected" && !note) return jsonError("Explica qué estaba mal para guardar la corrección");
  const uid = access.userId;
  if (!uid) return jsonError("Se requiere una sesión", 401);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const exists = await client.query(
      `SELECT 1 FROM whatsapp_capture.media_objects WHERE sha256 = $1 AND state = 'stored' FOR UPDATE`,
      [sha256]
    );
    if (!exists.rows.length) {
      await client.query("ROLLBACK");
      return jsonError("La foto no existe o no está disponible", 404);
    }

    const reviewData = {
      is_expense: body.is_expense,
      category,
      association_type: associationId ? associationType : null,
      association_id: associationId,
      project_id: projectId,
      ticket_id: ticketId,
      maintenance_policy_id: policyId,
      vendor,
      expense_date: expenseDate,
      total,
      tax,
      currency,
      description,
      extracted_text: extractedText,
    };
    await client.query(
      `INSERT INTO whatsapp_capture.expense_photo_reviews
         (sha256, review_status, reviewed_is_expense, reviewed_category, reviewed_project_id,
          reviewed_ticket_id, reviewed_maintenance_policy_id,
          reviewed_vendor, reviewed_expense_date, reviewed_total, reviewed_tax, reviewed_currency,
          reviewed_description, reviewed_text, review_note, reviewed_by, reviewed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now())
       ON CONFLICT (sha256) DO UPDATE SET
         review_status = EXCLUDED.review_status,
         reviewed_is_expense = EXCLUDED.reviewed_is_expense,
         reviewed_category = EXCLUDED.reviewed_category,
         reviewed_project_id = EXCLUDED.reviewed_project_id,
         reviewed_ticket_id = EXCLUDED.reviewed_ticket_id,
         reviewed_maintenance_policy_id = EXCLUDED.reviewed_maintenance_policy_id,
         reviewed_vendor = EXCLUDED.reviewed_vendor,
         reviewed_expense_date = EXCLUDED.reviewed_expense_date,
         reviewed_total = EXCLUDED.reviewed_total,
         reviewed_tax = EXCLUDED.reviewed_tax,
         reviewed_currency = EXCLUDED.reviewed_currency,
         reviewed_description = EXCLUDED.reviewed_description,
         reviewed_text = EXCLUDED.reviewed_text,
         review_note = EXCLUDED.review_note,
         reviewed_by = EXCLUDED.reviewed_by,
         reviewed_at = now(),
         updated_at = now()`,
      [sha256, reviewStatus, body.is_expense, category, projectId, ticketId, policyId, vendor, expenseDate, total, tax, currency, description, extractedText, note, uid]
    );

    if (reviewStatus !== "rejected") {
      const appearances = await client.query(
        `SELECT id, message_id FROM whatsapp_capture.message_media WHERE sha256 = $1 AND state = 'stored'`,
        [sha256]
      );
      for (const appearance of appearances.rows) {
        if (!associationId) {
          await client.query(
            `UPDATE whatsapp_capture.message_entity_links
                SET status = 'rejected', reviewed_by = $2, reviewed_at = now()
              WHERE message_media_id = $1 AND source = 'human' AND status = 'confirmed'
                AND (project_id IS NOT NULL OR ticket_id IS NOT NULL OR maintenance_policy_id IS NOT NULL)`,
            [appearance.id, uid]
          );
        } else {
          const targetColumn = ASSOCIATION_COLUMNS[associationType];
          await client.query(
            `UPDATE whatsapp_capture.message_entity_links
                SET status = 'rejected', reviewed_by = $2, reviewed_at = now()
              WHERE message_media_id = $1 AND source = 'human'
                AND ${targetColumn} IS DISTINCT FROM $3::uuid AND status = 'confirmed'`,
            [appearance.id, uid, associationId]
          );
          const same = await client.query(
            `SELECT id FROM whatsapp_capture.message_entity_links
              WHERE message_media_id = $1 AND ${targetColumn} = $2 AND source = 'human' AND status = 'confirmed'
              LIMIT 1`,
            [appearance.id, associationId]
          );
          if (same.rows.length) {
            await client.query(
              `UPDATE whatsapp_capture.message_entity_links SET reviewed_by = $2, reviewed_at = now() WHERE id = $1`,
              [same.rows[0].id, uid]
            );
          } else {
            await client.query(
              `INSERT INTO whatsapp_capture.message_entity_links
                 (message_id, message_media_id, ${targetColumn}, source, status, confidence, rationale, reviewed_by, reviewed_at)
               VALUES ($1, $2, $3, 'human', 'confirmed', 1, $4, $5, now())`,
              [appearance.message_id, appearance.id, associationId, note || "Documento asociado desde la bandeja de documentos desde fotos", uid]
            );
          }
        }
      }
    }

    if (category) {
      await client.query(`DELETE FROM whatsapp_capture.media_tags WHERE sha256 = $1 AND lower(tag) LIKE 'tipo_documento:%'`, [sha256]);
      await client.query(
        `INSERT INTO whatsapp_capture.media_tags (sha256, tag, source, created_by)
         VALUES ($1, $2, 'manual', $3)`,
        [sha256, `tipo_documento:${category}`, uid]
      );
    }

    await client.query(
      `INSERT INTO whatsapp_capture.expense_photo_review_comments (sha256, author_id, body)
       VALUES ($1, $2, $3)`,
      [sha256, uid, note || `Revisión guardada: ${reviewStatus}.`]
    );
    await client.query("COMMIT");
    return jsonOk({ saved: true, review_status: reviewStatus, reviewed_data: reviewData });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo guardar la revisión", 500, String(err));
  } finally {
    client.release();
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const access = await requireExpensePhotoAccess("update");
  if (access.response) return access.response;
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");
  let body: { body?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const comment = typeof body.body === "string" ? body.body.trim() : "";
  if (!comment || comment.length > 4000) return jsonError("La nota debe contener entre 1 y 4000 caracteres");
  const uid = access.userId;
  try {
    await pool.query(
      `INSERT INTO whatsapp_capture.expense_photo_reviews (sha256)
       SELECT sha256 FROM whatsapp_capture.media_objects WHERE sha256 = $1 AND state = 'stored'
       ON CONFLICT (sha256) DO NOTHING`,
      [sha256]
    );
    const inserted = await pool.query(
      `INSERT INTO whatsapp_capture.expense_photo_review_comments (sha256, author_id, body)
       SELECT r.sha256, $2, $3 FROM whatsapp_capture.expense_photo_reviews r WHERE r.sha256 = $1
       RETURNING id, body, created_at`,
      [sha256, uid, comment]
    );
    if (!inserted.rows.length) return jsonError("La foto no existe", 404);
    return jsonOk({ comment: { ...inserted.rows[0], author_name: "Tú" } }, 201);
  } catch (err) {
    return jsonError("No se pudo guardar la nota", 500, String(err));
  }
}
