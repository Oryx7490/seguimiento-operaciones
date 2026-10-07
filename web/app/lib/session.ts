import { cookies } from "next/headers";
import pool from "@/app/lib/db";

/**
 * Identidad de la persona que está operando.
 *
 * La aplicación todavía no tiene login: no hay cookies de sesión ni OAuth. Para
 * poder atribuir acciones y contar usuarios concurrentes, cada persona elige su
 * usuario una vez ("Quién eres") y la elección queda en la cookie `sg_uid`.
 *
 * Cuando no hay cookie —API de agentes, curling, scripts, worker— se cae al
 * usuario admin/coordinator más antiguo, que es el comportamiento anterior.
 * Cuando exista login real, solo hay que cambiar `resolveSessionUser`.
 */

export const SESSION_COOKIE = "sg_uid";

export const PRESENCE_WINDOW_MINUTES = 5;

export interface SessionUser {
  id: string;
  name: string;
  role: string;
}

async function fallbackUserId(): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE role IN ('admin', 'coordinator') ORDER BY created_at LIMIT 1`
  );
  return rows.length > 0 ? rows[0].id : null;
}

/** Usuario de la cookie, si sigue existiendo y activo. */
export async function sessionUserId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND active AND NOT is_agent`,
    [raw]
  );
  return rows.length > 0 ? rows[0].id : null;
}

/**
 * Usuario actual: cookie si existe, si no el admin más antiguo.
 * `null` solo si la tabla `users` está vacía.
 */
export async function currentUserId(): Promise<string | null> {
  return (await sessionUserId()) ?? (await fallbackUserId());
}

/** Usuario actual con nombre y rol, para la bitácora y la presencia. */
export async function currentUser(): Promise<SessionUser | null> {
  const id = await currentUserId();
  if (!id) return null;
  const { rows } = await pool.query(`SELECT id, name, role FROM users WHERE id = $1`, [id]);
  return rows.length > 0 ? (rows[0] as SessionUser) : null;
}

/** Registra el latido de presencia del usuario actual. */
export async function touchPresence(userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_presence (user_id, last_seen_at)
     VALUES ($1, now())
     ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now()`,
    [userId]
  );
}

/** Usuarios con actividad en los últimos minutos. */
export async function onlineUsers(minutes = PRESENCE_WINDOW_MINUTES) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.role, p.last_seen_at
       FROM user_presence p
       JOIN users u ON u.id = p.user_id
      WHERE u.active AND NOT u.is_agent
        AND p.last_seen_at > now() - ($1 || ' minutes')::interval
      ORDER BY p.last_seen_at DESC`,
    [String(minutes)]
  );
  return rows as Array<SessionUser & { last_seen_at: string }>;
}
