import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  let body: {
    activity_id?: string;
    technician_id?: string;
    date?: string;
    duration_hours?: number;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  if (!body.activity_id || !parseId(body.activity_id)) return jsonError("activity_id inválido");
  if (!body.technician_id || !parseId(body.technician_id)) return jsonError("technician_id inválido");
  if (!body.date || !DATE_RE.test(body.date)) return jsonError("date es obligatorio (YYYY-MM-DD)");
  const hours = Number(body.duration_hours);
  if (isNaN(hours) || hours <= 0) return jsonError("duration_hours debe ser mayor a 0");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const actOk = await client.query(`SELECT id FROM activities WHERE id = $1`, [body.activity_id]);
    if (actOk.rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("actividad no encontrada", 404);
    }
    const member = await client.query(
      `SELECT 1 FROM activity_technicians WHERE activity_id = $1 AND technician_id = $2`,
      [body.activity_id, body.technician_id]
    );
    if (member.rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("El técnico no forma parte de esta actividad", 403);
    }
    const { rows } = await client.query(
      `INSERT INTO time_entries (activity_id, technician_id, date, duration_hours, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, activity_id, technician_id, date::text AS date, duration_hours, notes`,
      [body.activity_id, body.technician_id, body.date, hours, body.notes?.trim() ?? null]
    );
    await client.query("COMMIT");
    return jsonOk({ time_entry: rows[0] }, 201);
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo registrar el tiempo", 500, String(err));
  } finally {
    client.release();
  }
}