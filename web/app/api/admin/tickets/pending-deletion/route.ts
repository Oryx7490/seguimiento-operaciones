import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.code, t.title, t.status, t.ticket_type,
              c.name  AS client_name,
              u.name  AS requested_by_name,
              t.deletion_requested_at,
              t.deletion_reason
       FROM tickets t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN users   u ON u.id = t.deletion_requested_by
       WHERE t.deletion_requested_at IS NOT NULL
       ORDER BY t.deletion_requested_at ASC`
    );
    return jsonOk({ tickets: rows });
  } catch (err) {
    return jsonError("No se pudo leer la lista", 500, String(err));
  }
}