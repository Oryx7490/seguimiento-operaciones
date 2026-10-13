import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";
import { asNumber, getSettings } from "@/app/lib/notifications";
import { computeOvertime, computeSegmentsHours } from "@/app/lib/overtime";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Recalcula las horas de `attendance_entries` a partir de los `attendance_segments`
 * (por si se aprobaron entradas/salidas en momentos distintos). Recomputa horas extra.
 */
export async function POST(request: NextRequest) {
  let body: { from?: string; to?: string };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const from = body.from ?? null;
  const to = body.to ?? null;
  if (from && !DATE_RE.test(from)) return jsonError("from inválido");
  if (to && !DATE_RE.test(to)) return jsonError("to inválido");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const where: string[] = [];
    const vals: unknown[] = [];
    if (from) {
      vals.push(from);
      where.push(`date >= $${vals.length}::date`);
    }
    if (to) {
      vals.push(to);
      where.push(`date <= $${vals.length}::date`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const days = await client.query(
      `SELECT technician_id, to_char(date,'YYYY-MM-DD') AS date
         FROM attendance_segments ${whereSql}
        GROUP BY technician_id, date`,
      vals
    );

    let updated = 0;
    for (const d of days.rows as { technician_id: string; date: string }[]) {
      const segs = await client.query(
        `SELECT to_char(started_at,'HH24:MI:SS') AS started_at, to_char(ended_at,'HH24:MI:SS') AS ended_at
           FROM attendance_segments WHERE technician_id = $1 AND date = $2`,
        [d.technician_id, d.date]
      );
      const starts = segs.rows.map((r: { started_at: string | null }) => r.started_at).filter(Boolean).sort();
      const ends = segs.rows.map((r: { ended_at: string | null }) => r.ended_at).filter(Boolean).sort();
      const hours = computeSegmentsHours(segs.rows);
      const checkIn = starts.length > 0 ? starts[0] : null;
      const checkOut = ends.length > 0 ? ends[ends.length - 1] : null;

      const tech = await client.query(`SELECT display_name FROM technicians WHERE id = $1`, [d.technician_id]);
      if (tech.rowCount === 0) continue;

      await client.query(
        `INSERT INTO attendance_entries (technician_id, person_name, date, check_in, check_out, hours)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (technician_id, date) DO UPDATE
           SET check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out, hours = EXCLUDED.hours`,
        [d.technician_id, tech.rows[0].display_name, d.date, checkIn, checkOut, hours]
      );
      updated++;
    }

    const settings = await getSettings();
    const dailyStd = asNumber(settings.overtime_daily_hours, 8);
    const weeklyStd = asNumber(settings.overtime_weekly_hours, 40);

    // Recomputa horas extra de las semanas afectadas.
    if (days.rows.length > 0) {
      const allEntries = await client.query<{ id: string; technician_id: string; date: string; hours: string | null }>(
        `SELECT id, technician_id, to_char(date,'YYYY-MM-DD') AS date, hours FROM attendance_entries WHERE technician_id IS NOT NULL`
      );
      const byTech = new Map<string, { ids: string[]; entries: { date: string; hours: number | null }[] }>();
      for (const r of allEntries.rows) {
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

    await client.query("COMMIT");
    return jsonOk({ days: updated });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudieron recalcular las horas", 500, String(err));
  } finally {
    client.release();
  }
}
