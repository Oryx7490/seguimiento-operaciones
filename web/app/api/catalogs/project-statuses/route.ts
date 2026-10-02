import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

const PROJECT_STATUSES = [
  "new",
  "planning",
  "waiting_authorization",
  "waiting_materials",
  "assembly",
  "ready_install",
  "installation",
  "pending_docs",
  "closed",
  "cancelled",
];

const COLOR_RE = /^#[0-9a-f]{6}$/i;

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT status, label, color, sort_order, updated_at
         FROM project_status_settings
        ORDER BY sort_order, status`
    );
    return jsonOk({ project_statuses: rows });
  } catch (err) {
    return jsonError("No se pudieron leer los estados de proyecto", 500, String(err));
  }
}

export async function PATCH(req: NextRequest) {
  let body: { status?: string; label?: string; color?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  if (!body.status || !PROJECT_STATUSES.includes(body.status)) return jsonError("status inválido");
  const label = body.label?.trim();
  if (!label) return jsonError("label es obligatorio");
  const color = body.color?.trim().toUpperCase();
  if (!color || !COLOR_RE.test(color)) return jsonError("color debe tener formato #RRGGBB");

  try {
    const { rows } = await pool.query(
      `UPDATE project_status_settings
          SET label = $2, color = $3, updated_at = now()
        WHERE status = $1
        RETURNING status, label, color, sort_order, updated_at`,
      [body.status, label, color]
    );
    if (rows.length === 0) return jsonError("estado no encontrado", 404);
    return jsonOk({ project_status: rows[0] });
  } catch (err) {
    return jsonError("No se pudo actualizar el estado", 500, String(err));
  }
}
