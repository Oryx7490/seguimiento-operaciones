import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { getCurrentUserId, jsonError, jsonOk, parseId } from "@/app/lib/api";

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  const userId = await getCurrentUserId();
  if (!userId) return jsonError("No hay usuario actual", 404);
  try {
    const { rows } = await pool.query(
      `UPDATE notifications
          SET read_at = COALESCE(read_at, now()), status = 'read'
        WHERE id = $1 AND recipient_id = $2
        RETURNING id, read_at, status`,
      [id, userId]
    );
    if (rows.length === 0) return jsonError("Notificación no encontrada", 404);
    return jsonOk({ notification: rows[0] });
  } catch (err) {
    return jsonError("No se pudo actualizar la notificación", 500, String(err));
  }
}
