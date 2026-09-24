import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

const OWNERSHIP = ["propio", "cliente", "tercero"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: { name?: string; brand?: string | null; ownership?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const setters: string[] = [];
  const values: unknown[] = [id];
  const push = (col: string, val: unknown) => {
    setters.push(`${col} = $${values.length}`);
    values.push(val);
  };

  if (body.name !== undefined) {
    const name = body.name?.trim();
    if (!name) return jsonError("name no puede quedar vacío");
    push("name", name);
  }
  if (body.brand !== undefined) push("brand", body.brand?.trim() || null);
  if (body.ownership !== undefined) {
    if (!OWNERSHIP.includes(body.ownership)) return jsonError("ownership inválido");
    push("ownership", body.ownership);
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return jsonError("active debe ser boolean");
    push("active", body.active);
  }
  if (setters.length === 0) return jsonError("No hay campos para actualizar");

  try {
    const { rows } = await pool.query(
      `UPDATE controller_catalog SET ${setters.join(", ")}, updated_at = now()
       WHERE id = $1 RETURNING id, name, brand, ownership, active, created_at`,
      values
    );
    if (rows.length === 0) return jsonError("controlador no encontrado", 404);
    return jsonOk({ controller: rows[0] });
  } catch (err) {
    return jsonError("No se pudo actualizar el controlador", 500, String(err));
  }
}

// DELETE → desactivar (borrado lógico). Las referencias existentes se conservan.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `UPDATE controller_catalog SET active = false, updated_at = now()
       WHERE id = $1 RETURNING id`,
      [id]
    );
    if (rows.length === 0) return jsonError("controlador no encontrado", 404);
    return jsonOk({ deleted: rows[0].id });
  } catch (err) {
    return jsonError("No se pudo desactivar el controlador", 500, String(err));
  }
}