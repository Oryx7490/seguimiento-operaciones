import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: { name?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const sets: string[] = [];
  const values: unknown[] = [id];
  if (typeof body.name === "string" && body.name.trim()) {
    values.push(body.name.trim());
    sets.push(`name = $${values.length}`);
  }
  if (typeof body.active === "boolean") {
    values.push(body.active);
    sets.push(`active = $${values.length}`);
  }
  if (sets.length === 0) return jsonError("No hay campos para actualizar");

  try {
    const { rows } = await pool.query(
      `UPDATE specialties SET ${sets.join(", ")} WHERE id = $1 RETURNING id, name, active`,
      values
    );
    if (rows.length === 0) return jsonError("especialidad no encontrada", 404);
    return jsonOk({ specialty: rows[0] });
  } catch (err) {
    if (err instanceof Error && err.message.includes("duplicate key")) {
      return jsonError("Ya existe una especialidad con ese nombre", 409);
    }
    return jsonError("No se pudo actualizar la especialidad", 500, String(err));
  }
}
