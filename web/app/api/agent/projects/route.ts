import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";
import { authenticateAgent, agentReason, unauthorized } from "@/app/lib/agent-auth";
import { createProject, type CreateProjectInput } from "@/app/lib/services/projects";
import { ServiceError } from "@/app/lib/services/errors";

const ACTIVE_STATUS = [
  "new",
  "planning",
  "waiting_authorization",
  "waiting_materials",
  "assembly",
  "ready_install",
  "installation",
  "pending_docs",
];

export async function GET(req: NextRequest) {
  const identity = await authenticateAgent(req);
  if (!identity) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q");

  let sql = `SELECT p.id, p.code, p.name, p.status, p.health_status, p.blocked_reason,
                    p.next_action, p.next_action_date, p.planned_start_date, p.planned_end_date,
                    p.actual_start_date, p.actual_end_date, p.coordinator_id,
                    c.name AS client_name, l.name AS location_name, l.city,
                    u.name AS coordinator_name,
                    COALESCE(ph.phases, '[]'::json) AS phases
             FROM projects p
             LEFT JOIN clients c ON c.id = p.client_id
             LEFT JOIN locations l ON l.id = p.location_id
             LEFT JOIN users u ON u.id = p.coordinator_id
             LEFT JOIN LATERAL (
               SELECT json_agg(json_build_object(
                        'id', pp.id,
                        'name', pp.name,
                        'status', pp.status,
                        'sort_order', pp.sort_order,
                        'owner_id', pp.owner_id,
                        'planned_start_date', pp.planned_start_date,
                        'planned_end_date', pp.planned_end_date,
                        'actual_start_date', pp.actual_start_date,
                        'actual_end_date', pp.actual_end_date
                      ) ORDER BY pp.sort_order) AS phases
                 FROM project_phases pp WHERE pp.project_id = p.id
             ) ph ON true
             WHERE p.status <> 'cancelled'`;
  const values: unknown[] = [];
  if (status && ACTIVE_STATUS.includes(status)) {
    values.push(status);
    sql += ` AND p.status = $${values.length}`;
  } else {
    sql += ` AND p.status NOT IN ('closed', 'cancelled')`;
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
  const identity = await authenticateAgent(req);
  if (!identity) return unauthorized();

  let body: CreateProjectInput;
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  try {
    const project = await createProject(body, identity.actorId, agentReason(identity, "Proyecto creado"));
    return jsonOk({ project }, 201);
  } catch (err) {
    if (err instanceof ServiceError) return jsonError(err.message, err.status);
    return jsonError("No se pudo crear el proyecto", 500, String(err));
  }
}
