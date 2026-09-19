import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

function ids(params: { id: string; contactId: string }): boolean {
  return Boolean(parseId(params.id) && parseId(params.contactId));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const p = await params;
  if (!ids(p)) return jsonError("id inválido");

  let body: { name?: string; position?: string | null; email?: string | null; phone?: string | null; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const sets: string[] = [];
  const values: unknown[] = [p.contactId, p.id];
  const push = (col: string, val: unknown) => {
    sets.push(`${col} = $${values.length + 1}`);
    values.push(val);
  };
  if (typeof body.name === "string" && body.name.trim()) push("name", body.name.trim());
  if (body.position !== undefined) push("position", body.position?.trim() || null);
  if (body.email !== undefined) push("email", body.email?.trim() || null);
  if (body.phone !== undefined) push("phone", body.phone?.trim() || null);
  if (typeof body.active === "boolean") push("active", body.active);
  if (sets.length === 0) return jsonError("No hay campos para actualizar");

  try {
    const { rows } = await pool.query(
      `UPDATE client_contacts SET ${sets.join(", ")}
        WHERE id = $1 AND client_id = $2
       RETURNING id, client_id, name, position, email, phone, active, created_at, updated_at`,
      values
    );
    if (rows.length === 0) return jsonError("contacto no encontrado", 404);
    return jsonOk({ contact: rows[0] });
  } catch (err) {
    return jsonError("No se pudo actualizar el contacto", 500, String(err));
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const p = await params;
  if (!ids(p)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `DELETE FROM client_contacts WHERE id = $1 AND client_id = $2 RETURNING id`,
      [p.contactId, p.id]
    );
    if (rows.length === 0) return jsonError("contacto no encontrado", 404);
    return jsonOk({ deleted: rows[0].id });
  } catch (err) {
    return jsonError("No se pudo eliminar el contacto", 500, String(err));
  }
}
