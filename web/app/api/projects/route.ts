import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

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

const HEALTH_STATUS = ["on_time", "at_risk", "blocked", "no_update"];

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
                    (SELECT bool_and(ph2.status = 'completed') FROM project_phases ph2 WHERE ph2.project_id = p.id) AS all_phases_completed
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

interface PhaseInput {
  name?: string;
  catalog_phase_id?: string | null;
  sort_order?: number;
  owner_id?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
}

export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    client_id?: string;
    location_id?: string;
    priority_id?: string;
    coordinator_id?: string;
    planned_start_date?: string;
    planned_end_date?: string;
    phases?: PhaseInput[];
    actor_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const name = body.name?.trim();
  if (!name) return jsonError("name es obligatorio");

  const actorId = await getActorId(body);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const codeRes = await client.query(
      `SELECT 'PR-' || lpad(nextval('project_code_seq')::text, 3, '0') AS code`
    );
    const projectRes = await client.query(
      `INSERT INTO projects (code, name, client_id, location_id, priority_id, coordinator_id,
                             planned_start_date, planned_end_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, code, name, status, health_status, created_at`,
      [
        codeRes.rows[0].code,
        name,
        body.client_id || null,
        body.location_id || null,
        body.priority_id || null,
        body.coordinator_id || null,
        body.planned_start_date || null,
        body.planned_end_date || null,
        actorId,
      ]
    );
    const projectId = projectRes.rows[0].id;

    let phases: PhaseInput[] | undefined = body.phases;
    if (!phases || phases.length === 0) {
      const catalog = await client.query(
        `SELECT id, name, sort_order FROM phase_catalog WHERE active = true ORDER BY sort_order`
      );
      phases = (catalog.rows as { id: string; name: string; sort_order: number }[]).map((r) => ({
        catalog_phase_id: r.id,
        name: r.name,
        sort_order: r.sort_order,
      }));
    }
    for (const [idx, ph] of (phases ?? []).entries()) {
      const phName = ph.name?.trim();
      if (!phName) throw new Error("Cada fase debe tener un nombre");
      await client.query(
        `INSERT INTO project_phases (project_id, name, catalog_phase_id, sort_order, owner_id,
                                     planned_start_date, planned_end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          projectId,
          phName,
          ph.catalog_phase_id || null,
          ph.sort_order ?? idx + 1,
          ph.owner_id || null,
          ph.planned_start_date || null,
          ph.planned_end_date || null,
        ]
      );
    }

    if (actorId) {
      await client.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('project', $1, NULL, 'new', $2, 'Alta de proyecto')`,
        [projectId, actorId]
      );
    }

    await client.query("COMMIT");
    return jsonOk({ project: { ...projectRes.rows[0], id: projectId } }, 201);
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo crear el proyecto", 500, String(err));
  } finally {
    client.release();
  }
}