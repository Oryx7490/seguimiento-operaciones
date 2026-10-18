import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GRANULARITIES = new Set(["day", "week", "month", "year"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  const sp = request.nextUrl.searchParams;
  const granularity = sp.get("granularity")?.trim() || "day";
  const from = sp.get("from")?.trim() || null;
  const to = sp.get("to")?.trim() || null;
  if (!GRANULARITIES.has(granularity)) return jsonError("granularity inválida (day, week, month, year)");
  if (from && !DATE_RE.test(from)) return jsonError("from inválido");
  if (to && !DATE_RE.test(to)) return jsonError("to inválido");

  const where: string[] = ["a.technician_id = $1"];
  const vals: unknown[] = [id];
  if (from) {
    vals.push(from);
    where.push(`a.date >= $${vals.length}::date`);
  }
  if (to) {
    vals.push(to);
    where.push(`a.date <= $${vals.length}::date`);
  }
  vals.push(granularity);

  try {
    const tech = await pool.query(`SELECT id, display_name FROM technicians WHERE id = $1`, [id]);
    if (tech.rowCount === 0) return jsonError("Técnico no encontrado", 404);

    const { rows } = await pool.query(
      `SELECT to_char(date_trunc($${vals.length}, a.date), 'YYYY-MM-DD') AS period,
              count(*)::int AS entries,
              COALESCE(sum(a.hours), 0)::numeric AS hours,
              COALESCE(sum(a.overtime), 0)::numeric AS overtime,
              to_char(min(a.check_in), 'HH24:MI') AS check_in,
              to_char(max(a.check_out), 'HH24:MI') AS check_out,
              bool_or(a.check_in IS NULL) AS missing_in,
              bool_or(a.check_out IS NULL) AS missing_out,
              bool_or(a.overnight) AS overnight,
              COALESCE(max(a.exit_offset_days), 0) AS exit_offset_days
         FROM attendance_entries a
        WHERE ${where.join(" AND ")}
        GROUP BY 1
        ORDER BY 1 DESC`,
      vals
    );

    const periods = rows.map((r) => ({
      period: r.period as string,
      entries: r.entries as number,
      hours: Number(r.hours),
      overtime: Number(r.overtime),
      check_in: r.check_in as string | null,
      check_out: r.check_out as string | null,
      missing_in: r.missing_in as boolean,
      missing_out: r.missing_out as boolean,
      overnight: r.overnight as boolean,
      exit_offset_days: Number(r.exit_offset_days ?? 0),
    }));

    const totals = periods.reduce(
      (acc, p) => ({
        hours: acc.hours + p.hours,
        overtime: acc.overtime + p.overtime,
        entries: acc.entries + p.entries,
      }),
      { hours: 0, overtime: 0, entries: 0 }
    );

    // Segmentos (dobles/triples turnos) para el detalle del día.
    const segments = await pool.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date,
              to_char(started_at, 'HH24:MI') AS started_at,
              to_char(ended_at, 'HH24:MI') AS ended_at,
              hours, source
         FROM attendance_segments
        WHERE technician_id = $1 ${from ? `AND date >= $${2}::date` : ""} ${to ? `AND date <= $${from ? 3 : 2}::date` : ""}
        ORDER BY date DESC, started_at NULLS FIRST`,
      [id, ...(from ? [from] : []), ...(to ? [to] : [])]
    );

    return jsonOk({
      technician: { id: tech.rows[0].id, display_name: tech.rows[0].display_name },
      granularity,
      periods,
      totals: { hours: Number(totals.hours.toFixed(2)), overtime: Number(totals.overtime.toFixed(2)), entries: totals.entries },
      segments: segments.rows,
    });
  } catch (err) {
    return jsonError("No se pudieron leer las horas del técnico", 500, String(err));
  }
}
