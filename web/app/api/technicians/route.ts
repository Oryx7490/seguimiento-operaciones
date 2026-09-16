import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("inactive") === "true";
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.display_name, t.phone, t.specialties, t.active AS technician_active,
              u.id AS user_id, u.email, u.active AS user_active, u.timezone
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
    email?: string;
    name?: string;
    timezone?: string;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const displayName = body.display_name?.trim();
  const email = body.email?.trim().toLowerCase();

  if (!displayName) return jsonError("display_name es obligatorio");
  if (!email) return jsonError("email es obligatorio (cuenta de acceso del técnico)");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return jsonError("email inválido");

  const specialties = Array.isArray(body.specialties)
    ? body.specialties.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userRes = await client.query(
      `INSERT INTO users (name, email, role, timezone, active)
       VALUES ($1, $2, 'technician', $3, $4)
       RETURNING id`,
      [body.name?.trim() || displayName, email, body.timezone ?? "America/Mexico_City", body.active ?? true]
    );
    const techRes = await client.query(
      `INSERT INTO technicians (user_id, display_name, phone, specialties, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, display_name, phone, specialties, active`,
      [userRes.rows[0].id, displayName, body.phone?.trim() ?? null, specialties, body.active ?? true]
    );
    await client.query("COMMIT");
    return jsonOk({ technician: { ...techRes.rows[0], user_id: userRes.rows[0].id, email } }, 201);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof Error && err.message.includes("duplicate key")) {
      return jsonError("Ya existe un técnico o usuario con ese email");
    }
    return jsonError("No se pudo crear el técnico", 500, String(err));
  } finally {
    client.release();
  }
}