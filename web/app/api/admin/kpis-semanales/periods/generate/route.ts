import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";
import { computeWeeklyMetrics, saveSnapshot } from "@/app/lib/kpi-weekly";

function getIsoWeekRange(year: number, weekNum: number) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayJan4 = jan4.getUTCDay() || 7;
  const firstThu = new Date(jan4);
  firstThu.setUTCDate(jan4.getUTCDate() + (4 - dayJan4));
  const monday = new Date(firstThu);
  monday.setUTCDate(firstThu.getUTCDate() + (weekNum - 1) * 7 - 3);
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  const wYear = sunday.getUTCFullYear();
  const weStr = `${wYear}-${String(sunday.getUTCMonth() + 1).padStart(2, "0")}-${String(sunday.getUTCDate()).padStart(2, "0")}`;
  return { monday, sunday, wYear, weStr };
}

export async function POST(req: NextRequest) {
  let body: { weeks?: number[]; year?: number; autoClose?: boolean } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {}
  const weeks = body.weeks || [];
  const year = body.year || new Date().getUTCFullYear();
  const autoClose = body.autoClose ?? true;
  if (weeks.length === 0) return jsonError("Proporciona weeks: [39,40,...]");

  const results = [];
  for (const wn of weeks) {
    const r = getIsoWeekRange(year, wn);
    const { rows: p } = await pool.query(
      `INSERT INTO weekly_kpi_periods (year, week_number, week_ending, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (year, week_number) DO UPDATE SET updated_at = now()
       RETURNING id, year, week_number, week_ending, starts_at, ends_at, status`,
      [r.wYear, wn, r.weStr, r.monday, r.sunday]
    );
    const pid = p[0].id;
    const metrics = await computeWeeklyMetrics(r.monday.toISOString(), r.sunday.toISOString(), pid);
    await saveSnapshot(pid, metrics as any);
    if (autoClose && p[0].status !== "closed") {
      await pool.query(
        `UPDATE weekly_kpi_periods SET status='closed', closed_at=now(), updated_at=now() WHERE id=$1`,
        [pid]
      );
    }
    results.push({ week: wn, year: r.wYear, periodId: pid, saved: metrics.length, status: "closed" });
  }
  return jsonOk({ results });
}
