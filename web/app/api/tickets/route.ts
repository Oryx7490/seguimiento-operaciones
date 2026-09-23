import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";
import { createTicket, type CreateTicketInput } from "@/app/lib/services/tickets";
import { ServiceError } from "@/app/lib/services/errors";

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const q = searchParams.get("q");

  let sql = `SELECT t.id, t.code, t.title, t.description, t.ticket_type, t.status, t.priority_id,
                    t.client_id, t.location_id, t.coordinator_id, t.reported_by, t.opened_at,
                    t.first_response_at, t.resolved_at, t.closed_at, t.waiting_reason,
                    t.next_action, t.next_action_date, t.last_activity_at, t.version,
                    COALESCE(c.name, CASE WHEN t.ticket_type = 'internal' THEN 'RGB' END) AS client_name,
                    l.name AS location_name, l.city,
                    pr.name AS priority_name, u.name AS coordinator_name, ch.name AS channel_name
             FROM tickets t
             LEFT JOIN clients c ON c.id = t.client_id
             LEFT JOIN locations l ON l.id = t.location_id
             LEFT JOIN priorities pr ON pr.id = t.priority_id
             LEFT JOIN users u ON u.id = t.coordinator_id
             LEFT JOIN ticket_channels ch ON ch.id = t.channel_id
             WHERE t.status <> 'cancelled'`;
  const values: unknown[] = [];
  if (status && TICKET_STATUS.includes(status)) {
    values.push(status);
    sql += ` AND t.status = $${values.length}`;
  }
  if (type === "external" || type === "internal") {
    values.push(type);
    sql += ` AND t.ticket_type = $${values.length}`;
  }
  if (q) {
    values.push(`%${q.trim()}%`);
    sql += ` AND (t.title ILIKE $${values.length} OR t.code ILIKE $${values.length} OR c.name ILIKE $${values.length})`;
  }
  sql += ` ORDER BY t.opened_at DESC`;

  try {
    const { rows } = await pool.query(sql, values);
    return jsonOk({ tickets: rows });
  } catch (err) {
    return jsonError("No se pudieron leer los tickets", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: CreateTicketInput & { actor_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const actorId = await getActorId(body);
  try {
    const ticket = await createTicket(body, actorId);
    return jsonOk({ ticket }, 201);
  } catch (err) {
    if (err instanceof ServiceError) return jsonError(err.message, err.status);
    return jsonError("No se pudo crear el ticket", 500, String(err));
  }
}
