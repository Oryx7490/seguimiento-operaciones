import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.code, t.title, t.ticket_type,
              c.name  AS client_name,
              u.name  AS coordinator_name,
              t.closed_at,
              t.updated_at,
              -- último estado antes del cierre
              (SELECT sh.from_status
                 FROM status_history sh
                WHERE sh.entity_type = 'ticket' AND sh.entity_id = t.id
                  AND sh.to_status   = 'closed'
                ORDER BY sh.created_at DESC
                LIMIT 1) AS prev_status
       FROM tickets t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN users   u ON u.id = t.coordinator_id
       WHERE t.status = 'closed'
       ORDER BY t.closed_at DESC`
    );
    return jsonOk({ tickets: rows });
  } catch (err) {
    return jsonError("No se pudo leer la lista", 500, String(err));
  }
}