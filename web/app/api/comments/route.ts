import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { getCurrentUserId, jsonError, jsonOk, parseId } from "@/app/lib/api";
import { logActivity } from "@/app/lib/audit";


export async function POST(req: NextRequest) {
  let body: {
    project_id?: string;
    ticket_id?: string;
    client_id?: string;
    body?: string;
    actor_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const hasProject = Boolean(body.project_id && parseId(body.project_id as string));
  const hasTicket = Boolean(body.ticket_id && parseId(body.ticket_id as string));
  const hasClient = Boolean(body.client_id && parseId(body.client_id as string));
  if (Number(hasProject) + Number(hasTicket) + Number(hasClient) !== 1) {
    return jsonError("Debes indicar exactamente uno: project_id, ticket_id o client_id");
  }
  const commentBody = body.body?.trim();
  if (!commentBody) return jsonError("body es obligatorio");

  const actorId = await getCurrentUserId();
  if (!actorId) return jsonError("No hay un usuario válido para autor del comentario");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const entityCol = hasProject ? "project_id" : hasTicket ? "ticket_id" : "client_id";
    const entityTable = hasProject ? "projects" : hasTicket ? "tickets" : "clients";
    const entityLabel = hasProject ? "proyecto" : hasTicket ? "ticket" : "cliente";
    const entityId = (hasProject ? body.project_id : hasTicket ? body.ticket_id : body.client_id) as string;
    const ok = await client.query(`SELECT id FROM ${entityTable} WHERE id = $1`, [entityId]);
    if (ok.rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError(`${entityLabel} no encontrado`, 404);
    }
    const { rows } = await client.query(
      `INSERT INTO comments (${entityCol}, author_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, body, created_at, updated_at, author_id`,
      [entityId, actorId, commentBody]
    );
    await logActivity(client, {
      entity_type: "comment",
      entity_id: rows[0].id,
      action: "comment",
      summary: `Comentario en ${entityLabel}: ${commentBody.slice(0, 80)}${commentBody.length > 80 ? "…" : ""}`,
      details: { body: commentBody },
      project_id: hasProject ? entityId : null,
      ticket_id: hasTicket ? entityId : null,
      actor_id: actorId,
    });
    await client.query("COMMIT");
    return jsonOk({ comment: rows[0] }, 201);
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo crear el comentario", 500, String(err));
  } finally {
    client.release();
  }
}