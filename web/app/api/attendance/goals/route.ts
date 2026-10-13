import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";
import { GOAL_METRICS as METRICS } from "@/app/lib/goals";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const techParam = sp.get("technician_id")?.trim() || null;
  if (techParam && !parseId(techParam)) return jsonError("technician_id inválido");

  try {
    const where: string[] = ["active = true"];
    const vals: unknown[] = [];
    if (techParam) {
      vals.push(techParam);
      where.push(`(technician_id = $${vals.length}::uuid OR technician_id IS NULL)`);
    }
    const { rows } = await pool.query(
      `SELECT id, technician_id, metric, target, direction FROM attendance_goals
        WHERE ${where.join(" AND ")}
        ORDER BY technician_id NULLS FIRST, metric`,
      vals
    );
    return jsonOk({
      metrics: METRICS,
      goals: rows.map((r) => ({ ...r, target: Number(r.target) })),
    });
  } catch (err) {
    return jsonError("No se pudieron leer las metas", 500, String(err));
  }
}

export async function PUT(request: NextRequest) {
  let body: { technician_id?: string | null; metric?: string; target?: number | string; direction?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }

  const metric = String(body.metric ?? "");
  const meta = METRICS[metric];
  if (!meta) return jsonError("metric inválida");

  const target = Number(body.target);
  if (!Number.isFinite(target) || target < 0) return jsonError("target inválido");

  let technicianId: string | null = null;
  if (body.technician_id) {
    technicianId = parseId(body.technician_id);
    if (!technicianId) return jsonError("technician_id inválido");
  }
  const direction = meta.direction; // la dirección la define la métrica

  try {
    const { rows } = await pool.query(
      `INSERT INTO attendance_goals (technician_id, metric, target, direction, active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (scope_key, metric) DO UPDATE
         SET target = EXCLUDED.target, direction = EXCLUDED.direction, active = true, updated_at = now()
       RETURNING id, technician_id, metric, target, direction`,
      [technicianId, metric, target, direction]
    );
    return jsonOk({ goal: { ...rows[0], target: Number(rows[0].target) } });
  } catch (err) {
    return jsonError("No se pudo guardar la meta", 500, String(err));
  }
}

export async function DELETE(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const id = sp.get("id")?.trim() || null;
  if (id) {
    if (!parseId(id)) return jsonError("id inválido");
    await pool.query(`DELETE FROM attendance_goals WHERE id = $1`, [id]);
    return jsonOk({ deleted: id });
  }
  const metric = sp.get("metric")?.trim() || null;
  const techParam = sp.get("technician_id")?.trim() || null;
  if (!metric) return jsonError("Falta id o metric");
  if (techParam && !parseId(techParam)) return jsonError("technician_id inválido");
  await pool.query(
    `DELETE FROM attendance_goals WHERE metric = $1 AND (${techParam ? "technician_id = $2::uuid" : "technician_id IS NULL"})`,
    techParam ? [metric, techParam] : [metric]
  );
  return jsonOk({ deleted: metric });
}
