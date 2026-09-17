import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId } from "@/app/lib/api";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(`DELETE FROM technician_aliases WHERE id = $1 RETURNING id`, [id]);
    if (rows.length === 0) return jsonError("Equivalencia no encontrada", 404);
    return jsonOk({ removed: rows[0].id });
  } catch (err) {
    return jsonError("No se pudo eliminar la equivalencia", 500, String(err));
  }
}
