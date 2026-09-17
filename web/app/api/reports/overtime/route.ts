import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId } from "@/app/lib/api";
import { asNumber, getSettings } from "@/app/lib/notifications";
import { computeOvertime, round2 } from "@/app/lib/overtime";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface AttendanceRow {
  technician_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  hours: string | null;
}

interface ActivityRow {
  technician_id: string;
  date: string;
  activity_id: string;
  description: string | null;
  planned_hours: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
}

interface AllocationRow {
  technician_id: string;
  date: string;
  activity_id: string;
  percent: string;
}

interface ProjectInfo {
  id: string;
  code: string;
  name: string;
}

interface ActivityInfo {
  activity_id: string;
  description: string | null;
  planned_hours: number;
  projects: ProjectInfo[];
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const technicianRaw = sp.get("technician_id");
  if (!from || !DATE_RE.test(from)) return jsonError("from inválido");
  if (!to || !DATE_RE.test(to)) return jsonError("to inválido");
  const technicianId = technicianRaw && parseId(technicianRaw) ? technicianRaw : null;
  if (technicianRaw && !technicianId) return jsonError("technician_id inválido");

  try {
    const settings = await getSettings();
    const dailyStd = asNumber(settings.overtime_daily_hours, 8);
    const weeklyStd = asNumber(settings.overtime_weekly_hours, 40);

    const techFilter = technicianId ? `AND t.id = $3` : "";
    const params: unknown[] = [from, to];
    if (technicianId) params.push(technicianId);

    const [attRes, actRes, allocRes, techRes] = await Promise.all([
      pool.query<AttendanceRow>(
        `SELECT a.technician_id, to_char(a.date, 'YYYY-MM-DD') AS date,
                to_char(a.check_in, 'HH24:MI') AS check_in, to_char(a.check_out, 'HH24:MI') AS check_out,
                a.hours
           FROM attendance_entries a
           JOIN technicians t ON t.id = a.technician_id
          WHERE a.technician_id IS NOT NULL
            AND a.date BETWEEN $1 AND $2 ${techFilter}
          ORDER BY a.date`,
        params
      ),
      pool.query<ActivityRow>(
        `SELECT at.technician_id, to_char(a.date, 'YYYY-MM-DD') AS date, a.id AS activity_id,
                a.description, a.planned_hours,
                p.id AS project_id, p.code AS project_code, p.name AS project_name
           FROM activities a
           JOIN activity_technicians at ON at.activity_id = a.id
           JOIN technicians t ON t.id = at.technician_id
           LEFT JOIN activity_projects ap ON ap.activity_id = a.id
           LEFT JOIN projects p ON p.id = ap.project_id
          WHERE a.date BETWEEN $1 AND $2 ${techFilter}
            AND a.status <> 'cancelled'
          ORDER BY a.date`,
        params
      ),
      pool.query<AllocationRow>(
        `SELECT technician_id, to_char(date, 'YYYY-MM-DD') AS date, activity_id, percent
           FROM overtime_allocations
          WHERE date BETWEEN $1 AND $2 ${technicianId ? "AND technician_id = $3" : ""}`,
        params
      ),
      pool.query<{ id: string; display_name: string }>(
        `SELECT id, display_name FROM technicians WHERE active = true ORDER BY display_name`
      ),
    ]);

    const attByTech = new Map<string, AttendanceRow[]>();
    for (const r of attRes.rows) {
      const list = attByTech.get(r.technician_id) ?? [];
      list.push(r);
      attByTech.set(r.technician_id, list);
    }

    const actsByTechDate = new Map<string, Map<string, Map<string, ActivityInfo>>>();
    for (const r of actRes.rows) {
      const byDate = actsByTechDate.get(r.technician_id) ?? new Map<string, Map<string, ActivityInfo>>();
      const byAct = byDate.get(r.date) ?? new Map<string, ActivityInfo>();
      const existing = byAct.get(r.activity_id) ?? {
        activity_id: r.activity_id,
        description: r.description,
        planned_hours: Number(r.planned_hours),
        projects: [],
      };
      if (r.project_id && !existing.projects.some((p) => p.id === r.project_id)) {
        existing.projects.push({ id: r.project_id, code: r.project_code ?? "", name: r.project_name ?? "" });
      }
      byAct.set(r.activity_id, existing);
      byDate.set(r.date, byAct);
      actsByTechDate.set(r.technician_id, byDate);
    }

    const allocMap = new Map<string, number>();
    for (const r of allocRes.rows) {
      allocMap.set(`${r.technician_id}|${r.date}|${r.activity_id}`, Number(r.percent));
    }

    const projectAgg = new Map<
      string,
      { project_id: string; code: string; name: string; allocated: number; personDays: Set<string>; planned: number }
    >();

    const technicianIds = new Set<string>([...attByTech.keys(), ...actsByTechDate.keys()]);
    const technicians = [];

    for (const techId of technicianIds) {
      const tech = techRes.rows.find((t) => t.id === techId);
      const att = (attByTech.get(techId) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
      const otMap = computeOvertime(
        att.map((a) => ({ date: a.date, hours: a.hours === null ? null : Number(a.hours) })),
        dailyStd,
        weeklyStd
      );

      const dates = new Set<string>([...att.map((a) => a.date), ...(actsByTechDate.get(techId)?.keys() ?? [])]);
      const days = [];
      let totalHours = 0;
      let totalOvertime = 0;
      let totalAllocated = 0;
      let personDays = 0;

      for (const date of [...dates].sort()) {
        const attRow = att.find((a) => a.date === date);
        const hours = attRow?.hours === null || attRow?.hours === undefined ? 0 : Number(attRow.hours);
        const overtime = otMap.get(date) ?? 0;
        const actMap = actsByTechDate.get(techId)?.get(date);
        const activities = actMap ? [...actMap.values()] : [];
        const sumPlanned = activities.reduce((acc, a) => acc + a.planned_hours, 0);

        if (hours > 0) personDays++;

        const dayActivities = activities.map((a) => {
          const key = `${techId}|${date}|${a.activity_id}`;
          const hasOverride = allocMap.has(key);
          const percent = hasOverride
            ? allocMap.get(key)!
            : sumPlanned > 0
              ? round2((a.planned_hours / sumPlanned) * 100)
              : 0;
          const allocated = round2((overtime * percent) / 100);
          return {
            activity_id: a.activity_id,
            description: a.description,
            planned_hours: a.planned_hours,
            projects: a.projects,
            percent,
            overridden: hasOverride,
            allocated_hours: allocated,
          };
        });

        const dayAllocated = round2(dayActivities.reduce((acc, a) => acc + a.allocated_hours, 0));
        totalHours += hours;
        totalOvertime += overtime;
        totalAllocated += dayAllocated;

        for (const a of dayActivities) {
          if (a.allocated_hours <= 0) continue;
          for (const p of a.projects) {
            const agg = projectAgg.get(p.id) ?? {
              project_id: p.id,
              code: p.code,
              name: p.name,
              allocated: 0,
              personDays: new Set<string>(),
              planned: 0,
            };
            const share = a.projects.length > 0 ? a.allocated_hours / a.projects.length : 0;
            agg.allocated = round2(agg.allocated + share);
            agg.personDays.add(`${techId}|${date}`);
            agg.planned = round2(agg.planned + a.planned_hours / a.projects.length);
            projectAgg.set(p.id, agg);
          }
        }

        days.push({
          date,
          check_in: attRow?.check_in ?? null,
          check_out: attRow?.check_out ?? null,
          hours,
          overtime,
          activities: dayActivities,
          allocated_hours: dayAllocated,
          unallocated_hours: round2(overtime - dayAllocated),
        });
      }

      technicians.push({
        id: techId,
        display_name: tech?.display_name ?? "—",
        person_days: personDays,
        total_hours: round2(totalHours),
        total_overtime: round2(totalOvertime),
        total_allocated: round2(totalAllocated),
        total_unallocated: round2(totalOvertime - totalAllocated),
        days,
      });
    }

    const projects = [...projectAgg.values()]
      .map((p) => ({
        project_id: p.project_id,
        code: p.code,
        name: p.name,
        planned_hours: p.planned,
        allocated_overtime: p.allocated,
        person_days: p.personDays.size,
      }))
      .sort((a, b) => b.allocated_overtime - a.allocated_overtime);

    return jsonOk({
      from,
      to,
      settings: { daily_hours: dailyStd, weekly_hours: weeklyStd },
      technicians: technicians.sort((a, b) => a.display_name.localeCompare(b.display_name)),
      projects,
    });
  } catch (err) {
    return jsonError("No se pudo calcular la conciliación de horas extra", 500, String(err));
  }
}

