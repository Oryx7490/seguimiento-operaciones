import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, getCurrentUser } from "@/app/lib/api";
import { computeWeeklyMetrics, saveSnapshot } from "@/app/lib/kpi-weekly";

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  try {
    const { rows: p } = await pool.query(
      `SELECT id, starts_at, ends_at, status FROM weekly_kpi_periods WHERE id = $1`,
      [id]
    );
    if (p.length === 0) return jsonError("Periodo no encontrado", 404);
    const period = p[0];
    const metrics = await computeWeeklyMetrics(period.starts_at.toISOString(), period.ends_at.toISOString(), id);
    await saveSnapshot(id, metrics as any);
    const { rows } = await pool.query(
      `UPDATE weekly_kpi_periods
          SET status = 'closed', closed_at = now(), closed_by_id = $2, closed_by_name = $3, updated_at = now()
        WHERE id = $1
        RETURNING id, status, closed_at, closed_by_name`,
      [id, user?.id || null, user?.name || null]
    );
    return jsonOk({ period: rows[0], saved: metrics.length });
  } catch (err) {
    return jsonError("No se pudo cerrar periodo", 500, String(err));
  }
}
