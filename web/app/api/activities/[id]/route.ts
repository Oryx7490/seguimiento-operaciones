import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

const ACTIVITY_STATUS = ["planned", "in_progress", "completed", "cancelled"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: {
    status?: string;
    description?: string;
    planned_hours?: number;
    date?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const setters: string[] = [];
  const values: unknown[] = [id];
  const push = (col: string, val: unknown) => {
    setters.push(`${col} = $${values.length + 1}`);
    values.push(val);
  };

  if (body.status !== undefined) {
    if (!ACTIVITY_STATUS.includes(body.status)) return jsonError("status inválido");
    push("status", body.status);
  }
  if (body.description !== undefined) {
    const desc = body.description?.trim();
    if (!desc) return jsonError("description no puede quedar vacío");
    push("description", desc);
  }
  if (body.planned_hours !== undefined) {
    const h = Number(body.planned_hours);
    if (isNaN(h) || h < 0) return jsonError("planned_hours inválido");
    push("planned_hours", h);
  }
  if (body.date !== undefined) {
    if (!DATE_RE.test(body.date)) return jsonError("date inválido (YYYY-MM-DD)");
    push("date", body.date);
  }
  if (setters.length === 0) return jsonError("No hay campos para actualizar");

  try {
    const { rows } = await pool.query(
      `UPDATE activities SET ${setters.join(", ")} WHERE id = $1
       RETURNING id, date::text AS date, description, status, planned_hours`,
      values
    );
    if (rows.length === 0) return jsonError("actividad no encontrada", 404);
    return jsonOk({ activity: rows[0] });
  } catch (err) {
    return jsonError("No se pudo actualizar la actividad", 500, String(err));
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `UPDATE activities SET status = 'cancelled' WHERE id = $1 AND status <> 'cancelled'
       RETURNING id, status`,
      [id]
    );
    if (rows.length === 0) return jsonError("actividad no encontrada", 404);
    return jsonOk({ cancelled: rows[0].id });
  } catch (err) {
    return jsonError("No se pudo cancelar la actividad", 500, String(err));
  }
}