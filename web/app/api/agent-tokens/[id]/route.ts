import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  try {
    const { rows } = await pool.query(
      `UPDATE agent_tokens
          SET active = false, revoked_at = now()
        WHERE id = $1 AND active = true
        RETURNING id, name, revoked_at`,
      [id]
    );
    if (rows.length === 0) return jsonError("token no encontrado o ya revocado", 404);
    return jsonOk({ revoked: rows[0] });
  } catch (err) {
    return jsonError("No se pudo revocar el token", 500, String(err));
  }
}
