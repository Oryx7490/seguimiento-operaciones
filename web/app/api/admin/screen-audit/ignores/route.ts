import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT screen_id, issue_key, reason, ignored_by_name, ignored_at
       FROM screen_audit_ignores
       ORDER BY ignored_at DESC`
    );
    return jsonOk({ ignores: rows });
  } catch (err) {
    return jsonError("No se pudo leer los avisos ignorados", 500, String(err));
  }
}
