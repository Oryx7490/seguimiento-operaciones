import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk } from "@/app/lib/api";
import { round2 } from "@/app/lib/overtime";

const SCALES = new Set(["week", "month", "year"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface EffortRow {
  day: string;
  planned: string;
  n_projects: number;
  ticket_id: string | null;
  ticket_code: string | null;
  ticket_title: string | null;
  ticket_type: string | null;
  ticket_client_id: string | null;
  ticket_client_name: string | null;
  internal_activity_type_id: string | null;
  internal_name: string | null;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  project_client_id: string | null;
  project_client_name: string | null;
}

interface BucketInfo {
  key: string;
  label: string;
  start: string;
  end: string;
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const scale = sp.get("scale") ?? "month";
  if (!SCALES.has(scale)) return jsonError("scale inválido (semana/mes/año)");
  const dateRaw = sp.get("date") ?? new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(dateRaw)) return jsonError("date inválido");

  const range = computeRange(scale, dateRaw);
  const buckets = computeBuckets(scale, range.start, range.end);

  try {
    const res = await pool.query<EffortRow>(
      `WITH act AS (
         SELECT a.id, a.date, a.planned_hours,
                (SELECT count(*)::int FROM activity_projects ap WHERE ap.activity_id = a.id) AS n_projects,
                a.ticket_id, a.internal_activity_type_id
           FROM activities a
          WHERE a.status <> 'cancelled'
            AND (a.date BETWEEN $1 AND $2 OR (a.end_date IS NOT NULL AND a.date <= $2 AND a.end_date >= $1))
       ),
       acts_proj AS (
         SELECT ap.activity_id,
                p.id AS project_id, p.code AS project_code, p.name AS project_name,
                p.client_id AS project_client_id, c.name AS project_client_name
           FROM activity_projects ap
           JOIN projects p ON p.id = ap.project_id
           LEFT JOIN clients c ON c.id = p.client_id
       )
       SELECT to_char(act.date, 'YYYY-MM-DD') AS day,
              act.planned_hours AS planned, act.n_projects, act.ticket_id, act.internal_activity_type_id,
              t.code AS ticket_code, t.title AS ticket_title, t.ticket_type AS ticket_type,
              t.client_id AS ticket_client_id, tc.name AS ticket_client_name,
              ia.name AS internal_name,
              ap.project_id, ap.project_code, ap.project_name,
              ap.project_client_id, ap.project_client_name
         FROM act
         LEFT JOIN tickets t ON t.id = act.ticket_id
         LEFT JOIN clients tc ON tc.id = t.client_id
         LEFT JOIN internal_activity_types ia ON ia.id = act.internal_activity_type_id
         LEFT JOIN acts_proj ap ON ap.activity_id = act.id`,
      [range.start, range.end]
    );

    const rows = res.rows;

    const byClient = new Map<string, { id: string | null; name: string; hours: number; projects: Set<string>; tickets: Set<string> }>();
    const byProject = new Map<string, { id: string; code: string; name: string; client_name: string | null; hours: number }>();
    const byTicket = new Map<string, { id: string; code: string; title: string; client_name: string | null; type: string | null; hours: number }>();
    const byBucket = new Map<string, number>();
    const addBucket = (key: string, h: number) => byBucket.set(key, (byBucket.get(key) ?? 0) + h);

    const client = (id: string | null, name: string) => {
      const key = id ?? "__internas__";
      const existing = byClient.get(key);
      if (existing) return existing;
      const item = { id, name, hours: 0, projects: new Set<string>(), tickets: new Set<string>() };
      byClient.set(key, item);
      return item;
    };

    for (const r of rows) {
      const share = r.n_projects > 0 ? Number(r.planned) / r.n_projects : Number(r.planned);

      if (r.ticket_id) {
        const t = byTicket.get(r.ticket_id) ?? {
          id: r.ticket_id,
          code: r.ticket_code ?? "",
          title: r.ticket_title ?? "",
          client_name: r.ticket_client_name,
          type: r.ticket_type,
          hours: 0,
        };
        t.hours += share;
        byTicket.set(r.ticket_id, t);
        const c = client(r.ticket_client_id, r.ticket_client_name ?? "Internas");
        c.hours += share;
        c.tickets.add(r.ticket_id);
      } else if (r.internal_activity_type_id) {
        const c = client(null, "Internas");
        c.hours += share;
      } else if (r.project_id) {
        const p = byProject.get(r.project_id) ?? {
          id: r.project_id,
          code: r.project_code ?? "",
          name: r.project_name ?? "",
          client_name: r.project_client_name,
          hours: 0,
        };
        p.hours += share;
        byProject.set(r.project_id, p);
        const c = client(r.project_client_id, r.project_client_name ?? "Sin cliente");
        c.hours += share;
        c.projects.add(r.project_id);
      }
      addBucket(bucketKey(buckets, r.day), share);
    }

    const total = rows.reduce((acc, r) => acc + (r.n_projects > 0 ? Number(r.planned) / r.n_projects : Number(r.planned)), 0);

    const sortDesc = <T>(arr: T[], pick: (x: T) => number) => arr.sort((a, b) => pick(b) - pick(a));

    const clients = sortDesc(Array.from(byClient.values()), (x) => x.hours).map((x) => ({
      client_id: x.id,
      name: x.name,
      hours: round2(x.hours),
      percent: total > 0 ? round2((x.hours / total) * 100) : 0,
      projects: x.projects.size,
      tickets: x.tickets.size,
    }));

    const projects = sortDesc(Array.from(byProject.values()), (x) => x.hours).map((x) => ({
      project_id: x.id,
      code: x.code,
      name: x.name,
      client_name: x.client_name,
      hours: round2(x.hours),
      percent: total > 0 ? round2((x.hours / total) * 100) : 0,
    }));

    const tickets = sortDesc(Array.from(byTicket.values()), (x) => x.hours).map((x) => ({
      ticket_id: x.id,
      code: x.code,
      title: x.title,
      client_name: x.client_name,
      type: x.type,
      hours: round2(x.hours),
      percent: total > 0 ? round2((x.hours / total) * 100) : 0,
    }));

    const series = buckets.map((b) => ({
      key: b.key,
      label: b.label,
      hours: round2(byBucket.get(b.key) ?? 0),
      percent: total > 0 ? round2(((byBucket.get(b.key) ?? 0) / total) * 100) : 0,
    }));

    return jsonOk({
      scale,
      start: range.start,
      end: range.end,
      label: range.label,
      total_hours: round2(total),
      buckets: series,
      by_client: clients,
      by_project: projects,
      by_ticket: tickets,
    });
  } catch (err) {
    return jsonError("No se pudo calcular el resumen de esfuerzo", 500, String(err));
  }
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseDate(s: string): Date {
  return new Date(`${s}T12:00:00`);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function computeRange(scale: string, dateStr: string): { start: string; end: string; label: string } {
  const d = parseDate(dateStr);
  if (scale === "week") {
    const dow = (d.getDay() + 6) % 7;
    const monday = addDays(d, -dow);
    const sunday = addDays(monday, 6);
    return {
      start: iso(monday),
      end: iso(sunday),
      label: `Semana del ${iso(monday)} al ${iso(sunday)}`,
    };
  }
  if (scale === "year") {
    return { start: `${d.getFullYear()}-01-01`, end: `${d.getFullYear()}-12-31`, label: String(d.getFullYear()) };
  }
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
}

function computeBuckets(scale: string, startStr: string, endStr: string): BucketInfo[] {
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  const buckets: BucketInfo[] = [];
  if (scale === "week") {
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      buckets.push({ key: iso(d), label: `${WEEKDAYS[d.getDay()]} ${d.getDate()}`, start: iso(d), end: iso(d) });
    }
    return buckets;
  }
  if (scale === "month") {
    let cursor = new Date(start);
    let week = 1;
    while (cursor <= end) {
      const wEnd = end < addDays(cursor, 6) ? end : addDays(cursor, 6);
      buckets.push({ key: `w${week}`, label: `Sem ${week}`, start: iso(cursor), end: iso(wEnd) });
      cursor = addDays(cursor, 7);
      week += 1;
    }
    return buckets;
  }
  for (let mIdx = 0; mIdx < 12; mIdx += 1) {
    const y = start.getFullYear();
    const last = new Date(y, mIdx + 1, 0).getDate();
    const mStart = `${y}-${String(mIdx + 1).padStart(2, "0")}-01`;
    const mEnd = `${y}-${String(mIdx + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    buckets.push({ key: `m${mIdx + 1}`, label: MONTHS[mIdx], start: mStart, end: mEnd });
  }
  return buckets;
}

function bucketKey(buckets: BucketInfo[], day: string): string {
  for (const b of buckets) {
    if (day >= b.start && day <= b.end) return b.key;
  }
  return "rest";
}