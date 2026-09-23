import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

const IMPROVEMENT_STATUS = ["open", "in_progress", "done", "wontfix"];
const IMPROVEMENT_CATEGORY = ["feature", "bug", "ux", "other"];
const IMPROVEMENT_PRIORITY = ["low", "medium", "high", "critical"];

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
    const improvement = await pool.query(
      `SELECT i.*, u.name AS assigned_to_name, cu.name AS closed_by_name
       FROM improvements i
       LEFT JOIN users u ON u.id = i.assigned_to
       LEFT JOIN users cu ON cu.id = i.closed_by
       WHERE i.id = $1`,
      [id]
    );
    if (improvement.rows.length === 0) return jsonError("mejora no encontrada", 404);

    const [comments, history] = await Promise.all([
      pool.query(
        `SELECT cm.id, cm.author_id, cm.body, cm.created_at, cm.updated_at, u.name AS author_name
         FROM comments cm JOIN users u ON u.id = cm.author_id
         WHERE cm.entity_type = 'improvement' AND cm.entity_id = $1 ORDER BY cm.created_at`,
        [id]
      ),
      pool.query(
        `SELECT sh.*, u.name AS changed_by_name
         FROM status_history sh JOIN users u ON u.id = sh.changed_by
         WHERE sh.entity_type = 'improvement' AND sh.entity_id = $1 ORDER BY sh.created_at`,
        [id]
      ),
    ]);

    return jsonOk({
      improvement: improvement.rows[0],
      comments: comments.rows,
      history: history.rows,
    });
  } catch (err) {
    return jsonError("No se pudo leer la mejora", 500, String(err));
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: {
    title?: string;
    description?: string | null;
    category?: string;
    priority?: string;
    status?: string;
    assigned_to?: string | null;
    resolution?: string | null;
    close_improvement?: boolean;
    actor_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const actorId = await getActorId(body);

  if (typeof body.category === "string" && !IMPROVEMENT_CATEGORY.includes(body.category)) {
    return jsonError("category inválida");
  }
  if (typeof body.priority === "string" && !IMPROVEMENT_PRIORITY.includes(body.priority)) {
    return jsonError("priority inválida");
  }
  if (typeof body.status === "string" && !IMPROVEMENT_STATUS.includes(body.status)) {
    return jsonError("status inválido");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const current = await client.query(
      `SELECT status FROM improvements WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (current.rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("mejora no encontrada", 404);
    }
    const fromStatus = current.rows[0].status;

    const setters: string[] = [];
    const values: unknown[] = [id];
    const push = (col: string, val: unknown) => {
      setters.push(`${col} = $${values.length + 1}`);
      values.push(val);
    };

    const stringFields: Array<[string, keyof typeof body]> = [
      ["title", "title"],
      ["description", "description"],
      ["category", "category"],
      ["priority", "priority"],
      ["assigned_to", "assigned_to"],
      ["resolution", "resolution"],
    ];
    for (const [col, key] of stringFields) {
      if (key in body) push(col, (body[key] as string | null | undefined) || null);
    }

    if (typeof body.status === "string") {
      push("status", body.status);
    }

    if (body.close_improvement) {
      if (body.status !== "done" && body.status !== "wontfix") {
        await client.query("ROLLBACK");
        return jsonError("Para cerrar, status debe ser 'done' o 'wontfix'");
      }
      if (!body.resolution?.trim()) {
        await client.query("ROLLBACK");
        return jsonError("La resolución es obligatoria al cerrar");
      }
      push("closed_at", new Date().toISOString());
      push("closed_by", actorId);
    }

    if (setters.length > 0) {
      setters.push("updated_at = now()");
      await client.query(`UPDATE improvements SET ${setters.join(", ")} WHERE id = $1`, values);
    }

    if (body.status && body.status !== fromStatus && actorId) {
      await client.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('improvement', $1, $2, $3, $4, $5)`,
        [id, fromStatus, body.status, actorId, body.resolution || null]
      );
    }

    const { rows } = await client.query(
      `SELECT i.*, u.name AS assigned_to_name FROM improvements i LEFT JOIN users u ON u.id = i.assigned_to WHERE i.id = $1`,
      [id]
    );
    await client.query("COMMIT");
    return jsonOk({ improvement: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo actualizar la mejora", 500, String(err));
  } finally {
    client.release();
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  const actorId = await getActorId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE improvements SET status = 'wontfix' WHERE id = $1 AND status <> 'wontfix' RETURNING id, status`,
      [id]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("mejora no encontrada", 404);
    }
    if (actorId) {
      await client.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('improvement', $1, $2, 'wontfix', $3, 'Cancelación')`,
        [id, rows[0].status, actorId]
      );
    }
    await client.query("COMMIT");
    return jsonOk({ cancelled: rows[0].id });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo cancelar la mejora", 500, String(err));
  } finally {
    client.release();
  }
}