import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

const TICKET_STATUS = [
  "new",
  "to_review",
  "unassigned",
  "scheduled",
  "in_progress",
  "waiting_client",
  "waiting_material",
  "waiting_access",
  "resolved_pending_validation",
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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  try {
    const ticket = await pool.query(
      `SELECT t.*, c.name AS client_name, l.name AS location_name, l.city,
              pr.name AS priority_name, u.name AS coordinator_name, ch.name AS channel_name
       FROM tickets t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN locations l ON l.id = t.location_id
       LEFT JOIN priorities pr ON pr.id = t.priority_id
       LEFT JOIN users u ON u.id = t.coordinator_id
       LEFT JOIN ticket_channels ch ON ch.id = t.channel_id
       WHERE t.id = $1`,
      [id]
    );
    if (ticket.rows.length === 0) return jsonError("ticket no encontrado", 404);

    const [assignments, comments, history, attachments] = await Promise.all([
      pool.query(
        `SELECT a.id, a.technician_id, a.role, a.assigned_at, a.unassigned_at, a.created_at,
                t.display_name AS technician_name, u.email AS technician_email
         FROM assignments a
         JOIN technicians t ON t.id = a.technician_id
         LEFT JOIN users u ON u.id = t.user_id
         WHERE a.ticket_id = $1 AND a.unassigned_at IS NULL
         ORDER BY a.assigned_at`,
        [id]
      ),
      pool.query(
        `SELECT cm.id, cm.author_id, cm.body, cm.created_at, cm.updated_at, u.name AS author_name
         FROM comments cm JOIN users u ON u.id = cm.author_id
         WHERE cm.ticket_id = $1 ORDER BY cm.created_at`,
        [id]
      ),
      pool.query(
        `SELECT sh.*, u.name AS changed_by_name
         FROM status_history sh JOIN users u ON u.id = sh.changed_by
         WHERE sh.entity_type = 'ticket' AND sh.entity_id = $1 ORDER BY sh.created_at`,
        [id]
      ),
      pool.query(
        `SELECT at.*, u.name AS uploaded_by_name
         FROM attachments at JOIN users u ON u.id = at.uploaded_by
         WHERE at.ticket_id = $1 ORDER BY at.created_at`,
        [id]
      ),
    ]);

    return jsonOk({
      ticket: ticket.rows[0],
      assignments: assignments.rows,
      comments: comments.rows,
      history: history.rows,
      attachments: attachments.rows,
    });
  } catch (err) {
    return jsonError("No se pudo leer el ticket", 500, String(err));
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: {
    title?: string;
    description?: string;
    client_id?: string | null;
    location_id?: string | null;
    priority_id?: string | null;
    coordinator_id?: string | null;
    status?: string;
    reported_by?: string;
    channel_id?: string | null;
    waiting_reason?: string | null;
    next_action?: string | null;
    next_action_date?: string | null;
    first_response_at?: string | null;
    resolved_at?: string | null;
    closed_at?: string | null;
    reason?: string;
    actor_id?: string;
  };
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
    ["title", "title"],
    ["description", "description"],
    ["client_id", "client_id"],
    ["location_id", "location_id"],
    ["priority_id", "priority_id"],
    ["coordinator_id", "coordinator_id"],
    ["reported_by", "reported_by"],
    ["channel_id", "channel_id"],
    ["waiting_reason", "waiting_reason"],
    ["next_action", "next_action"],
    ["next_action_date", "next_action_date"],
    ["first_response_at", "first_response_at"],
    ["resolved_at", "resolved_at"],
    ["closed_at", "closed_at"],
  ];
  for (const [col, key] of stringFields) {
    if (key in body) push(col, (body[key] as string | null | undefined) || null);
  }
  if (typeof body.status === "string") {
    if (!TICKET_STATUS.includes(body.status)) return jsonError("status inválido");
    push("status", body.status);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ status: string; ticket_type: string }>(
      `SELECT status, ticket_type FROM tickets WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (current.rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("ticket no encontrado", 404);
    }
    const fromStatus = current.rows[0].status;
    const ticketType = current.rows[0].ticket_type;

    if ("client_id" in body && !body.client_id && ticketType === "external") {
      await client.query("ROLLBACK");
      return jsonError("Un ticket externo requiere cliente");
    }

    if (body.status && body.status === "closed" && !("closed_at" in body)) {
      push("closed_at", new Date().toISOString());
    }
    if (body.status && body.status === "resolved_pending_validation" && !("resolved_at" in body)) {
      push("resolved_at", new Date().toISOString());
    }

    if (setters.length > 0) {
      setters.push("version = version + 1");
      await client.query(`UPDATE tickets SET ${setters.join(", ")} WHERE id = $1`, values);
    }

    if (body.status && body.status !== fromStatus && actorId) {
      await client.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('ticket', $1, $2, $3, $4, $5)`,
        [id, fromStatus, body.status, actorId, body.reason || null]
      );
    }

    const { rows } = await client.query(
      `SELECT id, code, title, status, version, updated_at FROM tickets WHERE id = $1`,
      [id]
    );
    await client.query("COMMIT");
    return jsonOk({ ticket: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo actualizar el ticket", 500, String(err));
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
      `UPDATE tickets SET status = 'cancelled' WHERE id = $1 AND status <> 'cancelled' RETURNING id, status`,
      [id]
    );
    if (rows.length === 0) return jsonError("ticket no encontrado", 404);
    if (actorId) {
      await pool.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('ticket', $1, $2, 'cancelled', $3, 'Cancelación de ticket')`,
        [id, rows[0].status, actorId]
      );
    }
    return jsonOk({ cancelled: rows[0].id });
  } catch (err) {
    return jsonError("No se pudo cancelar el ticket", 500, String(err));
  }
}