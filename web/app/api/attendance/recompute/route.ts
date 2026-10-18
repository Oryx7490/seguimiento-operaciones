import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";
import { asNumber, getSettings } from "@/app/lib/notifications";
import { recomputeDay, recomputeOvertime } from "@/app/lib/attendance";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Recalcula las horas de `attendance_entries` a partir de los `attendance_segments`
 * (por si se aprobaron entradas/salidas en momentos distintos, incluidas jornadas
 * que cruzan medianoche). Recomputa horas extra.
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
      const agg = await recomputeDay(client, d.technician_id, d.date, false);
      if (agg) updated++;
    }

    const settings = await getSettings();
    const dailyStd = asNumber(settings.overtime_daily_hours, 9);
    const weeklyStd = asNumber(settings.overtime_weekly_hours, 45);
    if (from && to) {
      await recomputeOvertime(client, from, to, dailyStd, weeklyStd);
    } else {
      await recomputeOvertime(client, "1970-01-01", "2999-12-31", dailyStd, weeklyStd);
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
