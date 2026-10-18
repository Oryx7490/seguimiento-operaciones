import { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";
import { asNumber, getSettings } from "@/app/lib/notifications";
import { computeOvertime, hoursBetweenDays, parseTime } from "@/app/lib/overtime";
import { recomputeDay } from "@/app/lib/attendance";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function recomputeOvertime(client: PoolClient, from: string, to: string, dailyStd: number, weeklyStd: number) {
  const { rows } = await client.query<{ id: string; technician_id: string; date: string; hours: string | null }>(
    `SELECT id, technician_id, to_char(date, 'YYYY-MM-DD') AS date, hours
       FROM attendance_entries
      WHERE technician_id IS NOT NULL AND date >= ($1::date - INTERVAL '7 days') AND date <= ($2::date + INTERVAL '7 days')`,
    [from, to]
  );
  const byTech = new Map<string, { ids: string[]; entries: { date: string; hours: number | null }[] }>();
  for (const r of rows) {
    const list = byTech.get(r.technician_id) ?? { ids: [], entries: [] };
    list.ids.push(r.id);
    list.entries.push({ date: r.date, hours: r.hours === null ? null : Number(r.hours) });
    byTech.set(r.technician_id, list);
  }
  for (const { ids, entries } of byTech.values()) {
    const ot = computeOvertime(entries, dailyStd, weeklyStd);
    for (let i = 0; i < ids.length; i++) {
      await client.query(`UPDATE attendance_entries SET overtime = $2 WHERE id = $1`, [ids[i], ot.get(entries[i].date) ?? 0]);
    }
  }
}

/** Coloca o ajusta manualmente la entrada/salida de un técnico en un día. */
export async function PATCH(request: NextRequest) {
  let body: { technician_id?: string; date?: string; check_in?: string | null; check_out?: string | null; exit_offset_days?: number | string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }

  const technicianId = body.technician_id ? parseId(body.technician_id) : null;
  if (!technicianId) return jsonError("technician_id inválido");
  const date = body.date ?? "";
  if (!DATE_RE.test(date)) return jsonError("date inválida (YYYY-MM-DD)");

  const checkIn = parseTime(body.check_in ?? null);
  const checkOut = parseTime(body.check_out ?? null);
  if (body.check_in && !checkIn) return jsonError("check_in inválido (HH:MM)");
  if (body.check_out && !checkOut) return jsonError("check_out inválido (HH:MM)");
  if (!checkIn && !checkOut) return jsonError("Indica al menos entrada o salida");

  const offsetDays = body.exit_offset_days !== undefined ? Math.max(0, Math.trunc(Number(body.exit_offset_days) || 0)) : 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tech = await client.query(`SELECT display_name FROM technicians WHERE id = $1`, [technicianId]);
    if (tech.rowCount === 0) {
      await client.query("ROLLBACK");
      return jsonError("Técnico no encontrado", 404);
    }

    const segmentRes = await client.query(
      `SELECT id, to_char(started_at,'HH24:MI:SS') AS started_at,
              to_char(ended_at,'HH24:MI:SS') AS ended_at, exit_offset_days
         FROM attendance_segments
        WHERE technician_id = $1 AND date = $2
        ORDER BY started_at ASC NULLS LAST, ended_at ASC NULLS LAST, created_at
        FOR UPDATE`,
      [technicianId, date]
    );

    if (segmentRes.rowCount === 0) {
      await client.query(
        `INSERT INTO attendance_segments
           (technician_id, date, started_at, ended_at, hours, overnight, exit_offset_days, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual')`,
        [
          technicianId,
          date,
          checkIn,
          checkOut,
          hoursBetweenDays(checkIn, checkOut, offsetDays),
          offsetDays >= 1 || Boolean(checkIn && checkOut && checkOut < checkIn),
          checkOut ? offsetDays : 0,
        ]
      );
    } else {
      type Segment = { id: string; started_at: string | null; ended_at: string | null; exit_offset_days: number };
      const segments = segmentRes.rows as Segment[];
      const starts = segments.filter((segment) => segment.started_at).sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''));
      const ends = segments.filter((segment) => segment.ended_at).sort((a, b) =>
        a.exit_offset_days - b.exit_offset_days || (a.ended_at ?? '').localeCompare(b.ended_at ?? '')
      );
      const startTarget = starts[0] ?? segments[0];
      const byStart = [...segments].sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''));
      const latestSegment = byStart[byStart.length - 1];
      const endTarget = ends[ends.length - 1] ?? (checkOut ? latestSegment : startTarget);
      const changed: Record<string, Segment> = {};
      const mutable = (segment: Segment) => changed[segment.id] ?? (changed[segment.id] = { ...segment });
      mutable(startTarget).started_at = checkIn;
      const endUpdate = mutable(endTarget);
      endUpdate.ended_at = checkOut;
      endUpdate.exit_offset_days = checkOut ? offsetDays : 0;

      for (const segment of Object.values(changed)) {
        const segmentOffset = segment.exit_offset_days;
        const overnight = segmentOffset >= 1 || Boolean(segment.started_at && segment.ended_at && segment.ended_at < segment.started_at);
        await client.query(
          `UPDATE attendance_segments
              SET started_at = $2, ended_at = $3, hours = $4, overnight = $5, exit_offset_days = $6
            WHERE id = $1`,
          [segment.id, segment.started_at, segment.ended_at, hoursBetweenDays(segment.started_at, segment.ended_at, segmentOffset), overnight, segmentOffset]
        );
      }
    }

    await recomputeDay(client, technicianId, date, true);

    const settings = await getSettings();
    await recomputeOvertime(client, date, date, asNumber(settings.overtime_daily_hours, 9), asNumber(settings.overtime_weekly_hours, 45));

    const updated = await client.query(
      `SELECT to_char(date,'YYYY-MM-DD') AS date, to_char(check_in,'HH24:MI') AS check_in,
              to_char(check_out,'HH24:MI') AS check_out, hours, overtime, manual, overnight, exit_offset_days
         FROM attendance_entries WHERE technician_id = $1 AND date = $2`,
      [technicianId, date]
    );

    await client.query("COMMIT");
    return jsonOk({ entry: updated.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo guardar el registro manual", 500, String(err));
  } finally {
    client.release();
  }
}
