import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

const ACTIVITY_STATUS = ["planned", "in_progress", "completed", "cancelled"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function getActorId(body?: { actor_id?: string }): Promise<string | null> {
  if (body?.actor_id) {
    const { rows } = await pool.query(`SELECT id FROM users WHERE id = $1`, [body.actor_id]);
    if (rows.length > 0) return rows[0].id;
  }
  const { rows } = await pool.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`);
  return rows.length > 0 ? rows[0].id : null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return jsonError("Se requieren parámetros from y to (YYYY-MM-DD)");

  const where = ["(a.date BETWEEN $1 AND $2 OR (a.end_date IS NOT NULL AND a.date <= $2 AND a.end_date >= $1))"];
  const params: unknown[] = [from, to];

  const technician = searchParams.get("technician");
  if (technician && parseId(technician)) {
    params.push(technician);
    where.push(`EXISTS (SELECT 1 FROM activity_technicians at WHERE at.activity_id = a.id AND at.technician_id = $${params.length})`);
  }
  const kind = searchParams.get("kind");
  if (kind === "project") {
    where.push(`EXISTS (SELECT 1 FROM activity_projects ap WHERE ap.activity_id = a.id)`);
  } else if (kind === "ticket") {
    where.push("a.ticket_id IS NOT NULL");
  } else if (kind === "internal") {
    where.push("a.internal_activity_type_id IS NOT NULL");
  }
  const status = searchParams.get("status");
  if (status && ACTIVITY_STATUS.includes(status)) {
    params.push(status);
    where.push(`a.status = $${params.length}`);
  }
  const client = searchParams.get("client");
  if (client && parseId(client)) {
    params.push(client);
    const n = params.length;
    where.push(
      `(EXISTS (SELECT 1 FROM activity_projects ap JOIN projects p ON p.id = ap.project_id
                WHERE ap.activity_id = a.id AND p.client_id = $${n})
        OR t.client_id = $${n})`
    );
  }

  try {
    const sql = `
      SELECT a.id,
             a.date::text AS date,
             a.end_date::text AS end_date,
             a.description,
             a.status,
             a.planned_hours,
             a.ticket_id,
             t.code AS ticket_code,
             t.title AS ticket_title,
             it.id AS internal_activity_type_id,
             it.name AS internal_activity_type_name,
             CASE
               WHEN EXISTS (SELECT 1 FROM activity_projects ap WHERE ap.activity_id = a.id) THEN 'project'
               WHEN a.ticket_id IS NOT NULL THEN 'ticket'
               ELSE 'internal'
             END AS kind,
             COALESCE(SUM(te.duration_hours), 0) AS worked_hours
      FROM activities a
      LEFT JOIN tickets t ON t.id = a.ticket_id
      LEFT JOIN internal_activity_types it ON it.id = a.internal_activity_type_id
      LEFT JOIN time_entries te ON te.activity_id = a.id
      WHERE ${where.join(" AND ")}
      GROUP BY a.id, t.id, it.id
      ORDER BY a.date, a.created_at`;
    const { rows } = await pool.query(sql, params);

    const projects = await pool.query(
      `SELECT ap.activity_id, p.id AS project_id, p.code AS project_code, p.name AS project_name,
              c.id AS client_id, c.name AS client_name
       FROM activity_projects ap
       JOIN projects p ON p.id = ap.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE ap.activity_id = ANY($1)
       ORDER BY ap.activity_id, p.created_at`,
      [rows.map((r) => r.id)]
    );
    const projectsByActivity = new Map<string, typeof projects.rows>();
    for (const row of projects.rows) {
      const arr = projectsByActivity.get(row.activity_id) ?? [];
      arr.push(row);
      projectsByActivity.set(row.activity_id, arr);
    }

    const techs = await pool.query(
      `SELECT at.activity_id, t.id AS technician_id, t.display_name AS technician_name
       FROM activity_technicians at
       JOIN technicians t ON t.id = at.technician_id
       WHERE at.activity_id = ANY($1)
       ORDER BY t.display_name`,
      [rows.map((r) => r.id)]
    );
    const techsByActivity = new Map<string, typeof techs.rows>();
    for (const row of techs.rows) {
      const arr = techsByActivity.get(row.activity_id) ?? [];
      arr.push(row);
      techsByActivity.set(row.activity_id, arr);
    }

    const activities = rows.map((r) => ({
      id: r.id,
      date: r.date,
      end_date: r.end_date ?? null,
      description: r.description,
      status: r.status,
      planned_hours: Number(r.planned_hours),
      worked_hours: Number(r.worked_hours),
      kind: r.kind,
      ticket_id: r.ticket_id,
      ticket_code: r.ticket_code,
      ticket_title: r.ticket_title,
      internal_activity_type_id: r.internal_activity_type_id,
      internal_activity_type_name: r.internal_activity_type_name,
      projects: projectsByActivity.get(r.id) ?? [],
      technicians: techsByActivity.get(r.id) ?? [],
      client_name: projectsByActivity.get(r.id)?.[0]?.client_name ?? null,
    }));

    return jsonOk({ activities });
  } catch (err) {
    return jsonError("No se pudieron leer las actividades", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: {
    date?: string;
    end_date?: string | null;
    description?: string;
    status?: string;
    planned_hours?: number;
    project_ids?: string[];
    ticket_id?: string;
    internal_activity_type_id?: string;
    technician_ids?: string[];
    actor_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const date = body.date ?? "";
  if (!DATE_RE.test(date)) return jsonError("date es obligatorio (YYYY-MM-DD)");
  const endDate = body.end_date ?? null;
  if (endDate !== null && (!DATE_RE.test(endDate) || endDate < date)) {
    return jsonError("end_date debe ser YYYY-MM-DD y no anterior a date");
  }
  const description = body.description?.trim();
  if (!description) return jsonError("description es obligatorio");
  const projectIds = Array.isArray(body.project_ids) ? body.project_ids.filter((id) => id && parseId(id)) : [];
  const techIds = Array.isArray(body.technician_ids) ? body.technician_ids.filter((id) => id && parseId(id)) : [];
  const hasTicket = Boolean(body.ticket_id && parseId(body.ticket_id as string));
  const hasInternal = Boolean(body.internal_activity_type_id && parseId(body.internal_activity_type_id as string));
  if (projectIds.length === 0 && !hasTicket && !hasInternal) {
    return jsonError("La actividad debe ligarse a al menos un proyecto, un ticket o un tipo interno");
  }
  if (techIds.length === 0) return jsonError("technician_ids debe tener al menos un técnico");
  const planned = Number(body.planned_hours) || 0;
  if (planned < 0) return jsonError("planned_hours no puede ser negativo");
  const status = body.status && ACTIVITY_STATUS.includes(body.status) ? body.status : "planned";

  const actorId = await getActorId(body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (hasTicket) {
      const ok = await client.query(`SELECT id FROM tickets WHERE id = $1`, [body.ticket_id]);
      if (ok.rows.length === 0) throw new Error("ticket no encontrado");
    }
    if (hasInternal) {
      const ok = await client.query(`SELECT id FROM internal_activity_types WHERE id = $1`, [body.internal_activity_type_id]);
      if (ok.rows.length === 0) throw new Error("tipo interno no encontrado");
    }
    if (projectIds.length > 0) {
      const ok = await client.query(`SELECT id FROM projects WHERE id = ANY($1)`, [projectIds]);
      if (ok.rows.length !== projectIds.length) throw new Error("proyecto no encontrado");
    }

    const act = await client.query(
      `INSERT INTO activities (date, end_date, description, status, planned_hours, ticket_id, internal_activity_type_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [date, endDate, description, status, planned, hasTicket ? body.ticket_id : null, hasInternal ? body.internal_activity_type_id : null, actorId]
    );
    const activityId = act.rows[0].id;

    for (const pid of projectIds) {
      await client.query(
        `INSERT INTO activity_projects (activity_id, project_id) VALUES ($1, $2)`,
        [activityId, pid]
      );
    }
    for (const tid of techIds) {
      await client.query(
        `INSERT INTO activity_technicians (activity_id, technician_id) VALUES ($1, $2)`,
        [activityId, tid]
      );
    }
    await client.query("COMMIT");
    return jsonOk({ activity: { id: activityId, date, description, status, planned_hours: planned } }, 201);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof Error && err.message.endsWith("no encontrado")) {
      return jsonError(err.message, 404);
    }
    return jsonError("No se pudo crear la actividad", 500, String(err));
  } finally {
    client.release();
  }
}