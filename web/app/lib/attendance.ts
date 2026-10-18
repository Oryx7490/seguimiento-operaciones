import type { PoolClient } from "pg";
import { computeOvertime, hoursBetweenDays } from "@/app/lib/overtime";

export interface DayAggregate {
  check_in: string | null;
  check_out: string | null;
  hours: number;
  overnight: boolean;
  exit_offset_days: number;
}

function minutesOf(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m ?? 0);
}

/** Días completos entre dos fechas ISO (YYYY-MM-DD); negativo si `to` es anterior. */
export function daysBetween(fromDate: string, toDate: string): number {
  const a = Date.parse(`${fromDate}T12:00:00Z`);
  const b = Date.parse(`${toDate}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / (24 * 3600 * 1000));
}

/**
 * Recalcula la entrada del día (`attendance_entries`) a partir de sus tramos
 * (`attendance_segments`). Maneja jornadas que cruzan medianoche o duran varios
 * días (salida N días después) y borra la entrada automática si el día quedó sin tramos.
 */
export async function recomputeDay(
  client: PoolClient,
  technicianId: string,
  date: string,
  markManual: boolean
): Promise<DayAggregate | null> {
  const segs = await client.query(
    `SELECT to_char(started_at,'HH24:MI:SS') AS started_at,
            to_char(ended_at,'HH24:MI:SS') AS ended_at,
            hours, exit_offset_days
       FROM attendance_segments WHERE technician_id = $1 AND date = $2`,
    [technicianId, date]
  );

  if (segs.rowCount === 0) {
    await client.query(
      `DELETE FROM attendance_entries
        WHERE technician_id = $1 AND date = $2 AND batch_id IS NULL AND manual = false`,
      [technicianId, date]
    );
    return null;
  }

  const rows = segs.rows as { started_at: string | null; ended_at: string | null; hours: string | null; exit_offset_days: number }[];
  const allStarts = rows.map((r) => r.started_at).filter(Boolean).sort() as string[];
  const allEnds = rows.map((r) => r.ended_at).filter(Boolean).sort() as string[];
  const checkIn = allStarts[0] ?? null;
  const checkOut = allEnds.length > 0 ? allEnds[allEnds.length - 1] : null;

  let hours = 0;
  let offsetDays = 0;
  const openStarts: number[] = [];
  const openEnds: number[] = [];
  for (const r of rows) {
    offsetDays = Math.max(offsetDays, r.exit_offset_days ?? 0);
    const a = minutesOf(r.started_at);
    const b = minutesOf(r.ended_at);
    if (a != null && b != null) {
      hours += r.hours != null ? Number(r.hours) : hoursBetweenDays(r.started_at, r.ended_at, r.exit_offset_days) ?? 0;
    } else if (a != null) openStarts.push(a);
    else if (b != null) openEnds.push(b);
  }
  // Empareja tramos con un solo extremo (entrada y salida aprobadas por separado el mismo día).
  openStarts.sort((x, y) => x - y);
  openEnds.sort((x, y) => x - y);
  const usedEnds = new Set<number>();
  for (const a of openStarts) {
    const idx = openEnds.findIndex((b, i) => !usedEnds.has(i) && b >= a);
    if (idx >= 0) {
      usedEnds.add(idx);
      hours += (openEnds[idx] - a) / 60;
    }
  }
  const overnight = offsetDays >= 1 || Boolean(checkIn && checkOut && checkOut < checkIn);
  const hoursRounded = Math.round(hours * 100) / 100;

  const tech = await client.query(`SELECT display_name FROM technicians WHERE id = $1`, [technicianId]);
  if (tech.rowCount === 0) return null;

  await client.query(
    `INSERT INTO attendance_entries (technician_id, person_name, date, check_in, check_out, hours, overnight, exit_offset_days, manual)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (technician_id, date) DO UPDATE
       SET person_name = EXCLUDED.person_name, check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out,
           hours = EXCLUDED.hours, overnight = EXCLUDED.overnight, exit_offset_days = EXCLUDED.exit_offset_days,
           manual = attendance_entries.manual OR EXCLUDED.manual`,
    [technicianId, tech.rows[0].display_name, date, checkIn, checkOut, hoursRounded, overnight, offsetDays, markManual]
  );

  return { check_in: checkIn, check_out: checkOut, hours: hoursRounded, overnight, exit_offset_days: offsetDays };
}

/** Recalcula las horas extra de las semanas que tocan el rango [from, to]. */
export async function recomputeOvertime(client: PoolClient, from: string, to: string, dailyStd: number, weeklyStd: number) {
  const { rows } = await client.query<{ id: string; technician_id: string; date: string; hours: string | null }>(
    `SELECT id, technician_id, to_char(date, 'YYYY-MM-DD') AS date, hours
       FROM attendance_entries
      WHERE technician_id IS NOT NULL
        AND date >= ($1::date - INTERVAL '7 days')
        AND date <= ($2::date + INTERVAL '7 days')
      ORDER BY technician_id, date`,
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
