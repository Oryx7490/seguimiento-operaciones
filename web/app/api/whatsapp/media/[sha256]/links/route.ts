import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export const runtime = "nodejs";

const SHA_RE = /^[0-9a-f]{64}$/;
const TARGET_COLUMNS: Record<string, string> = {
  project: "project_id",
  ticket: "ticket_id",
  activity: "activity_id",
  technician: "technician_id",
};

async function listLinks(sha256: string) {
  const { rows } = await pool.query(
    `SELECT l.id, l.message_id, l.source, l.status, l.confidence, l.rationale, l.created_at,
            CASE
              WHEN l.project_id IS NOT NULL THEN 'project'
              WHEN l.ticket_id IS NOT NULL THEN 'ticket'
              WHEN l.activity_id IS NOT NULL THEN 'activity'
              WHEN l.technician_id IS NOT NULL THEN 'technician'
            END AS type,
            COALESCE(l.project_id, l.ticket_id, l.activity_id, l.technician_id) AS target_id,
            COALESCE(pr.code || ' · ' || pr.name, tk.code || ' · ' || tk.title, ac.description, te.display_name) AS label
       FROM whatsapp_capture.message_entity_links l
       LEFT JOIN projects pr ON pr.id = l.project_id
       LEFT JOIN tickets tk ON tk.id = l.ticket_id
       LEFT JOIN activities ac ON ac.id = l.activity_id
       LEFT JOIN technicians te ON te.id = l.technician_id
      WHERE l.message_id IN (SELECT message_id FROM whatsapp_capture.message_media WHERE sha256 = $1)
      ORDER BY l.created_at DESC`,
    [sha256]
  );
  return rows;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");
  try {
    return jsonOk({ links: await listLinks(sha256) });
  } catch (err) {
    return jsonError("No se pudieron leer los vínculos", 500, String(err));
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");

  let body: { type?: unknown; id?: unknown; message_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }

  const type = typeof body.type === "string" ? body.type : "";
  const column = TARGET_COLUMNS[type];
  if (!column) return jsonError("type inválido (project, ticket, activity o technician)");
  const targetId = typeof body.id === "string" ? parseId(body.id) : null;
  if (!targetId) return jsonError("id inválido");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Aparición (mensaje) a la que se ancla el vínculo.
    let messageId: string | null = typeof body.message_id === "string" ? parseId(body.message_id) : null;
    let messageMediaId: string | null = null;
    if (messageId) {
      const mm = await client.query(
        `SELECT id FROM whatsapp_capture.message_media WHERE message_id = $1 AND sha256 = $2 LIMIT 1`,
        [messageId, sha256]
      );
      if (mm.rowCount === 0) {
        await client.query("ROLLBACK");
        return jsonError("El message_id no contiene esta fotografía");
      }
      messageMediaId = mm.rows[0].id;
    } else {
      const mm = await client.query(
        `SELECT id, message_id FROM whatsapp_capture.message_media
          WHERE sha256 = $1 ORDER BY created_at ASC LIMIT 1`,
        [sha256]
      );
      if (mm.rowCount === 0) {
        await client.query("ROLLBACK");
        return jsonError("Fotografía no encontrada", 404);
      }
      messageId = mm.rows[0].message_id;
      messageMediaId = mm.rows[0].id;
    }

    const { rows } = await client.query(
      `INSERT INTO whatsapp_capture.message_entity_links
         (message_id, message_media_id, ${column}, source, status)
       VALUES ($1, $2, $3, 'human', 'confirmed')
       RETURNING id`,
      [messageId, messageMediaId, targetId]
    );
    await client.query("COMMIT");
    return jsonOk({ id: rows[0].id, links: await listLinks(sha256) }, 201);
  } catch (err) {
    await client.query("ROLLBACK");
    const msg = String(err);
    if (msg.includes("foreign key")) return jsonError("El destino del vínculo no existe", 400);
    return jsonError("No se pudo crear el vínculo", 500, msg);
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");

  const id = parseId(request.nextUrl.searchParams.get("id") || "");
  if (!id) return jsonError("id inválido");

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM whatsapp_capture.message_entity_links l
        WHERE l.id = $1
          AND l.message_id IN (SELECT message_id FROM whatsapp_capture.message_media WHERE sha256 = $2)`,
      [id, sha256]
    );
    if (rowCount === 0) return jsonError("Vínculo no encontrado", 404);
    return jsonOk({ links: await listLinks(sha256) });
  } catch (err) {
    return jsonError("No se pudo eliminar el vínculo", 500, String(err));
  }
}
