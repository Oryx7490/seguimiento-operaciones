import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `SELECT sc.screen_id, sc.controller_id, sc.quantity
         FROM screen_controllers sc
        WHERE sc.screen_id IN (SELECT id FROM project_screens WHERE project_id = $1)
        ORDER BY sc.screen_id, sc.controller_id`,
      [id]
    );
    return jsonOk({ controllers: rows });
  } catch (err) {
    return jsonError("No se pudo leer los controladores de la planeación", 500, String(err));
  }
}