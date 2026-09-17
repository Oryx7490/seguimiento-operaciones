import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId } from "@/app/lib/api";
import { asNumber, getSettings } from "@/app/lib/notifications";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

interface MonthRow {
  id: string;
  display_name: string;
  month: number | null;
  full_days: number;
  half_days: number;
  hours: string;
  worked_hours: string;
  planned_hours: string;
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const yearRaw = sp.get("year") ?? String(new Date().getFullYear());
  if (!/^\d{4}$/.test(yearRaw)) return jsonError("year inválido");
  const year = Number(yearRaw);
  const technicianRaw = sp.get("technician_id");
  const technicianId = technicianRaw && parseId(technicianRaw) ? technicianRaw : null;
  if (technicianRaw && !technicianId) return jsonError("technician_id inválido");

  try {
    const settings = await getSettings();
    const threshold = asNumber(settings.half_day_hours, 5);

    const [summary, nwd] = await Promise.all([
      pool.query<MonthRow>(
        `WITH worked AS (
            SELECT te.technician_id, te.date AS day, SUM(te.duration_hours) AS hours
              FROM time_entries te
             WHERE te.date BETWEEN make_date($1, 1, 1) AND make_date($1, 12, 31)
               AND te.duration_hours IS NOT NULL
             GROUP BY te.technician_id, te.date
          ),
          planned AS (
            SELECT at.technician_id, a.date AS day, SUM(a.planned_hours) AS hours
              FROM activities a
              JOIN activity_technicians at ON at.activity_id = a.id
             WHERE a.date BETWEEN make_date($1, 1, 1) AND make_date($1, 12, 31)
               AND a.status <> 'cancelled'
             GROUP BY at.technician_id, a.date
          ),
          daily AS (
            SELECT COALESCE(w.technician_id, p.technician_id) AS technician_id,
                   COALESCE(w.day, p.day) AS day,
                   COALESCE(w.hours, 0) AS worked_hours,
                   COALESCE(p.hours, 0) AS planned_hours
              FROM worked w
              FULL OUTER JOIN planned p
                ON p.technician_id = w.technician_id AND p.day = w.day
          ),
          effective AS (
            SELECT technician_id, day, worked_hours, planned_hours,
                   CASE WHEN worked_hours > 0 THEN worked_hours ELSE planned_hours END AS hours
              FROM daily
          )
          SELECT t.id, t.display_name,
                 EXTRACT(MONTH FROM e.day)::int AS month,
                 COUNT(*) FILTER (WHERE e.hours >= $2)::int AS full_days,
                 COUNT(*) FILTER (WHERE e.hours > 0 AND e.hours < $2)::int AS half_days,
                 COALESCE(SUM(e.hours), 0) AS hours,
                 COALESCE(SUM(e.worked_hours), 0) AS worked_hours,
                 COALESCE(SUM(e.planned_hours), 0) AS planned_hours
            FROM technicians t
            LEFT JOIN effective e ON e.technician_id = t.id
           WHERE t.active = true AND ($3::uuid IS NULL OR t.id = $3::uuid)
           GROUP BY t.id, t.display_name, EXTRACT(MONTH FROM e.day)
           ORDER BY t.display_name, month`,
        [year, threshold, technicianId]
      ),
      pool.query<{ total: number; official: number; discretionary: number }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE kind = 'official')::int AS official,
                COUNT(*) FILTER (WHERE kind = 'discretionary')::int AS discretionary
           FROM non_working_days
          WHERE active = true
            AND day BETWEEN make_date($1, 1, 1) AND make_date($1, 12, 31)`,
        [year]
      ),
    ]);

    const byTech = new Map<
      string,
      {
        id: string;
        display_name: string;
        full_days: number;
        half_days: number;
        total_hours: number;
        worked_hours: number;
        planned_hours: number;
        months: { month: number; full_days: number; half_days: number; hours: number }[];
      }
    >();

    for (const row of summary.rows) {
      let tech = byTech.get(row.id);
      if (!tech) {
        tech = {
          id: row.id,
          display_name: row.display_name,
          full_days: 0,
          half_days: 0,
          total_hours: 0,
          worked_hours: 0,
          planned_hours: 0,
          months: MONTHS.map((month) => ({ month, full_days: 0, half_days: 0, hours: 0 })),
        };
        byTech.set(row.id, tech);
      }
      if (row.month === null) continue;
      tech.full_days += row.full_days;
      tech.half_days += row.half_days;
      tech.total_hours += Number(row.hours);
      tech.worked_hours += Number(row.worked_hours);
      tech.planned_hours += Number(row.planned_hours);
      const m = tech.months[row.month - 1];
      m.full_days = row.full_days;
      m.half_days = row.half_days;
      m.hours = Number(row.hours);
    }

    const technicians = Array.from(byTech.values()).map((t) => ({
      ...t,
      worked_days: t.full_days + t.half_days,
      total_hours: round2(t.total_hours),
      worked_hours: round2(t.worked_hours),
      planned_hours: round2(t.planned_hours),
    }));

    return jsonOk({
      year,
      threshold_hours: threshold,
      non_working_days: nwd.rows[0] ?? { total: 0, official: 0, discretionary: 0 },
      technicians,
    });
  } catch (err) {
    return jsonError("No se pudo calcular el resumen anual", 500, String(err));
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
