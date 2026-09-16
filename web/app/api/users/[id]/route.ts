import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

const ROLES = ["technician", "coordinator", "admin"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: {
    name?: string;
    email?: string;
    role?: string;
    timezone?: string;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown) => {
    fields.push(col);
    values.push(val);
  };

  if (typeof body.name === "string" && body.name.trim()) push("name", body.name.trim());
  if (typeof body.email === "string" && body.email.trim()) push("email", body.email.trim().toLowerCase());
  if (typeof body.role === "string") {
    if (!ROLES.includes(body.role)) return jsonError("rol inválido");
    push("role", body.role);
  }
  if (typeof body.timezone === "string") push("timezone", body.timezone);
  if (typeof body.active === "boolean") push("active", body.active);

  if (fields.length === 0) return jsonOk({ user: null });

  try {
    const { rows } = await pool.query(
      `UPDATE users SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(", ")}
       WHERE id = $1 RETURNING id, name, email, role, timezone, active, created_at`,
      [id, ...values]
    );
    if (rows.length === 0) return jsonError("usuario no encontrado", 404);
    return jsonOk({ user: rows[0] });
  } catch (err) {
    if (err instanceof Error && err.message.includes("duplicate key")) {
      return jsonError("Ya existe un usuario con ese email");
    }
    return jsonError("No se pudo actualizar el usuario", 500, String(err));
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  try {
    const { rows } = await pool.query(
      `UPDATE users SET active = false WHERE id = $1 RETURNING id`,
      [id]
    );
    if (rows.length === 0) return jsonError("usuario no encontrado", 404);
    return jsonOk({ deleted: rows[0].id });
  } catch (err) {
    return jsonError("No se pudo desactivar el usuario", 500, String(err));
  }
}