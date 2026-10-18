import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

const ROLES = ["technician", "coordinator", "admin"];

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.timezone, u.active, u.created_at,
              COALESCE((
                SELECT json_agg(json_build_object('phone', a.identifier_value, 'category', a.category, 'label', a.label)
                                ORDER BY (a.category = 'primary') DESC, a.created_at)
                  FROM whatsapp_capture.participants p
                  JOIN whatsapp_capture.participant_aliases a ON a.participant_id = p.id
                 WHERE p.user_id = u.id AND a.identifier_type = 'phone' AND a.valid_to IS NULL
              ), '[]'::json) AS whatsapp_phones
         FROM users u ORDER BY u.name`
    );
    return jsonOk({ users: rows });
  } catch (err) {
    return jsonError("No se pudieron leer los usuarios", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: { name?: string; email?: string; role?: string; timezone?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const role = body.role ?? "technician";

  if (!name || !email) return jsonError("name y email son obligatorios");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return jsonError("email inválido");
  if (!ROLES.includes(role)) return jsonError("rol inválido");

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, role, timezone, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, timezone, active, created_at`,
      [name, email, role, body.timezone ?? "America/Mexico_City", body.active ?? true]
    );
    return jsonOk({ user: rows[0] }, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes("duplicate key")) {
      return jsonError("Ya existe un usuario con ese email");
    }
    return jsonError("No se pudo crear el usuario", 500, String(err));
  }
}