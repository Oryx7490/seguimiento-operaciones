import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET() {
  try {
    const [p, ph, iat, ch] = await Promise.all([
      pool.query(`SELECT id, name, sort_order, active FROM priorities ORDER BY sort_order`),
      pool.query(`SELECT id, name, sort_order, active FROM phase_catalog ORDER BY sort_order`),
      pool.query(
        `SELECT id, name, requires_approval, sort_order, active FROM internal_activity_types ORDER BY sort_order`
      ),
      pool.query(`SELECT id, name, active FROM ticket_channels ORDER BY name`),
    ]);
    return jsonOk({
      priorities: p.rows,
      phases: ph.rows,
      internal_activity_types: iat.rows,
      ticket_channels: ch.rows,
    });
  } catch (err) {
    return jsonError("No se pudieron leer los catálogos", 500, String(err));
  }
}