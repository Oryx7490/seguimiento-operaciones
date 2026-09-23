import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

async function getActorId(): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`
  );
  return rows[0]?.id ?? null;
}

// POST → reabrir ticket cerrado al estado anterior al cierre
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  const actorId = await getActorId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT t.id, t.code, t.status,
              (SELECT sh.from_status
                 FROM status_history sh
                WHERE sh.entity_type = 'ticket' AND sh.entity_id = t.id
                  AND sh.to_status = 'closed'
                ORDER BY sh.created_at DESC
                LIMIT 1) AS prev_status
       FROM tickets WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("ticket no encontrado", 404);
    }
    if (rows[0].status !== "closed") {
      await client.query("ROLLBACK");
      return jsonError("El ticket no está cerrado");
    }

    // Restaurar al estado anterior, o 'to_review' si no hay historial
    const restoreStatus = rows[0].prev_status ?? "to_review";

    await client.query(
      `UPDATE tickets
         SET status    = $2,
             closed_at = NULL,
             version   = version + 1
       WHERE id = $1`,
      [id, restoreStatus]
    );

    if (actorId) {
      await client.query(
        `INSERT INTO status_history
           (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('ticket', $1, 'closed', $2, $3, 'Reabierto por administrador')`,
        [id, restoreStatus, actorId]
      );
    }

    await client.query("COMMIT");
    return jsonOk({ reopened: id, code: rows[0].code, status: restoreStatus });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo reabrir el ticket", 500, String(err));
  } finally {
    client.release();
  }
}