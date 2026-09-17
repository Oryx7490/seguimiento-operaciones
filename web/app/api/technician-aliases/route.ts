import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId, uniqueViolation } from "@/app/lib/api";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.alias, a.technician_id, a.created_at, t.display_name
         FROM technician_aliases a
         JOIN technicians t ON t.id = a.technician_id
        ORDER BY lower(a.alias)`
    );
    return jsonOk({ aliases: rows });
  } catch (err) {
    return jsonError("No se pudieron leer las equivalencias", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: { alias?: string; technician_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const alias = body.alias?.trim();
  if (!alias) return jsonError("alias es obligatorio");
  if (!body.technician_id || !parseId(body.technician_id)) return jsonError("technician_id inválido");

  try {
    const { rows } = await pool.query(
      `INSERT INTO technician_aliases (alias, technician_id)
       VALUES ($1, $2)
       RETURNING id, alias, technician_id, created_at`,
      [alias, body.technician_id]
    );
    return jsonOk({ alias: rows[0] }, 201);
  } catch (err) {
    if (uniqueViolation(err)) return jsonError("Esa equivalencia ya existe");
    return jsonError("No se pudo crear la equivalencia", 500, String(err));
  }
}
