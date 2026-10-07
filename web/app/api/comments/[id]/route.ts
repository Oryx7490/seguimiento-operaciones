import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { getCurrentUserId, jsonError, jsonOk, parseId } from "@/app/lib/api";
import { logActivity } from "@/app/lib/audit";


export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: { body?: string; actor_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const newBody = body.body?.trim();
  if (!newBody) return jsonError("body es obligatorio");

  const actorId = await getCurrentUserId();
  if (!actorId) return jsonError("No hay un usuario válido para editar el comentario");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT author_id, project_id, ticket_id, client_id FROM comments WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (cur.rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("comentario no encontrado", 404);
    }
    if (cur.rows[0].author_id !== actorId) {
      await client.query("ROLLBACK");
      return jsonError("Solo el autor puede editar su comentario", 403);
    }
    const { rows } = await client.query(
      `UPDATE comments SET body = $2 WHERE id = $1
       RETURNING id, body, created_at, updated_at, author_id`,
      [id, newBody]
    );
    await logActivity(client, {
      entity_type: "comment",
      entity_id: id,
      action: "update",
      summary: `Comentario editado: ${newBody.slice(0, 80)}${newBody.length > 80 ? "…" : ""}`,
      details: { body: newBody },
      project_id: cur.rows[0].project_id ?? null,
      ticket_id: cur.rows[0].ticket_id ?? null,
      actor_id: actorId,
    });
    await client.query("COMMIT");
    return jsonOk({ comment: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo editar el comentario", 500, String(err));
  } finally {
    client.release();
  }
}