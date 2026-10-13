import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";
import { computeWeeklyMetrics } from "@/app/lib/kpi-weekly";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { rows: p } = await pool.query(
      `SELECT id, starts_at, ends_at, status FROM weekly_kpi_periods WHERE id = $1`,
      [id]
    );
    if (p.length === 0) return jsonError("Periodo no encontrado", 404);
    const period = p[0];
    const metrics = await computeWeeklyMetrics(period.starts_at.toISOString(), period.ends_at.toISOString(), id);
    const { rows: snap } = await pool.query(
      `SELECT key, value, unit, meta FROM weekly_kpi_metrics WHERE period_id = $1 ORDER BY key`,
      [id]
    );
    return jsonOk({ period: { ...period, snapshot: snap }, metrics });
  } catch (err) {
    return jsonError("No se pudieron calcular métricas", 500, String(err));
  }
}
