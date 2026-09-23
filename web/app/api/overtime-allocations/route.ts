import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId } from "@/app/lib/api";
import { round2 } from "@/app/lib/overtime";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(req: NextRequest) {
  let body: {
    technician_id?: string;
    date?: string;
    allocations?: { activity_id?: string; percent?: number }[];
    reset?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  if (!body.technician_id || !parseId(body.technician_id)) return jsonError("technician_id inválido");
  if (!body.date || !DATE_RE.test(body.date)) return jsonError("date inválida");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const tech = await client.query(`SELECT id FROM technicians WHERE id = $1`, [body.technician_id]);
    if (tech.rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("técnico no encontrado", 404);
    }

    if (body.reset) {
      await client.query(
        `DELETE FROM overtime_allocations WHERE technician_id = $1 AND date = $2`,
        [body.technician_id, body.date]
      );
      await client.query("COMMIT");
      return jsonOk({ reset: true });
    }

    const allocations = Array.isArray(body.allocations) ? body.allocations : [];
    if (allocations.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("No hay asignaciones que guardar");
    }

    const att = await client.query<{ overtime: string }>(
      `SELECT overtime FROM attendance_entries
        WHERE technician_id = $1 AND date = $2
        LIMIT 1`,
      [body.technician_id, body.date]
    );
    const overtime = att.rows.length > 0 ? Number(att.rows[0].overtime) : 0;

    for (const a of allocations) {
      if (!a.activity_id || !parseId(a.activity_id)) {
        await client.query("ROLLBACK");
        return jsonError("activity_id inválido");
      }
      const percent = Number(a.percent);
      if (isNaN(percent) || percent < 0 || percent > 100) {
        await client.query("ROLLBACK");
        return jsonError("percent debe estar entre 0 y 100");
      }
      const activity = await client.query(`SELECT id FROM activities WHERE id = $1`, [a.activity_id]);
      if (activity.rows.length === 0) {
        await client.query("ROLLBACK");
        return jsonError("actividad no encontrada", 404);
      }
      await client.query(
        `INSERT INTO overtime_allocations (technician_id, date, activity_id, percent, hours)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (technician_id, date, activity_id)
         DO UPDATE SET percent = EXCLUDED.percent, hours = EXCLUDED.hours, updated_at = now()`,
        [body.technician_id, body.date, a.activity_id, percent, round2((overtime * percent) / 100)]
      );
    }

    await client.query("COMMIT");
    return jsonOk({ saved: allocations.length });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudieron guardar las asignaciones", 500, String(err));
  } finally {
    client.release();
  }
}
