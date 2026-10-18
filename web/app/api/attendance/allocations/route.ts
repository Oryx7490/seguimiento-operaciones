import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Contexto de distribución: solo jornadas cerradas y actividades trabajadas. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const technicianId = sp.get("technician_id")?.trim() || null;
  const date = sp.get("date")?.trim() || null;
  if (!technicianId || !parseId(technicianId)) return jsonError("technician_id inválido");
  if (!date || !DATE_RE.test(date)) return jsonError("date inválida");

  try {
    const tech = await pool.query(`SELECT id, display_name FROM technicians WHERE id = $1`, [technicianId]);
    if (tech.rowCount === 0) return jsonError("Técnico no encontrado", 404);

    const [att, acts] = await Promise.all([
      pool.query(
        `SELECT COALESCE(hours, 0)::numeric AS hours,
                to_char(check_in,'HH24:MI') AS check_in,
                to_char(check_out,'HH24:MI') AS check_out,
                (check_in IS NOT NULL AND check_out IS NOT NULL AND COALESCE(hours,0) > 0) AS shift_complete
           FROM attendance_entries WHERE technician_id = $1 AND date = $2::date`,
        [technicianId, date]
      ),
      pool.query(
        `SELECT a.id AS activity_id, a.description, a.status,
                CASE
                  WHEN a.ticket_id IS NOT NULL THEN 'ticket'
                  WHEN a.maintenance_policy_id IS NOT NULL THEN 'policy'
                  WHEN EXISTS (SELECT 1 FROM activity_projects ap WHERE ap.activity_id = a.id) THEN 'project'
                  ELSE 'internal'
                END AS kind,
                t.code AS ticket_code, t.title AS ticket_title,
                (SELECT string_agg(p.code || ' · ' || p.name, ', ')
                   FROM activity_projects ap JOIN projects p ON p.id = ap.project_id
                  WHERE ap.activity_id = a.id) AS projects_label,
                mp.name AS policy_name,
                COALESCE(
                  (SELECT string_agg(DISTINCT c.name, ', ')
                     FROM activity_projects ap JOIN projects p ON p.id = ap.project_id JOIN clients c ON c.id = p.client_id
                    WHERE ap.activity_id = a.id),
                  (SELECT c.name FROM tickets t JOIN clients c ON c.id = t.client_id WHERE t.id = a.ticket_id),
                  (SELECT c.name FROM maintenance_policies mp JOIN clients c ON c.id = mp.client_id WHERE mp.id = a.maintenance_policy_id)
                ) AS client_name,
                COALESCE(ata.hours, 0)::numeric AS allocated_hours
           FROM activities a
           JOIN activity_technicians at ON at.activity_id = a.id AND at.technician_id = $1
           LEFT JOIN tickets t ON t.id = a.ticket_id
           LEFT JOIN maintenance_policies mp ON mp.id = a.maintenance_policy_id
           LEFT JOIN activity_time_allocations ata
                  ON ata.activity_id = a.id AND ata.technician_id = $1 AND ata.date = $2::date
          WHERE a.date <= $2::date AND COALESCE(a.end_date, a.date) >= $2::date AND a.status IN ('in_progress','completed')
          ORDER BY a.date, a.created_at`,
        [technicianId, date]
      ),
    ]);

    const workedHours = Number(att.rows[0]?.hours ?? 0);
    const activities = acts.rows.map((r: Record<string, unknown>) => ({
      activity_id: r.activity_id,
      description: r.description,
      status: r.status,
      kind: r.kind,
      client_name: r.client_name,
      ticket_code: r.ticket_code,
      ticket_title: r.ticket_title,
      projects_label: r.projects_label,
      policy_name: r.policy_name,
      hours: Number(r.allocated_hours),
    }));
    const allocatedHours = activities.reduce((s, a) => s + a.hours, 0);
    const shiftComplete = Boolean(att.rows[0]?.shift_complete);

    return jsonOk({
      technician: { id: tech.rows[0].id, display_name: tech.rows[0].display_name },
      date,
      worked_hours: workedHours,
      shift_complete: shiftComplete,
      check_in: att.rows[0]?.check_in ?? null,
      check_out: att.rows[0]?.check_out ?? null,
      activities,
      allocated_hours: Math.round(allocatedHours * 100) / 100,
    });
  } catch (err) {
    return jsonError("No se pudo leer la distribución de horas", 500, String(err));
  }
}

