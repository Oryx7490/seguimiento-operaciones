import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

async function getActorId(body?: { actor_id?: string }): Promise<string | null> {
  if (body?.actor_id) {
    const { rows } = await pool.query(`SELECT id FROM users WHERE id = $1`, [body.actor_id]);
    if (rows.length > 0) return rows[0].id;
  }
  const { rows } = await pool.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`);
  return rows.length > 0 ? rows[0].id : null;
}

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

  const actorId = await getActorId(body);
  if (!actorId) return jsonError("No hay un usuario válido para editar el comentario");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(`SELECT author_id FROM comments WHERE id = $1 FOR UPDATE`, [id]);
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
    await client.query("COMMIT");
    return jsonOk({ comment: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo editar el comentario", 500, String(err));
  } finally {
    client.release();
  }
}