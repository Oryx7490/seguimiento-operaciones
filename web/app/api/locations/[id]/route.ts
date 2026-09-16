import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: {
    client_id?: string;
    name?: string;
    address?: string;
    city?: string;
    site_contact?: string;
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
  if (typeof body.client_id === "string") push("client_id", body.client_id || null);
  if (typeof body.name === "string" && body.name.trim()) push("name", body.name.trim());
  if (typeof body.address === "string") push("address", body.address.trim() || null);
  if (typeof body.city === "string") push("city", body.city.trim() || null);
  if (typeof body.site_contact === "string") push("site_contact", body.site_contact.trim() || null);
  if (typeof body.active === "boolean") push("active", body.active);

  if (sets.length === 0) return jsonOk({ location: null });

  try {
    const { rows } = await pool.query(
      `UPDATE locations SET ${sets.join(", ")} WHERE id = $1
       RETURNING id, client_id, name, address, city, site_contact, active`,
      [id, ...values]
    );
    if (rows.length === 0) return jsonError("ubicación no encontrada", 404);
    return jsonOk({ location: rows[0] });
  } catch (err) {
    return jsonError("No se pudo actualizar la ubicación", 500, String(err));
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `UPDATE locations SET active = false WHERE id = $1 RETURNING id`,
      [id]
    );
    if (rows.length === 0) return jsonError("ubicación no encontrada", 404);
    return jsonOk({ deleted: rows[0].id });
  } catch (err) {
    return jsonError("No se pudo dar de baja la ubicación", 500, String(err));
  }
}