import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.code, p.name,
              c.name  AS client_name,
              u.name  AS coordinator_name,
              p.actual_end_date,
              p.planned_end_date,
              p.updated_at,
              -- último estado antes del cierre
              (SELECT sh.from_status
                 FROM status_history sh
                WHERE sh.entity_type = 'project' AND sh.entity_id = p.id
                  AND sh.to_status   = 'closed'
                ORDER BY sh.created_at DESC
                LIMIT 1) AS prev_status
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN users   u ON u.id = p.coordinator_id
       WHERE p.status = 'closed'
         AND p.deletion_requested_at IS NULL
       ORDER BY p.updated_at DESC`
    );
    return jsonOk({ projects: rows });
  } catch (err) {
    return jsonError("No se pudo leer la lista", 500, String(err));
  }
}