import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";
import { currentUserId } from "@/app/lib/session";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("ID inválido", 400);
  const { rows } = await pool.query(
    `SELECT r.id, r.code, r.name
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
      ORDER BY r.name`,
    [id]
  );
  return jsonOk({ roles: rows });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return jsonError("No hay usuario activo", 401);
  const { id } = await params;
  if (!parseId(id)) return jsonError("ID inválido", 400);
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const roleIds = Array.isArray(body.roleIds) ? body.roleIds : [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [id]);
    for (const rid of roleIds) {
      if (!parseId(rid)) continue;
      await client.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, rid]);
    }
    // Backcompat: mantener users.role (enum) con un valor soportado
    const { rows: roles } = await client.query(
      `SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1
        ORDER BY CASE WHEN r.code='admin' THEN 1 WHEN r.code='coordinator' THEN 2 WHEN r.code='technician' THEN 3 ELSE 99 END, r.name`,
      [id]
    );
    const enumRole = roles.map((r) => r.code).find((c) => c === "admin" || c === "coordinator" || c === "technician");
    if (enumRole) {
      await client.query(`UPDATE users SET role = $2::user_role WHERE id = $1`, [id, enumRole]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return jsonOk({ ok: true });
}
