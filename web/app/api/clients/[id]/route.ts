import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: {
    name?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown) => {
    sets.push(`${col} = $2`);
    values.push(val);
  };
  if (typeof body.name === "string" && body.name.trim()) push("name", body.name.trim());
  if (typeof body.contact_name === "string") push("contact_name", body.contact_name.trim() || null);
  if (typeof body.contact_email === "string") push("contact_email", body.contact_email.trim() || null);
  if (typeof body.contact_phone === "string") push("contact_phone", body.contact_phone.trim() || null);
  if (typeof body.active === "boolean") push("active", body.active);

  if (sets.length === 0) return jsonOk({ client: null });

  try {
    const { rows } = await pool.query(
      `UPDATE clients SET ${sets.join(", ")} WHERE id = $1
       RETURNING id, name, contact_name, contact_email, contact_phone, active`,
      [id, ...values]
    );
    if (rows.length === 0) return jsonError("cliente no encontrado", 404);
    return jsonOk({ client: rows[0] });
  } catch (err) {
    return jsonError("No se pudo actualizar el cliente", 500, String(err));
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `UPDATE clients SET active = false WHERE id = $1 RETURNING id`,
      [id]
    );
    if (rows.length === 0) return jsonError("cliente no encontrado", 404);
    return jsonOk({ deleted: rows[0].id });
  } catch (err) {
    return jsonError("No se pudo dar de baja el cliente", 500, String(err));
  }
}