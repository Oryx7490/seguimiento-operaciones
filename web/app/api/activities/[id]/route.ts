import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { getCurrentUserId, jsonOk, jsonError, parseId } from "@/app/lib/api";

const ACTIVITY_STATUS = ["planned", "in_progress", "completed", "cancelled"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: {
    status?: string;
    description?: string;
    planned_hours?: number;
    date?: string;
    end_date?: string | null;
    technician_ids?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const setters: string[] = [];
  const values: unknown[] = [id];
  const push = (col: string, val: unknown) => {
    setters.push(`${col} = $${values.length + 1}`);
    values.push(val);
  };

  if (body.status !== undefined) {
    if (!ACTIVITY_STATUS.includes(body.status)) return jsonError("status inválido");
    push("status", body.status);
  }
  if (body.description !== undefined) {
    const desc = body.description?.trim();
    if (!desc) return jsonError("description no puede quedar vacío");
    push("description", desc);
  }
  if (body.planned_hours !== undefined) {
    const h = Number(body.planned_hours);
    if (isNaN(h) || h < 0) return jsonError("planned_hours inválido");
    push("planned_hours", h);
  }
  if (body.date !== undefined) {
    if (!DATE_RE.test(body.date)) return jsonError("date inválido (YYYY-MM-DD)");
    push("date", body.date);
  }
  if (body.end_date !== undefined) {
    if (body.end_date !== null && !DATE_RE.test(body.end_date)) return jsonError("end_date inválido (YYYY-MM-DD)");
    push("end_date", body.end_date);
  }
  const hasTechUpdate = body.technician_ids !== undefined;
  const techIds = hasTechUpdate && Array.isArray(body.technician_ids)
    ? [...new Set(body.technician_ids.filter((tid) => tid && parseId(tid)))]
    : [];
  if (hasTechUpdate && techIds.length === 0) return jsonError("technician_ids debe tener al menos un técnico");
  if (setters.length === 0 && !hasTechUpdate) return jsonError("No hay campos para actualizar");

  const actorId = await getCurrentUserId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const previous = await client.query<{ status: string; date: string; end_date: string | null }>(
      `SELECT status, date::text AS date, end_date::text AS end_date FROM activities WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (previous.rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("actividad no encontrada", 404);
    }
    const fromStatus = previous.rows[0].status;
    const effectiveDate = body.date ?? previous.rows[0].date;
    const effectiveEnd = body.end_date !== undefined ? body.end_date : previous.rows[0].end_date;
    if (effectiveEnd && effectiveEnd < effectiveDate) {
      await client.query("ROLLBACK");
      return jsonError("end_date no puede ser anterior a date");
    }

    let rows: { id: string; date: string; end_date: string | null; description: string; status: string; planned_hours: number }[];
    if (setters.length > 0) {
      const updated = await client.query(
        `UPDATE activities SET ${setters.join(", ")} WHERE id = $1
         RETURNING id, date::text AS date, end_date::text AS end_date, description, status, planned_hours`,
        values
      );
      rows = updated.rows;
    } else {
      const current = await client.query(
        `SELECT id, date::text AS date, end_date::text AS end_date, description, status, planned_hours FROM activities WHERE id = $1`,
        [id]
      );
      rows = current.rows;
    }

    if (hasTechUpdate) {
      const ok = await client.query(`SELECT id FROM technicians WHERE id = ANY($1)`, [techIds]);
      if (ok.rows.length !== techIds.length) {
        await client.query("ROLLBACK");
        return jsonError("técnico no encontrado", 404);
      }
      await client.query(`DELETE FROM activity_technicians WHERE activity_id = $1`, [id]);
      for (const tid of techIds) {
        await client.query(
          `INSERT INTO activity_technicians (activity_id, technician_id) VALUES ($1, $2)`,
          [id, tid]
        );
      }
    }

    if (body.status !== undefined && actorId && body.status !== fromStatus) {
      await client.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('activity', $1, $2, $3, $4, $5)`,
        [id, fromStatus, body.status, actorId, "Cambio de estado"]
      );
    }

    await client.query("COMMIT");
    return jsonOk({ activity: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo actualizar la actividad", 500, String(err));
  } finally {
    client.release();
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  const actorId = await getCurrentUserId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const previous = await client.query<{ status: string }>(
      `SELECT status FROM activities WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (previous.rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("actividad no encontrada", 404);
    }
    const fromStatus = previous.rows[0].status;
    if (fromStatus === "cancelled") {
      await client.query("ROLLBACK");
      return jsonError("actividad no encontrada", 404);
    }
    await client.query(`UPDATE activities SET status = 'cancelled' WHERE id = $1`, [id]);
    if (actorId) {
      await client.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('activity', $1, $2, 'cancelled', $3, $4)`,
        [id, fromStatus, actorId, "Cancelación de actividad"]
      );
    }
    await client.query("COMMIT");
    return jsonOk({ cancelled: id });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo cancelar la actividad", 500, String(err));
  } finally {
    client.release();
  }
}