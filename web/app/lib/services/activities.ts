import pool from "@/app/lib/db";
import { ServiceError } from "@/app/lib/services/errors";
import { logActivity } from "@/app/lib/audit";

const ACTIVITY_STATUS = ["planned", "in_progress", "completed", "cancelled"];

export interface UpdatedActivity {
  id: string;
  date: string;
  description: string | null;
  status: string;
  planned_hours: string;
}

export async function updateActivityStatus(
  id: string,
  status: string,
  actorId: string | null,
  reason = "Cambio de estado"
): Promise<UpdatedActivity> {
  if (!ACTIVITY_STATUS.includes(status)) throw new ServiceError("status inválido");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const previous = await client.query<{ status: string }>(
      `SELECT status FROM activities WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (previous.rows.length === 0) throw new ServiceError("actividad no encontrada", 404);

    const { rows } = await client.query<UpdatedActivity>(
      `UPDATE activities SET status = $2 WHERE id = $1
       RETURNING id, date::text AS date, description, status, planned_hours`,
      [id, status]
    );

    if (actorId && previous.rows[0].status !== status) {
      await client.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('activity', $1, $2, $3, $4, $5)`,
        [id, previous.rows[0].status, status, actorId, reason]
      );
      const label = await client.query<{ code: string | null }>(
        `SELECT t.code FROM activities a JOIN tickets t ON t.id = a.ticket_id WHERE a.id = $1`,
        [id]
      );
      await logActivity(client, {
        entity_type: "activity",
        entity_id: id,
        entity_label: label.rows[0]?.code ?? null,
        action: "status_change",
        summary: `Actividad ${previous.rows[0].status} → ${status}`,
        details: { from: previous.rows[0].status, to: status, reason },
        actor_id: actorId,
      });
    }

    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof ServiceError) throw err;
    throw new ServiceError("No se pudo actualizar la actividad", 500);
  } finally {
    client.release();
  }
}
