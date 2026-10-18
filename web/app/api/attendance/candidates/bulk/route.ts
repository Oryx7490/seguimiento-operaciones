import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId, getCurrentUserId } from "@/app/lib/api";

export const runtime = "nodejs";

/** Rechaza en grupo varios candidatos pendientes. */
export async function POST(request: NextRequest) {
  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0) return jsonError("ids debe ser una lista no vacía");

  const ids: string[] = [];
  for (const v of body.ids) {
    if (typeof v !== "string" || !parseId(v)) return jsonError("id inválido en ids");
    ids.push(v);
  }
  if (new Set(ids).size !== ids.length) return jsonError("ids tiene duplicados");

  try {
    const reviewer = await getCurrentUserId();
    const { rowCount } = await pool.query(
      `UPDATE attendance_candidates
          SET status = 'rejected', reviewed_by = $2, reviewed_at = now()
        WHERE id = ANY($1::uuid[]) AND status = 'pending'`,
      [ids, reviewer]
    );
    return jsonOk({ rejected: rowCount ?? 0 });
  } catch (err) {
    return jsonError("No se pudieron rechazar los candidatos", 500, String(err));
  }
}
