import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";
import { asNumber, getSettings } from "@/app/lib/notifications";
import { hoursBetweenDays, parseTime } from "@/app/lib/overtime";
import { recomputeDay, recomputeOvertime } from "@/app/lib/attendance";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toHms(t: string | null): string | null {
  return t ? (t.length === 5 ? `${t}:00` : t.slice(0, 8)) : null;
}

/** Edita fecha/horas/técnico de un candidato ya registrado y recalcula el día. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: { technician_id?: string; event_date?: string; shift_in?: string | null; shift_out?: string | null; exit_offset_days?: number | string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const candRes = await client.query(
      `SELECT technician_id, segment_id, to_char(event_date,'YYYY-MM-DD') AS event_date,
              to_char(shift_in,'HH24:MI:SS') AS shift_in, to_char(shift_out,'HH24:MI:SS') AS shift_out
         FROM attendance_candidates WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (candRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return jsonError("Candidato no encontrado", 404);
    }
    const cand = candRes.rows[0];

    const segRes = cand.segment_id
      ? await client.query(
          `SELECT id, technician_id, to_char(date,'YYYY-MM-DD') AS date, exit_offset_days,
                  to_char(started_at,'HH24:MI:SS') AS started_at, to_char(ended_at,'HH24:MI:SS') AS ended_at
             FROM attendance_segments WHERE id = $1`,
          [cand.segment_id]
        )
      : await client.query(
          `SELECT id, technician_id, to_char(date,'YYYY-MM-DD') AS date, exit_offset_days,
                  to_char(started_at,'HH24:MI:SS') AS started_at, to_char(ended_at,'HH24:MI:SS') AS ended_at
             FROM attendance_segments WHERE candidate_id = $1 ORDER BY created_at LIMIT 1`,
          [id]
        );
    const seg = segRes.rows[0] ?? null;

    const oldTech: string | null = seg?.technician_id ?? cand.technician_id;
    const oldDate: string | null = seg?.date ?? cand.event_date;

    const newTech = body.technician_id ? parseId(body.technician_id) : oldTech;
    if (!newTech) {
      await client.query("ROLLBACK");
      return jsonError("Falta el técnico");
    }
    const newDate = body.event_date ?? oldDate;
    if (!newDate || !DATE_RE.test(newDate)) {
      await client.query("ROLLBACK");
      return jsonError("Fecha inválida");
    }

    const newStart = body.shift_in !== undefined ? parseTime(body.shift_in ?? null) : toHms(seg?.started_at ?? cand.shift_in);
    const newEnd = body.shift_out !== undefined ? parseTime(body.shift_out ?? null) : toHms(seg?.ended_at ?? cand.shift_out);
    if (!newStart && !newEnd) {
      await client.query("ROLLBACK");
      return jsonError("Indica al menos entrada o salida");
    }
    const offsetDays = body.exit_offset_days !== undefined ? Math.max(0, Math.trunc(Number(body.exit_offset_days) || 0)) : Number(seg?.exit_offset_days ?? 0);
    const hours = hoursBetweenDays(newStart, newEnd, offsetDays);
    const overnight = offsetDays >= 1 || Boolean(newStart && newEnd && newEnd < newStart);

    let segmentId: string;
    if (seg) {
      await client.query(
        `UPDATE attendance_segments SET technician_id = $2, date = $3, started_at = $4, ended_at = $5, hours = $6, overnight = $7, exit_offset_days = $8 WHERE id = $1`,
        [seg.id, newTech, newDate, newStart, newEnd, hours, overnight, offsetDays]
      );
      segmentId = seg.id;
    } else {
      const ins = await client.query(
        `INSERT INTO attendance_segments (technician_id, date, started_at, ended_at, hours, overnight, exit_offset_days, source, candidate_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8) RETURNING id`,
        [newTech, newDate, newStart, newEnd, hours, overnight, offsetDays, id]
      );
      segmentId = ins.rows[0].id;
    }

    await client.query(
      `UPDATE attendance_candidates SET technician_id = $2, event_date = $3, shift_in = $4, shift_out = $5, segment_id = $6 WHERE id = $1`,
      [id, newTech, newDate, newStart, newEnd, segmentId]
    );

    // Recalcula el día anterior y el nuevo.
    if (oldTech && oldDate) await recomputeDay(client, oldTech, oldDate, false);
    await recomputeDay(client, newTech, newDate, true);

    const settings = await getSettings();
    await recomputeOvertime(client, newDate, newDate, asNumber(settings.overtime_daily_hours, 8), asNumber(settings.overtime_weekly_hours, 40));

    await client.query("COMMIT");
    return jsonOk({ id, technician_id: newTech, event_date: newDate, shift_in: newStart, shift_out: newEnd });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo editar el registro", 500, String(err));
  } finally {
    client.release();
  }
}
