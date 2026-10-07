import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { getCurrentUserId, jsonOk, jsonError, parseId } from "@/app/lib/api";
import { logActivity } from "@/app/lib/audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  let body: {
    ticket_id?: string;
    date?: string;
    end_date?: string | null;
    description?: string;
    planned_hours?: number;
    technician_ids?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  if (!body.ticket_id || !parseId(body.ticket_id)) return jsonError("ticket_id inválido");
  if (!body.date || !DATE_RE.test(body.date)) return jsonError("date es obligatorio (YYYY-MM-DD)");
  if (body.end_date && (!DATE_RE.test(body.end_date) || body.end_date < body.date)) {
    return jsonError("end_date no puede ser anterior a date");
  }
  const description = body.description?.trim();
  if (!description) return jsonError("description es obligatorio");
  const plannedHours = Number(body.planned_hours) || 0;
  if (plannedHours < 0) return jsonError("planned_hours no puede ser negativo");
  const technicianIds = Array.isArray(body.technician_ids)
    ? [...new Set(body.technician_ids.filter((id) => parseId(id)))]
    : [];
  if (technicianIds.length === 0) return jsonError("Selecciona al menos un técnico");

  const actorId = await getCurrentUserId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ticket = await client.query<{ status: string }>(
      `SELECT status FROM tickets WHERE id = $1 FOR UPDATE`,
      [body.ticket_id]
    );
    if (ticket.rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("ticket no encontrado", 404);
    }
    if (["closed", "cancelled"].includes(ticket.rows[0].status)) {
      await client.query("ROLLBACK");
      return jsonError("No se puede programar un ticket cerrado o cancelado");
    }

    const techs = await client.query(
      `SELECT id FROM technicians WHERE id = ANY($1::uuid[]) AND active = true`,
      [technicianIds]
    );
    if (techs.rows.length !== technicianIds.length) {
      await client.query("ROLLBACK");
      return jsonError("Algún técnico no existe o está inactivo");
    }

    const activity = await client.query<{ id: string }>(
      `INSERT INTO activities (date, end_date, description, status, planned_hours, ticket_id, created_by)
       VALUES ($1, $2, $3, 'planned', $4, $5, $6)
       RETURNING id`,
      [body.date, body.end_date || null, description, plannedHours, body.ticket_id, actorId]
    );
    const activityId = activity.rows[0].id;

    for (const technicianId of technicianIds) {
      await client.query(
        `INSERT INTO activity_technicians (activity_id, technician_id) VALUES ($1, $2)`,
        [activityId, technicianId]
      );
      const activeAssignment = await client.query(
        `SELECT id FROM assignments
          WHERE ticket_id = $1 AND technician_id = $2 AND unassigned_at IS NULL`,
        [body.ticket_id, technicianId]
      );
      if (activeAssignment.rows.length === 0) {
        await client.query(
          `INSERT INTO assignments (ticket_id, technician_id) VALUES ($1, $2)`,
          [body.ticket_id, technicianId]
        );
      }
    }

    const fromStatus = ticket.rows[0].status;
    if (["new", "to_review", "unassigned"].includes(fromStatus)) {
      await client.query(`UPDATE tickets SET status = 'scheduled' WHERE id = $1`, [body.ticket_id]);
      if (actorId) {
        await client.query(
          `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
           VALUES ('ticket', $1, $2, 'scheduled', $3, 'Programación desde Gantt de tickets')`,
          [body.ticket_id, fromStatus, actorId]
        );
      }
    }

    await client.query("COMMIT");
    await logActivity(pool, {
      entity_type: "ticket",
      entity_id: body.ticket_id,
      action: "create",
      summary: `Programación desde Gantt: ${description} (${body.date}${body.end_date ? ` → ${body.end_date}` : ""}, ${technicianIds.length} técnico${technicianIds.length === 1 ? "" : "s"})`,
      details: {
        activity_id: activityId,
        date: body.date,
        end_date: body.end_date ?? null,
        planned_hours: plannedHours,
        technician_ids: technicianIds,
        status_change: fromStatus !== ticket.rows[0].status ? { from: fromStatus, to: "scheduled" } : null,
      },
      ticket_id: body.ticket_id,
      actor_id: actorId,
    });
    return jsonOk({ activity: { id: activityId }, assigned: technicianIds.length }, 201);
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo programar el ticket", 500, String(err));
  } finally {
    client.release();
  }
}
