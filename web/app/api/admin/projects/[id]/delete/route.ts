import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

async function getActorId(): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`
  );
  return rows[0]?.id ?? null;
}

// POST  → eliminar definitivamente (admin confirma)
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  const actorId = await getActorId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verificar que tenga solicitud pendiente
    const { rows } = await client.query(
      `SELECT id, code, status, deletion_requested_at FROM projects WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("proyecto no encontrado", 404);
    }
    if (!rows[0].deletion_requested_at) {
      await client.query("ROLLBACK");
      return jsonError("El proyecto no tiene una solicitud de eliminación pendiente");
    }

    // Registrar en historial antes de eliminar
    if (actorId) {
      await client.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('project', $1, $2, 'deleted', $3, 'Eliminación aprobada por administrador')`,
        [id, rows[0].status ?? "unknown", actorId]
      );
    }

    // Actividades ligadas solo a este proyecto: si el CASCADE suelta el vínculo,
    // el trigger impide dejarlas sin proyecto, ticket ni tipo interno.
    await client.query(
      `DELETE FROM activities a
       WHERE a.ticket_id IS NULL
         AND a.internal_activity_type_id IS NULL
         AND EXISTS (
           SELECT 1 FROM activity_projects ap
           WHERE ap.activity_id = a.id AND ap.project_id = $1
         )
         AND NOT EXISTS (
           SELECT 1 FROM activity_projects ap
           WHERE ap.activity_id = a.id AND ap.project_id <> $1
         )`,
      [id]
    );

    await client.query(`DELETE FROM projects WHERE id = $1`, [id]);
    await client.query("COMMIT");
    return jsonOk({ deleted: id, code: rows[0].code });
  } catch (err) {
    await client.query("ROLLBACK");
    const detail = err instanceof Error ? err.message : String(err);
    return jsonError(`No se pudo eliminar el proyecto: ${detail}`, 500);
  } finally {
    client.release();
  }
}

// DELETE → rechazar / cancelar la solicitud de eliminación (admin rechaza)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  try {
    const { rows } = await pool.query(
      `UPDATE projects
       SET deletion_requested_at = NULL,
           deletion_requested_by = NULL,
           deletion_reason       = NULL
       WHERE id = $1
       RETURNING id, code`,
      [id]
    );
    if (rows.length === 0) return jsonError("proyecto no encontrado", 404);
    return jsonOk({ cancelled: rows[0].id, code: rows[0].code });
  } catch (err) {
    return jsonError("No se pudo cancelar la solicitud", 500, String(err));
  }
}