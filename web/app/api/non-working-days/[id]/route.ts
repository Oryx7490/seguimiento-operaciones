import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId, uniqueViolation } from "@/app/lib/api";

const KINDS = ["official", "discretionary"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: { day?: string; name?: string; kind?: string; notes?: string | null; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const sets: string[] = [];
  const values: unknown[] = [id];
  const push = (col: string, value: unknown) => {
    values.push(value);
    sets.push(`${col} = $${values.length}`);
  };

  if (body.day !== undefined) {
    const day = String(body.day).trim();
    if (!DATE_RE.test(day)) return jsonError("Fecha inválida (formato AAAA-MM-DD)");
    push("day", day);
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return jsonError("El nombre es obligatorio");
    push("name", name);
  }
  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind)) return jsonError("Tipo inválido");
    push("kind", body.kind);
  }
  if (body.notes !== undefined) push("notes", body.notes ? String(body.notes).trim() : null);
  if (body.active !== undefined) push("active", Boolean(body.active));

  if (sets.length === 0) return jsonError("Nada que actualizar");

  try {
    const { rows } = await pool.query(
      `UPDATE non_working_days
          SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $1
        RETURNING id, to_char(day, 'YYYY-MM-DD') AS day, name, kind, active, notes, created_at, updated_at`,
      values
    );
    if (rows.length === 0) return jsonError("Día no encontrado", 404);
    return jsonOk({ day: rows[0] });
  } catch (err) {
    if (uniqueViolation(err)) return jsonError("Ya existe un día no laborable con esa fecha");
    return jsonError("No se pudo actualizar el día no laborable", 500, String(err));
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(`DELETE FROM non_working_days WHERE id = $1 RETURNING id`, [id]);
    if (rows.length === 0) return jsonError("Día no encontrado", 404);
    return jsonOk({ removed: rows[0].id });
  } catch (err) {
    return jsonError("No se pudo eliminar el día no laborable", 500, String(err));
  }
}