/** Guarda las horas reales asignadas a las actividades de una jornada cerrada. */
export async function PUT(request: NextRequest) {
  let body: { technician_id?: string; date?: string; items?: { activity_id: string; hours: number | string }[] };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }

  const technicianId = body.technician_id ? parseId(body.technician_id) : null;
  if (!technicianId) return jsonError("technician_id inválido");
  const date = body.date ?? "";
  if (!DATE_RE.test(date)) return jsonError("date inválida (YYYY-MM-DD)");
  const items = Array.isArray(body.items) ? body.items : [];

  const parsed: { activity_id: string; hours: number }[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const activityId = it.activity_id ? parseId(it.activity_id) : null;
    if (!activityId) return jsonError("activity_id inválido");
    if (seen.has(activityId)) return jsonError("No repitas una actividad en la distribución");
    seen.add(activityId);
    const hours = Number(it.hours);
    if (!Number.isFinite(hours) || hours < 0 || Math.abs(hours * 100 - Math.round(hours * 100)) > 1e-6) return jsonError("Las horas deben ser positivas y tener máximo dos decimales");
    if (hours > 0) parsed.push({ activity_id: activityId, hours });
  }
  const totalCents = parsed.reduce((s, p) => s + Math.round(p.hours * 100), 0);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const attendance = await client.query(
      `SELECT hours FROM attendance_entries
        WHERE technician_id=$1 AND date=$2::date
          AND check_in IS NOT NULL AND check_out IS NOT NULL AND COALESCE(hours,0)>0
        FOR UPDATE`, [technicianId, date],
    );
    if (!attendance.rowCount) {
      await client.query("ROLLBACK");
      return jsonError("Solo se pueden distribuir horas de una jornada completa con entrada y salida registradas", 409);
    }
    const workedCents = Math.round(Number(attendance.rows[0].hours) * 100);
    if (totalCents !== workedCents) {
      await client.query("ROLLBACK");
      return jsonError(`La distribución debe sumar exactamente ${ (workedCents / 100).toFixed(2) } horas`, 400);
    }
    const validActivities = await client.query(
      `SELECT a.id FROM activities a
         JOIN activity_technicians at ON at.activity_id=a.id AND at.technician_id=$1
        WHERE a.id=ANY($2::uuid[]) AND a.date <= $3::date
          AND COALESCE(a.end_date,a.date) >= $3::date
          AND a.status IN ('in_progress','completed')`,
      [technicianId, parsed.map((p) => p.activity_id), date],
    );
    if (validActivities.rowCount !== parsed.length) {
      await client.query("ROLLBACK");
      return jsonError("La distribución contiene actividades que no están asignadas a este técnico en esa fecha o que no están realizadas", 400);
    }
    await client.query(`DELETE FROM activity_time_allocations WHERE technician_id = $1 AND date = $2::date`, [technicianId, date]);
    for (const p of parsed) {
      await client.query(
        `INSERT INTO activity_time_allocations (technician_id, date, activity_id, hours)
         VALUES ($1, $2, $3, $4)`,
        [technicianId, date, p.activity_id, p.hours]
      );
    }
    await client.query("COMMIT");
    return jsonOk({ technician_id: technicianId, date, items: parsed.length, total_hours: workedCents / 100 });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo guardar la distribución", 500, String(err));
  } finally {
    client.release();
  }
}
