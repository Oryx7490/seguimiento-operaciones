import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, timezone FROM users WHERE role IN ('admin', 'coordinator') ORDER BY created_at LIMIT 1`
    );
    if (rows.length === 0) return jsonError("No hay usuarios disponibles", 404);
    return jsonOk({ user: rows[0] });
  } catch (err) {
    return jsonError("No se pudo leer el usuario actual", 500, String(err));
  }
}