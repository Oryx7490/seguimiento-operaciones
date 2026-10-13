import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";
import { computeWeeklyMetrics } from "@/app/lib/kpi-weekly";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayInCDMX(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
}

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function isoStart(day: string): string {
  return `${day}T00:00:00-06:00`;
}
function isoEnd(day: string): string {
  return `${day}T23:59:59-06:00`;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const fromParam = sp.get("from")?.trim() || null;
  if (fromParam && !DATE_RE.test(fromParam)) return jsonError("from inválido");

  const ref = fromParam ?? todayInCDMX();
  const monday = mondayOf(ref);
  const sunday = new Date(`${monday}T12:00:00Z`);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const weekEnding = sunday.toISOString().slice(0, 10);

  try {
    const [rows, total, kpis] = await Promise.all([
      pool.query(
        `SELECT a.technician_id, t.display_name,
                COALESCE(sum(a.hours),0)::numeric AS hours,
                COALESCE(sum(a.overtime),0)::numeric AS overtime,
                count(*)::int AS entries,
                count(DISTINCT a.date)::int AS days
           FROM attendance_entries a
           JOIN technicians t ON t.id = a.technician_id
          WHERE a.date BETWEEN $1::date AND $2::date
          GROUP BY a.technician_id, t.display_name
          ORDER BY hours DESC`,
        [monday, weekEnding]
      ),
      pool.query(
        `SELECT COALESCE(sum(hours),0)::numeric AS hours,
                COALESCE(sum(overtime),0)::numeric AS overtime,
                count(DISTINCT technician_id)::int AS technicians,
                count(*)::int AS entries
           FROM attendance_entries
          WHERE date BETWEEN $1::date AND $2::date AND technician_id IS NOT NULL`,
        [monday, weekEnding]
      ),
      computeWeeklyMetrics(isoStart(monday), isoEnd(weekEnding), ""),
    ]);

    const kpiMap: Record<string, number> = {};
    for (const k of kpis) kpiMap[k.key] = Number(k.value);

    return jsonOk({
      week: { start: monday, end: weekEnding },
      team: {
        hours: Number(total.rows[0].hours),
        overtime: Number(total.rows[0].overtime),
        technicians: total.rows[0].technicians,
        entries: total.rows[0].entries,
      },
      technicians: rows.rows.map((r: { technician_id: string; display_name: string; hours: string; overtime: string; entries: number; days: number }) => ({
        technician_id: r.technician_id,
        display_name: r.display_name,
        hours: Number(r.hours),
        overtime: Number(r.overtime),
        entries: r.entries,
        days: r.days,
      })),
      kpis: {
        m2_installed: kpiMap.m2_installed ?? 0,
        mp_installed: kpiMap.mp_installed ?? 0,
        screens_installed_count: kpiMap.screens_installed_count ?? 0,
        projects_with_installed_screens: kpiMap.projects_with_installed_screens ?? 0,
        controllers_installed_week: kpiMap.controllers_installed_week ?? 0,
        tickets_closed_week: kpiMap.tickets_closed_week ?? 0,
        activities_completed_week: kpiMap.activities_completed_week ?? 0,
        hours_registered_week: kpiMap.hours_registered_week ?? 0,
      },
    });
  } catch (err) {
    return jsonError("No se pudo generar el resumen del equipo", 500, String(err));
  }
}
