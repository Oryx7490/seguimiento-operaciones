import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";
import { currentUserId } from "@/app/lib/session";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("ID inválido", 400);
  const { rows } = await pool.query(
    `SELECT id, role_id, section_key, can_view, can_create, can_update, can_delete, can_export
       FROM role_permissions
      WHERE role_id = $1
      ORDER BY section_key`,
    [id]
  );
  return jsonOk({ permissions: rows });
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
  const perms = body.permissions || [];
  if (!Array.isArray(perms)) return jsonError("permissions debe ser arreglo", 400);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const p of perms) {
      if (!p.section_key) continue;
      await client.query(
        `INSERT INTO role_permissions (role_id, section_key, can_view, can_create, can_update, can_delete, can_export)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (role_id, section_key) DO UPDATE SET
           can_view = EXCLUDED.can_view,
           can_create = EXCLUDED.can_create,
           can_update = EXCLUDED.can_update,
           can_delete = EXCLUDED.can_delete,
           can_export = EXCLUDED.can_export,
           updated_at = now()`,
        [
          id,
          p.section_key,
          !!p.can_view,
          !!p.can_create,
          !!p.can_update,
          !!p.can_delete,
          !!p.can_export,
        ]
      );
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
