import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";
import { createProject, type CreateProjectInput } from "@/app/lib/services/projects";
import { ServiceError } from "@/app/lib/services/errors";

const PROJECT_STATUS = [
  "new",
  "planning",
  "waiting_authorization",
  "waiting_materials",
  "assembly",
  "ready_install",
  "installation",
  "pending_docs",
  "closed",
  "cancelled",
];

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
  const status = searchParams.get("status");
  const q = searchParams.get("q");

  let sql = `SELECT p.id, p.code, p.name, p.status, p.health_status, p.priority_id, p.coordinator_id,
                    p.client_id, p.location_id, p.planned_start_date, p.planned_end_date,
                    p.actual_start_date, p.actual_end_date, p.blocked_reason, p.next_action,
                    p.next_action_date, p.last_activity_at, p.version,
                    c.name AS client_name, l.name AS location_name, l.city,
                    pr.name AS priority_name,
                    u.name AS coordinator_name,
                    (SELECT count(*) FROM project_phases ph2 WHERE ph2.project_id = p.id) AS phase_count,
                    (SELECT min(ph2.planned_start_date) FROM project_phases ph2 WHERE ph2.project_id = p.id) AS min_phase_start,
                    (SELECT max(ph2.planned_end_date)   FROM project_phases ph2 WHERE ph2.project_id = p.id) AS max_phase_end,
                    (SELECT COALESCE(SUM(ps.quantity), 0)::int
                       FROM project_screens ps WHERE ps.project_id = p.id) AS screen_count,
                    (SELECT COALESCE(SUM((CASE WHEN ps.is_irregular
                                              THEN COALESCE(ps.area_m2, 0)
                                              ELSE COALESCE(ps.width_m, 0) * COALESCE(ps.height_m, 0)
                                          END) * ps.quantity), 0)::float8
                       FROM project_screens ps WHERE ps.project_id = p.id) AS screen_m2_total,
                    (SELECT bool_and(ph2.status IN ('completed', 'not_applicable')) FROM project_phases ph2 WHERE ph2.project_id = p.id) AS all_phases_completed
             FROM projects p
             LEFT JOIN clients c ON c.id = p.client_id
             LEFT JOIN locations l ON l.id = p.location_id
             LEFT JOIN priorities pr ON pr.id = p.priority_id
             LEFT JOIN users u ON u.id = p.coordinator_id
             WHERE p.status <> 'cancelled'`;
  const values: unknown[] = [];
  if (status && PROJECT_STATUS.includes(status)) {
    values.push(status);
    sql += ` AND p.status = $${values.length}`;
  }
  if (q) {
    values.push(`%${q.trim()}%`);
    sql += ` AND (p.name ILIKE $${values.length} OR p.code ILIKE $${values.length} OR c.name ILIKE $${values.length})`;
  }
  sql += ` ORDER BY p.planned_start_date NULLS LAST, p.name`;

  try {
    const { rows } = await pool.query(sql, values);
    return jsonOk({ projects: rows });
  } catch (err) {
    return jsonError("No se pudieron leer los proyectos", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: CreateProjectInput & { actor_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const actorId = await getActorId(body);
  try {
    const project = await createProject(body, actorId);
    return jsonOk({ project }, 201);
  } catch (err) {
    if (err instanceof ServiceError) return jsonError(err.message, err.status);
    return jsonError("No se pudo crear el proyecto", 500, String(err));
  }
}
