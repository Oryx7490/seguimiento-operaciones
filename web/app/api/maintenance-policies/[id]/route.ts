import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const POLICY_TYPES = new Set(["content_changes", "corrective_preventive"]);
const STATUSES = new Set(["active", "paused", "ended"]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }

  const sets: string[] = [];
  const vals: unknown[] = [id];
  const push = (col: string, value: unknown) => {
    vals.push(value);
    sets.push(`${col} = $${vals.length}`);
  };

  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return jsonError("El nombre es obligatorio");
    push("name", name);
  }
  if (body.policy_type !== undefined) {
    if (!POLICY_TYPES.has(String(body.policy_type))) return jsonError("policy_type inválido");
    push("policy_type", String(body.policy_type));
  }
  if (body.status !== undefined) {
    if (!STATUSES.has(String(body.status))) return jsonError("status inválido");
    push("status", String(body.status));
  }
  if (body.description !== undefined) push("description", body.description ? String(body.description).trim() : null);
  if (body.notes !== undefined) push("notes", body.notes ? String(body.notes).trim() : null);
  if (body.start_date !== undefined) {
    if (body.start_date && !DATE_RE.test(String(body.start_date))) return jsonError("start_date inválido");
    push("start_date", body.start_date || null);
  }
  if (body.end_date !== undefined) {
    if (body.end_date && !DATE_RE.test(String(body.end_date))) return jsonError("end_date inválido");
    push("end_date", body.end_date || null);
  }
  if (body.location_id !== undefined) {
    const loc = body.location_id ? parseId(String(body.location_id)) : null;
    if (body.location_id && !loc) return jsonError("location_id inválido");
    push("location_id", loc);
  }

  if (sets.length === 0) return jsonError("Nada que actualizar");
  sets.push("updated_at = now()");

  try {
    const { rows } = await pool.query(
      `UPDATE maintenance_policies SET ${sets.join(", ")} WHERE id = $1
        RETURNING id, client_id, name, policy_type, status`,
      vals
    );
    if (rows.length === 0) return jsonError("Póliza no encontrada", 404);
    return jsonOk({ policy: rows[0] });
  } catch (err) {
    return jsonError("No se pudo actualizar la póliza", 500, String(err));
  }
}
