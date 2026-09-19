import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const client = await pool.query(
      `SELECT id, name, contact_name, contact_email, contact_phone, active, created_at, updated_at
         FROM clients WHERE id = $1`,
      [id]
    );
    if (client.rows.length === 0) return jsonError("cliente no encontrado", 404);
    const [contacts, comments] = await Promise.all([
      pool.query(
        `SELECT id, client_id, name, position, email, phone, active, created_at, updated_at
           FROM client_contacts WHERE client_id = $1 ORDER BY active DESC, name`,
        [id]
      ),
      pool.query(
        `SELECT cm.id, cm.author_id, cm.body, cm.created_at, cm.updated_at, u.name AS author_name
           FROM comments cm JOIN users u ON u.id = cm.author_id
          WHERE cm.client_id = $1 ORDER BY cm.created_at`,
        [id]
      ),
    ]);
    return jsonOk({ client: client.rows[0], contacts: contacts.rows, comments: comments.rows });
  } catch (err) {
    return jsonError("No se pudo leer el cliente", 500, String(err));
  }
}

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
  const values: unknown[] = [id];
  const push = (col: string, val: unknown) => {
    sets.push(`${col} = $${values.length + 1}`);
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
      values
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