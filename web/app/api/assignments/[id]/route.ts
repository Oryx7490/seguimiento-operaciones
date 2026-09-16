import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `UPDATE assignments SET unassigned_at = now()
       WHERE id = $1 AND unassigned_at IS NULL RETURNING id`,
      [id]
    );
    if (rows.length === 0) return jsonError("asignación no encontrada", 404);
    return jsonOk({ unassigned: rows[0].id });
  } catch (err) {
    return jsonError("No se pudo quitar la asignación", 500, String(err));
  }
}