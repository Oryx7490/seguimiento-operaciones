import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

// Perfil autogestionable: el técnico sólo puede ver y editar sus datos de contacto
// y sus habilidades. NSS, CURP, notas y documentos quedan en el expediente del admin.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.display_name, t.phone, t.address,
              t.emergency_contact_name, t.emergency_contact_phone,
              u.email, u.username, u.timezone
         FROM technicians t
         JOIN users u ON u.id = t.user_id
        WHERE t.id = $1`,
      [id]
    );
    if (rows.length === 0) return jsonError("técnico no encontrado", 404);

    const specialties = await pool.query(
      `SELECT s.id AS specialty_id, s.name, ts.status
         FROM technician_specialties ts
         JOIN specialties s ON s.id = ts.specialty_id
        WHERE ts.technician_id = $1
        ORDER BY s.name`,
      [id]
    );
    return jsonOk({ profile: rows[0], specialties: specialties.rows });
  } catch (err) {
    return jsonError("No se pudo leer el perfil", 500, String(err));
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: {
    phone?: string;
    address?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const sets: string[] = [];
  const values: unknown[] = [id];
  const push = (col: string, val: unknown) => {
    values.push(val);
    sets.push(`${col} = $${values.length}`);
  };
  if (typeof body.phone === "string") push("phone", body.phone.trim() || null);
  if (typeof body.address === "string") push("address", body.address.trim() || null);
  if (typeof body.emergency_contact_name === "string") {
    push("emergency_contact_name", body.emergency_contact_name.trim() || null);
  }
  if (typeof body.emergency_contact_phone === "string") {
    push("emergency_contact_phone", body.emergency_contact_phone.trim() || null);
  }
  if (sets.length === 0) return jsonError("No hay campos para actualizar");

  try {
    const { rows } = await pool.query(
      `UPDATE technicians SET ${sets.join(", ")} WHERE id = $1
       RETURNING id, display_name, phone, address, emergency_contact_name, emergency_contact_phone`,
      values
    );
    if (rows.length === 0) return jsonError("técnico no encontrado", 404);
    return jsonOk({ profile: rows[0] });
  } catch (err) {
    return jsonError("No se pudo actualizar el perfil", 500, String(err));
  }
}
