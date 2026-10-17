import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export const runtime = "nodejs";

const SHA_RE = /^[0-9a-f]{64}$/;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");

  try {
    const media = await pool.query(
      `SELECT sha256, bucket, object_key, content_type, size_bytes, state, stored_at,
              note, is_favorite, is_archived, note_updated_at, created_at
         FROM whatsapp_capture.media_objects WHERE sha256 = $1`,
      [sha256]
    );
    if (media.rowCount === 0) return jsonError("Fotografía no encontrada", 404);

    const [tags, appearances, links, analyses] = await Promise.all([
      pool.query(
        `SELECT tag, source, created_at FROM whatsapp_capture.media_tags
          WHERE sha256 = $1 ORDER BY lower(tag)`,
        [sha256]
      ),
      pool.query(
        `SELECT mm.id AS media_id, mm.ordinal, mm.file_name, mm.media_kind, mm.content_type, mm.size_bytes,
                m.id AS message_id, m.sender_id, m.sender_display_name, m.direction, m.body_text AS caption,
                COALESCE(m.sent_at, m.received_at) AS at,
                c.id AS conversation_id, c.display_name AS conversation_name, c.is_group
           FROM whatsapp_capture.message_media mm
           JOIN whatsapp_capture.messages m ON m.id = mm.message_id
           JOIN whatsapp_capture.conversations c ON c.id = m.conversation_id
          WHERE mm.sha256 = $1
          ORDER BY COALESCE(m.sent_at, m.received_at) ASC`,
        [sha256]
      ),
      pool.query(
        `SELECT l.id, l.message_id, l.source, l.status, l.confidence, l.rationale, l.created_at,
                CASE
                  WHEN l.project_id IS NOT NULL THEN 'project'
                  WHEN l.ticket_id IS NOT NULL THEN 'ticket'
                  WHEN l.maintenance_policy_id IS NOT NULL THEN 'maintenance_policy'
                  WHEN l.activity_id IS NOT NULL THEN 'activity'
                  WHEN l.technician_id IS NOT NULL THEN 'technician'
                END AS type,
                COALESCE(l.project_id, l.ticket_id, l.maintenance_policy_id, l.activity_id, l.technician_id) AS target_id,
                COALESCE(pr.code || ' · ' || pr.name, tk.code || ' · ' || tk.title,
                         'Póliza · ' || mp.name, ac.description, te.display_name) AS label
           FROM whatsapp_capture.message_entity_links l
           LEFT JOIN projects pr ON pr.id = l.project_id
           LEFT JOIN tickets tk ON tk.id = l.ticket_id
           LEFT JOIN maintenance_policies mp ON mp.id = l.maintenance_policy_id
           LEFT JOIN activities ac ON ac.id = l.activity_id
           LEFT JOIN technicians te ON te.id = l.technician_id
          WHERE l.message_id IN (SELECT message_id FROM whatsapp_capture.message_media WHERE sha256 = $1)
          ORDER BY l.created_at DESC`,
        [sha256]
      ),
      pool.query(
        `SELECT id, analysis_type, provider, model, model_version, state, result, created_at, completed_at
           FROM whatsapp_capture.media_analyses WHERE sha256 = $1 ORDER BY created_at DESC`,
        [sha256]
      ),
    ]);

    return jsonOk({
      media: media.rows[0],
      tags: tags.rows,
      appearances: appearances.rows,
      links: links.rows,
      analyses: analyses.rows,
    });
  } catch (err) {
    return jsonError("No se pudo leer el detalle de la fotografía", 500, String(err));
  }
}
