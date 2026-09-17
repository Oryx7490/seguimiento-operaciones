import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.display_name, t.phone, t.nss, t.curp, t.address,
              t.emergency_contact_name, t.emergency_contact_phone, t.admin_notes,
              t.active AS technician_active, t.user_id, t.created_at,
              u.name AS user_name, u.email, u.username, u.active AS user_active, u.timezone
         FROM technicians t
         JOIN users u ON u.id = t.user_id
        WHERE t.id = $1`,
      [id]
    );
    if (rows.length === 0) return jsonError("técnico no encontrado", 404);

    const [specialties, documents] = await Promise.all([
      pool.query(
        `SELECT s.id AS specialty_id, s.name, ts.status, ts.requested_at
           FROM technician_specialties ts
           JOIN specialties s ON s.id = ts.specialty_id
          WHERE ts.technician_id = $1
          ORDER BY ts.status DESC, s.name`,
        [id]
      ),
      pool.query(
        `SELECT d.id, d.doc_type, d.file_name, d.mime_type, d.size_bytes, d.notes, d.created_at,
                u.name AS uploaded_by_name
           FROM technician_documents d
           LEFT JOIN users u ON u.id = d.uploaded_by
          WHERE d.technician_id = $1
          ORDER BY d.created_at DESC`,
        [id]
      ),
    ]);

    return jsonOk({
      technician: rows[0],
      specialties: specialties.rows,
      documents: documents.rows,
    });
  } catch (err) {
    return jsonError("No se pudo leer el expediente", 500, String(err));
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: {
    display_name?: string;
    phone?: string;
    email?: string;
    username?: string;
    active?: boolean;
    nss?: string;
    curp?: string;
    address?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    admin_notes?: string;
    specialty_ids?: string[];
    specialty_names?: string[];
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
  if (typeof body.display_name === "string" && body.display_name.trim()) {
    push("display_name", body.display_name.trim());
  }
  if (typeof body.phone === "string") push("phone", body.phone.trim() || null);
  if (typeof body.nss === "string") push("nss", body.nss.trim() || null);
  if (typeof body.curp === "string") push("curp", body.curp.trim().toUpperCase() || null);
  if (typeof body.address === "string") push("address", body.address.trim() || null);
  if (typeof body.emergency_contact_name === "string") {
    push("emergency_contact_name", body.emergency_contact_name.trim() || null);
  }
  if (typeof body.emergency_contact_phone === "string") {
    push("emergency_contact_phone", body.emergency_contact_phone.trim() || null);
  }
  if (typeof body.admin_notes === "string") push("admin_notes", body.admin_notes.trim() || null);
  if (typeof body.active === "boolean") push("active", body.active);

  const syncSpecialties = Array.isArray(body.specialty_ids) || Array.isArray(body.specialty_names);
  const touchesAccount = body.email !== undefined || body.username !== undefined;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let tech: Record<string, unknown> | undefined;

    if (sets.length > 0) {
      const res = await client.query(
        `UPDATE technicians SET ${sets.join(", ")} WHERE id = $1
         RETURNING id, user_id, display_name, phone, nss, curp, address,
                   emergency_contact_name, emergency_contact_phone, admin_notes, active`,
        values
      );
      if (res.rows.length === 0) {
        await client.query("ROLLBACK");
        return jsonError("técnico no encontrado", 404);
      }
      tech = res.rows[0];
    }

    if (touchesAccount || body.active !== undefined || syncSpecialties) {
      if (!tech) {
        const t = await client.query(`SELECT user_id FROM technicians WHERE id = $1`, [id]);
        if (t.rows.length === 0) {
          await client.query("ROLLBACK");
          return jsonError("técnico no encontrado", 404);
        }
        tech = t.rows[0];
      }
      const techUserId = (tech as { user_id: string }).user_id;

      if (touchesAccount) {
        const current = await client.query<{ email: string | null; username: string | null }>(
          `SELECT email, username FROM users WHERE id = $1`,
          [techUserId]
        );
        let email = current.rows[0].email;
        let username = current.rows[0].username;

        if (body.email !== undefined) {
          const value = String(body.email ?? "").trim().toLowerCase();
          if (value && !EMAIL_RE.test(value)) {
            await client.query("ROLLBACK");
            return jsonError("email inválido");
          }
          email = value || null;
        }
        if (body.username !== undefined) {
          const value = String(body.username ?? "").trim().toLowerCase();
          if (value && !USERNAME_RE.test(value)) {
            await client.query("ROLLBACK");
            return jsonError("usuario inválido (3-30 caracteres: letras, números, punto, guion o guion bajo)");
          }
          username = value || null;
        }
        if (!email && !username) {
          await client.query("ROLLBACK");
          return jsonError("La cuenta debe conservar un correo o un usuario");
        }
        await client.query(`UPDATE users SET email = $2, username = $3 WHERE id = $1`, [
          techUserId,
          email,
          username,
        ]);
      }

      if (typeof body.active === "boolean") {
        await client.query(`UPDATE users SET active = $2 WHERE id = $1`, [techUserId, body.active]);
      }

      if (syncSpecialties) {
        const ids = Array.from(
          new Set((body.specialty_ids ?? []).filter((s) => typeof s === "string" && s))
        ) as string[];
        for (const name of Array.from(
          new Set((body.specialty_names ?? []).map((s) => String(s).trim()).filter(Boolean))
        )) {
          const existing = await client.query(
            `SELECT id FROM specialties WHERE lower(name) = lower($1)`,
            [name]
          );
          const spId =
            existing.rows.length > 0
              ? existing.rows[0].id
              : (await client.query(`INSERT INTO specialties (name) VALUES ($1) RETURNING id`, [name]))
                  .rows[0].id;
          const assigned = await client.query(
            `SELECT 1 FROM technician_specialties WHERE technician_id = $1 AND specialty_id = $2`,
            [id, spId]
          );
          if (assigned.rows.length === 0 && !ids.includes(spId)) ids.push(spId);
        }

        await client.query(
          `DELETE FROM technician_specialties
            WHERE technician_id = $1 AND status = 'approved' AND NOT (specialty_id = ANY($2::uuid[]))`,
          [id, ids]
        );
        for (const specialtyId of ids) {
          await client.query(
            `INSERT INTO technician_specialties (technician_id, specialty_id, status)
             VALUES ($1, $2, 'approved')
             ON CONFLICT (technician_id, specialty_id)
             DO UPDATE SET status = 'approved', reviewed_at = now()`,
            [id, specialtyId]
          );
        }
      }
    }

    await client.query("COMMIT");
    return jsonOk({ technician: tech ?? { id } });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof Error && err.message.includes("duplicate key")) {
      return jsonError("Ya existe un usuario con ese correo o usuario");
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
    return jsonError("No se pudo dar de baja al técnico", 500, String(err));
  } finally {
    client.release();
  }
}
