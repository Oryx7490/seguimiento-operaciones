import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: {
    display_name?: string;
    phone?: string;
    specialties?: string[];
    email?: string;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const sets: string[] = [];
  const values: unknown[] = [id];
  const push = (sql: string, val: unknown) => {
    sets.push(sql);
    values.push(val);
  };
  if (typeof body.display_name === "string" && body.display_name.trim()) {
    push(`display_name = $${values.length + 1}`, body.display_name.trim());
  }
  if (typeof body.phone === "string") push(`phone = $${values.length + 1}`, body.phone.trim() || null);
  if (Array.isArray(body.specialties)) {
    push(`specialties = $${values.length + 1}`, body.specialties.map((s) => String(s).trim()).filter(Boolean));
  }
  if (typeof body.active === "boolean") push(`active = $${values.length + 1}`, body.active);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let tech: Record<string, unknown> | undefined;

    if (sets.length > 0) {
      const res = await client.query(
        `UPDATE technicians SET ${sets.join(", ")} WHERE id = $1 RETURNING id, user_id, display_name, phone, specialties, active`,
        values
      );
      if (res.rows.length === 0) {
        await client.query("ROLLBACK");
        return jsonError("técnico no encontrado", 404);
      }
      tech = res.rows[0];
    }

    if (typeof body.email === "string" && body.email.trim()) {
      if (!tech) {
        const t = await client.query(`SELECT user_id FROM technicians WHERE id = $1`, [id]);
        if (t.rows.length === 0) {
          await client.query("ROLLBACK");
          return jsonError("técnico no encontrado", 404);
        }
        tech = t.rows[0];
      }
      const email = body.email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        await client.query("ROLLBACK");
        return jsonError("email inválido");
      }
      const techUserId = (tech as { user_id: string }).user_id;
      await client.query(`UPDATE users SET email = $2 WHERE id = $1`, [techUserId, email]);
    }

    if (typeof body.active === "boolean" && tech) {
      await client.query(`UPDATE users SET active = $2 WHERE id = $1`, [tech.user_id, body.active]);
    }

    await client.query("COMMIT");
    return jsonOk({ technician: tech ?? { id } });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof Error && err.message.includes("duplicate key")) {
      return jsonError("Ya existe un técnico o usuario con ese email");
    }
    return jsonError("No se pudo actualizar el técnico", 500, String(err));
  } finally {
    client.release();
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE technicians SET active = false WHERE id = $1 AND active = true RETURNING user_id`,
      [id]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("técnico no encontrado", 404);
    }
    await client.query(`UPDATE users SET active = false WHERE id = $1`, [rows[0].user_id]);
    await client.query("COMMIT");
    return jsonOk({ deleted: id });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo dar de baja el técnico", 500, String(err));
  } finally {
    client.release();
  }
}