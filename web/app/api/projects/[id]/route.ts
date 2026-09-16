import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

const HEALTH_STATUS = ["on_time", "at_risk", "blocked", "no_update"];

async function getActorId(body?: { actor_id?: string }): Promise<string | null> {
  if (body?.actor_id) {
    const { rows } = await pool.query(`SELECT id FROM users WHERE id = $1`, [body.actor_id]);
    if (rows.length > 0) return rows[0].id;
  }
  const { rows } = await pool.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`);
  return rows.length > 0 ? rows[0].id : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  try {
    const project = await pool.query(
      `SELECT p.*, c.name AS client_name, l.name AS location_name, l.city,
              pr.name AS priority_name, u.name AS coordinator_name
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN locations l ON l.id = p.location_id
       LEFT JOIN priorities pr ON pr.id = p.priority_id
       LEFT JOIN users u ON u.id = p.coordinator_id
       WHERE p.id = $1`,
      [id]
    );
    if (project.rows.length === 0) return jsonError("proyecto no encontrado", 404);

    const [phases, assignments, comments, history, attachments] = await Promise.all([
      pool.query(
        `SELECT ph.*, u.name AS owner_name FROM project_phases ph
         LEFT JOIN users u ON u.id = ph.owner_id
         WHERE ph.project_id = $1 ORDER BY ph.sort_order`,
        [id]
      ),
      pool.query(
        `SELECT a.id, a.technician_id, a.role, a.assigned_at, a.unassigned_at, a.created_at,
                t.display_name AS technician_name, u.email AS technician_email
         FROM assignments a
         JOIN technicians t ON t.id = a.technician_id
         LEFT JOIN users u ON u.id = t.user_id
         WHERE a.project_id = $1 AND a.unassigned_at IS NULL
         ORDER BY a.assigned_at`,
        [id]
      ),
      pool.query(
        `SELECT cm.id, cm.body, cm.created_at, cm.updated_at, u.name AS author_name
         FROM comments cm JOIN users u ON u.id = cm.author_id
         WHERE cm.project_id = $1 ORDER BY cm.created_at`,
        [id]
      ),
      pool.query(
        `SELECT sh.*, u.name AS changed_by_name
         FROM status_history sh JOIN users u ON u.id = sh.changed_by
         WHERE sh.entity_type = 'project' AND sh.entity_id = $1 ORDER BY sh.created_at`,
        [id]
      ),
      pool.query(
        `SELECT at.*, u.name AS uploaded_by_name
         FROM attachments at JOIN users u ON u.id = at.uploaded_by
         WHERE at.project_id = $1 ORDER BY at.created_at`,
        [id]
      ),
    ]);

    const closure = await pool.query(
      `SELECT pc.* FROM project_closures pc WHERE pc.project_id = $1`,
      [id]
    );

    return jsonOk({
      project: project.rows[0],
      phases: phases.rows,
      assignments: assignments.rows,
      comments: comments.rows,
      history: history.rows,
      attachments: attachments.rows,
      closure: closure.rows[0] ?? null,
    });
  } catch (err) {
    return jsonError("No se pudo leer el proyecto", 500, String(err));
  }
}

interface PhasePatch {
  phases?: Array<{
    id?: string;
    name?: string;
    catalog_phase_id?: string | null;
    sort_order?: number;
    owner_id?: string | null;
    planned_start_date?: string | null;
    planned_end_date?: string | null;
    actual_start_date?: string | null;
    actual_end_date?: string | null;
    status?: string;
    _deleted?: boolean;
  }>;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: {
    name?: string;
    client_id?: string | null;
    location_id?: string | null;
    priority_id?: string | null;
    coordinator_id?: string | null;
    planned_start_date?: string | null;
    planned_end_date?: string | null;
    actual_start_date?: string | null;
    actual_end_date?: string | null;
    status?: string;
    health_status?: string;
    blocked_reason?: string | null;
    next_action?: string | null;
    next_action_date?: string | null;
    reason?: string;
    actor_id?: string;
  } & PhasePatch;
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const actorId = await getActorId(body);

  const setters: string[] = [];
  const values: unknown[] = [id];
  const push = (col: string, val: unknown) => {
    setters.push(`${col} = $${values.length + 1}`);
    values.push(val);
  };

  const stringFields: Array<[string, keyof typeof body]> = [
    ["name", "name"],
    ["client_id", "client_id"],
    ["location_id", "location_id"],
    ["priority_id", "priority_id"],
    ["coordinator_id", "coordinator_id"],
    ["planned_start_date", "planned_start_date"],
    ["planned_end_date", "planned_end_date"],
    ["actual_start_date", "actual_start_date"],
    ["actual_end_date", "actual_end_date"],
    ["blocked_reason", "blocked_reason"],
    ["next_action", "next_action"],
    ["next_action_date", "next_action_date"],
  ];
  for (const [col, key] of stringFields) {
    if (key in body) push(col, (body[key] as string | null | undefined) || null);
  }
  if (typeof body.health_status === "string") {
    if (!HEALTH_STATUS.includes(body.health_status)) return jsonError("health_status inválido");
    push("health_status", body.health_status);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT status, version FROM projects WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (current.rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("proyecto no encontrado", 404);
    }
    const fromStatus = current.rows[0].status;

    if (typeof body.status === "string") {
      if (!["new", "planning", "waiting_authorization", "waiting_materials", "assembly", "ready_install", "installation", "pending_docs", "closed", "cancelled"].includes(body.status)) {
        await client.query("ROLLBACK");
        return jsonError("status inválido");
      }
      push("status", body.status);
    }

    if (setters.length > 0) {
      setters.push(`version = version + 1`);
      await client.query(`UPDATE projects SET ${setters.join(", ")} WHERE id = $1`, values);
    }

    if (body.status && body.status !== fromStatus && actorId) {
      await client.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('project', $1, $2, $3, $4, $5)`,
        [id, fromStatus, body.status, actorId, body.reason || null]
      );
    }

    if (Array.isArray(body.phases)) {
      for (const ph of body.phases) {
        if (ph._deleted && ph.id) {
          await client.query(`DELETE FROM project_phases WHERE id = $1 AND project_id = $2`, [ph.id, id]);
          continue;
        }
        if (ph.id) {
          const sets: string[] = [];
          const vals: unknown[] = [];
          const setPush = (col: string, val: unknown) => {
            sets.push(`${col} = $${vals.length + 3}`);
            vals.push(val);
          };
          if (ph.name !== undefined && ph.name.trim()) setPush("name", ph.name.trim());
          if (ph.catalog_phase_id !== undefined) setPush("catalog_phase_id", ph.catalog_phase_id || null);
          if (ph.sort_order !== undefined) setPush("sort_order", ph.sort_order);
          if (ph.owner_id !== undefined) setPush("owner_id", ph.owner_id || null);
          if (ph.planned_start_date !== undefined) setPush("planned_start_date", ph.planned_start_date || null);
          if (ph.planned_end_date !== undefined) setPush("planned_end_date", ph.planned_end_date || null);
          if (ph.actual_start_date !== undefined) setPush("actual_start_date", ph.actual_start_date || null);
          if (ph.actual_end_date !== undefined) setPush("actual_end_date", ph.actual_end_date || null);
          if (ph.status !== undefined) setPush("status", ph.status);
          if (sets.length > 0) {
            await client.query(
              `UPDATE project_phases SET ${sets.join(", ")} WHERE id = $1 AND project_id = $2`,
              [ph.id, id, ...vals]
            );
          }
        } else if (ph.name?.trim()) {
          await client.query(
            `INSERT INTO project_phases (project_id, name, catalog_phase_id, sort_order, owner_id,
                                         planned_start_date, planned_end_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, ph.name.trim(), ph.catalog_phase_id || null, ph.sort_order ?? 0, ph.owner_id || null, ph.planned_start_date || null, ph.planned_end_date || null]
          );
        }
      }
    }

    const { rows } = await client.query(
      `SELECT id, code, name, status, health_status, version, updated_at FROM projects WHERE id = $1`,
      [id]
    );
    await client.query("COMMIT");
    return jsonOk({ project: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo actualizar el proyecto", 500, String(err));
  } finally {
    client.release();
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  const actorId = await getActorId();
  try {
    const { rows } = await pool.query(
      `UPDATE projects SET status = 'cancelled' WHERE id = $1 AND status <> 'cancelled' RETURNING id, status`,
      [id]
    );
    if (rows.length === 0) return jsonError("proyecto no encontrado", 404);
    if (actorId) {
      await pool.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('project', $1, $2, 'cancelled', $3, 'Cancelación de proyecto')`,
        [id, rows[0].status, actorId]
      );
    }
    return jsonOk({ cancelled: rows[0].id });
  } catch (err) {
    return jsonError("No se pudo cancelar el proyecto", 500, String(err));
  }
}