import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SCALES = new Set(["week", "month", "year"]);

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function periodRange(scale: string, date: string): { from: string; to: string; label: string } {
  const d = new Date(`${date}T12:00:00Z`);
  if (scale === "week") {
    const dow = (d.getUTCDay() + 6) % 7;
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() - dow);
    const sun = new Date(mon);
    sun.setUTCDate(mon.getUTCDate() + 6);
    return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10), label: `${mon.toISOString().slice(0, 10)} – ${sun.toISOString().slice(0, 10)}` };
  }
  if (scale === "month") {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const first = `${y}-${pad(m + 1)}-01`;
    const last = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", month: "long", year: "numeric" }).format(d);
    return { from: first, to: last, label };
  }
  const y = d.getUTCFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
}

/** Horas hombre asignadas en jornadas completas por cliente, proyecto y ticket. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const scale = sp.get("scale")?.trim() || "month";
  const date = sp.get("date")?.trim() || null;
  if (!SCALES.has(scale)) return jsonError("scale inválida");
  if (!date || !DATE_RE.test(date)) return jsonError("date inválida");

  const { from, to, label } = periodRange(scale, date);

  try {
    const base = `
      WITH alloc AS (
        SELECT ata.activity_id, ata.hours
          FROM activity_time_allocations ata
          JOIN attendance_entries ae ON ae.technician_id = ata.technician_id AND ae.date = ata.date
          JOIN activities ac ON ac.id=ata.activity_id AND ac.status IN ('in_progress','completed')
         WHERE ata.date BETWEEN $1::date AND $2::date
           AND ae.check_in IS NOT NULL AND ae.check_out IS NOT NULL AND COALESCE(ae.hours,0)>0
      )`;

    const [totals, byProject, byTicket, byClient, byPolicy] = await Promise.all([
      pool.query(`${base} SELECT COALESCE(sum(hours),0)::numeric AS total, count(*)::int AS allocations FROM alloc`, [from, to]),
      pool.query(
        `${base}
         SELECT p.id, p.code, p.name, c.name AS client_name, COALESCE(sum(a.hours),0)::numeric AS hours
           FROM alloc a
           JOIN activity_projects ap ON ap.activity_id = a.activity_id
           JOIN projects p ON p.id = ap.project_id
           LEFT JOIN clients c ON c.id = p.client_id
          GROUP BY p.id, p.code, p.name, c.name
          HAVING COALESCE(sum(a.hours),0) > 0
          ORDER BY hours DESC`,
        [from, to]
      ),
      pool.query(
        `${base}
         SELECT t.id, t.code, t.title, c.name AS client_name, COALESCE(sum(a.hours),0)::numeric AS hours
           FROM alloc a
           JOIN activities ac ON ac.id = a.activity_id
           JOIN tickets t ON t.id = ac.ticket_id
           LEFT JOIN clients c ON c.id = t.client_id
          GROUP BY t.id, t.code, t.title, c.name
          HAVING COALESCE(sum(a.hours),0) > 0
          ORDER BY hours DESC`,
        [from, to]
      ),
      pool.query(
        `${base}
         SELECT c.id, c.name, COALESCE(sum(a.hours),0)::numeric AS hours
           FROM alloc a
           JOIN activities ac ON ac.id = a.activity_id
           LEFT JOIN activity_projects ap ON ap.activity_id = a.activity_id
           LEFT JOIN projects p ON p.id = ap.project_id
           LEFT JOIN tickets t ON t.id = ac.ticket_id
           LEFT JOIN maintenance_policies mp ON mp.id = ac.maintenance_policy_id
           JOIN clients c ON c.id = COALESCE(p.client_id, t.client_id, mp.client_id)
          GROUP BY c.id, c.name
          HAVING COALESCE(sum(a.hours),0) > 0
          ORDER BY hours DESC`,
        [from, to]
      ),
      pool.query(
        `${base}
         SELECT mp.id, mp.name, mp.policy_type, c.name AS client_name, COALESCE(sum(a.hours),0)::numeric AS hours
           FROM alloc a
           JOIN activities ac ON ac.id = a.activity_id
           JOIN maintenance_policies mp ON mp.id = ac.maintenance_policy_id
           LEFT JOIN clients c ON c.id = mp.client_id
          GROUP BY mp.id, mp.name, mp.policy_type, c.name
          HAVING COALESCE(sum(a.hours),0) > 0
          ORDER BY hours DESC`,
        [from, to]
      ),
    ]);

    const total = Number(totals.rows[0]?.total ?? 0);
    const pct = (h: string | number) => (total > 0 ? Math.round((Number(h) / total) * 1000) / 10 : 0);

    return jsonOk({
      scale,
      period: { from, to, label },
      total_hours: total,
      allocations: totals.rows[0]?.allocations ?? 0,
      by_project: byProject.rows.map((r: { id: string; code: string; name: string; client_name: string | null; hours: string }) => ({
        project_id: r.id, code: r.code, name: r.name, client_name: r.client_name, hours: Number(r.hours), percent: pct(r.hours),
      })),
      by_ticket: byTicket.rows.map((r: { id: string; code: string; title: string; client_name: string | null; hours: string }) => ({
        ticket_id: r.id, code: r.code, title: r.title, client_name: r.client_name, hours: Number(r.hours), percent: pct(r.hours),
      })),
      by_client: byClient.rows.map((r: { id: string; name: string; hours: string }) => ({
        client_id: r.id, name: r.name, hours: Number(r.hours), percent: pct(r.hours),
      })),
      by_policy: byPolicy.rows.map((r: { id: string; name: string; policy_type: string; client_name: string | null; hours: string }) => ({
        policy_id: r.id, name: r.name, policy_type: r.policy_type, client_name: r.client_name, hours: Number(r.hours), percent: pct(r.hours),
      })),
    });
  } catch (err) {
    return jsonError("No se pudieron leer las horas hombre", 500, String(err));
  }
}
