import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.code, p.name, p.status,
              c.name  AS client_name,
              u.name  AS requested_by_name,
              p.deletion_requested_at,
              p.deletion_reason
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN users   u ON u.id = p.deletion_requested_by
       WHERE p.deletion_requested_at IS NOT NULL
       ORDER BY p.deletion_requested_at ASC`
    );
    return jsonOk({ projects: rows });
  } catch (err) {
    return jsonError("No se pudo leer la lista", 500, String(err));
  }
}