import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";
import { getWeekEnding } from "@/app/lib/kpi-weekly";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, year, week_number, week_ending, starts_at, ends_at, status, closed_at, closed_by_id, closed_by_name, notes, created_at
         FROM weekly_kpi_periods
        ORDER BY week_ending DESC`
    );
    return jsonOk({ periods: rows });
  } catch (err) {
    return jsonError("No se pudieron leer periodos", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: { date?: string } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {}

  try {
    const ref = body.date ? new Date(body.date) : new Date();
    const w = getWeekEnding(ref);
    const { rows } = await pool.query(
      `INSERT INTO weekly_kpi_periods (year, week_number, week_ending, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (year, week_number) DO UPDATE SET updated_at = now()
       RETURNING id, year, week_number, week_ending, starts_at, ends_at, status`,
      [w.year, w.weekNumber, w.weekEnding, w.startsAt, w.endsAt]
    );
    return jsonOk({ period: rows[0] });
  } catch (err) {
    return jsonError("No se pudo crear periodo", 500, String(err));
  }
}
