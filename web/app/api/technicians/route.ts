import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("inactive") === "true";
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.display_name, t.phone, t.nss, t.curp, t.address,
              t.emergency_contact_name, t.emergency_contact_phone, t.admin_notes,
              t.active AS technician_active,
              u.id AS user_id, u.email, u.username, u.active AS user_active, u.timezone,
              COALESCE((
                SELECT json_agg(s.name ORDER BY s.name)
                  FROM technician_specialties ts
                  JOIN specialties s ON s.id = ts.specialty_id
                 WHERE ts.technician_id = t.id AND ts.status = 'approved'
              ), '[]'::json) AS specialties,
              (SELECT count(*) FROM technician_specialties ts
                WHERE ts.technician_id = t.id AND ts.status = 'pending')::int AS pending_specialties
       FROM technicians t
       JOIN users u ON u.id = t.user_id
       ${includeInactive ? "" : "WHERE t.active = true"}
       ORDER BY t.display_name`
    );
    return jsonOk({ technicians: rows });
  } catch (err) {
    return jsonError("No se pudieron leer los técnicos", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: {
    display_name?: string;
    phone?: string;
    specialties?: string[];
    specialty_ids?: string[];
    specialty_names?: string[];
    email?: string;
    username?: string;
    name?: string;
    timezone?: string;
    active?: boolean;
    nss?: string;
    curp?: string;
    address?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    admin_notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const displayName = body.display_name?.trim();
  const email = body.email?.trim().toLowerCase() || null;
  const username = body.username?.trim().toLowerCase() || null;

  if (!displayName) return jsonError("display_name es obligatorio");
  if (!email && !username) {
    return jsonError("Indica un correo o un usuario para la cuenta del técnico");
  }
  if (email && !EMAIL_RE.test(email)) return jsonError("email inválido");
  if (username && !USERNAME_RE.test(username)) {
    return jsonError("usuario inválido (3-30 caracteres: letras, números, punto, guion o guion bajo)");
  }

  const specialtyIds = Array.from(
    new Set((body.specialty_ids ?? []).filter((s) => typeof s === "string" && s))
  );
  const specialtyNames = Array.from(
    new Set((body.specialty_names ?? []).map((s) => String(s).trim()).filter(Boolean))
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userRes = await client.query(
      `INSERT INTO users (name, email, username, role, timezone, active)
       VALUES ($1, $2, $3, 'technician', $4, $5)
       RETURNING id`,
      [
        body.name?.trim() || displayName,
        email,
        username,
        body.timezone ?? "America/Mexico_City",
        body.active ?? true,
      ]
    );
    const techRes = await client.query(
      `INSERT INTO technicians (user_id, display_name, phone, nss, curp, address,
                                emergency_contact_name, emergency_contact_phone, admin_notes, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, display_name, phone, nss, curp, address,
                 emergency_contact_name, emergency_contact_phone, admin_notes, active`,
      [
        userRes.rows[0].id,
        displayName,
        body.phone?.trim() || null,
        body.nss?.trim() || null,
        body.curp?.trim().toUpperCase() || null,
        body.address?.trim() || null,
        body.emergency_contact_name?.trim() || null,
        body.emergency_contact_phone?.trim() || null,
        body.admin_notes?.trim() || null,
        body.active ?? true,
      ]
    );
    const technicianId = techRes.rows[0].id;

    for (const specialtyId of specialtyIds) {
      await client.query(
        `INSERT INTO technician_specialties (technician_id, specialty_id, status)
         VALUES ($1, $2, 'approved') ON CONFLICT DO NOTHING`,
        [technicianId, specialtyId]
      );
    }
    for (const name of specialtyNames) {
      const existing = await client.query(
        `SELECT id FROM specialties WHERE lower(name) = lower($1)`,
        [name]
      );
      const spId =
        existing.rows.length > 0
          ? existing.rows[0].id
          : (await client.query(`INSERT INTO specialties (name) VALUES ($1) RETURNING id`, [name]))
              .rows[0].id;
      await client.query(
        `INSERT INTO technician_specialties (technician_id, specialty_id, status)
         VALUES ($1, $2, 'approved') ON CONFLICT DO NOTHING`,
        [technicianId, spId]
      );
    }

    await client.query("COMMIT");
    return jsonOk(
      { technician: { ...techRes.rows[0], user_id: userRes.rows[0].id, email, username } },
      201
    );
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof Error && err.message.includes("duplicate key")) {
      return jsonError("Ya existe un usuario con ese correo o usuario");
    }
    return jsonError("No se pudo crear el técnico", 500, String(err));
  } finally {
    client.release();
  }
}
