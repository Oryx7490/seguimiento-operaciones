import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId } from "@/app/lib/api";
import { logActivityAsync } from "@/app/lib/audit";
import { SESSION_COOKIE, currentUser, touchPresence } from "@/app/lib/session";

const YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Usuario actual + lista para el selector "Quién eres". */
export async function GET() {
  const [{ rows: users }, user] = await Promise.all([
    pool.query(
      `SELECT id, name, role FROM users
        WHERE active AND NOT is_agent
        ORDER BY (role = 'admin') DESC, (role = 'coordinator') DESC, name`
    ),
    currentUser(),
  ]);

  let roles: Array<{ id: string; code: string; name: string }> = [];
  let sections: string[] = [];
  if (user) {
    const { rows: roleRows } = await pool.query(
      `SELECT r.id, r.code, r.name
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1
        ORDER BY r.name`,
      [user.id]
    );
    roles = roleRows as Array<{ id: string; code: string; name: string }>;
    if (roles.some((r) => r.code === "admin")) {
      sections = ["*"];
    } else {
      const { rows } = await pool.query(
        `SELECT DISTINCT rp.section_key
           FROM user_roles ur
           JOIN role_permissions rp ON rp.role_id = ur.role_id
          WHERE ur.user_id = $1 AND rp.can_view`,
        [user.id]
      );
      sections = rows.map((r) => r.section_key as string);
    }
  }

  return jsonOk({
    user: user ? { id: user.id, name: user.name, role: user.role } : null,
    users: users.map((row) => ({ id: row.id, name: row.name, role: row.role })),
    roles,
    sections,
  });
}

/** Elige quién eres y lo guarda en cookie por un año. */
export async function POST(req: NextRequest) {
  let body: { user_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  if (!body.user_id || !parseId(body.user_id)) return jsonError("user_id inválido");

  const { rows } = await pool.query(
    `SELECT id, name, role FROM users WHERE id = $1 AND active AND NOT is_agent`,
    [body.user_id]
  );
  if (rows.length === 0) return jsonError("El usuario no existe o está inactivo", 404);

  const store = await cookies();
  store.set(SESSION_COOKIE, rows[0].id, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: YEAR_SECONDS,
  });

  await touchPresence(rows[0].id);
  await logActivityAsync({
    entity_type: "user",
    entity_id: rows[0].id,
    entity_label: rows[0].name,
    action: "login",
    summary: `Sesión iniciada como ${rows[0].name}`,
    actor_id: rows[0].id,
  });

  return jsonOk({ user: { id: rows[0].id, name: rows[0].name, role: rows[0].role } });
}
