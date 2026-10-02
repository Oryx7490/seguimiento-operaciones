import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, brand, active, created_at
       FROM controller_catalog
       ORDER BY active DESC, brand NULLS LAST, name`
    );
    return jsonOk({ controllers: rows });
  } catch (err) {
    return jsonError("No se pudo leer el catálogo de controladores", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: { name?: string; brand?: string | null };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const name = body.name?.trim();
  if (!name) return jsonError("name es obligatorio");

  try {
    const { rows } = await pool.query(
      `INSERT INTO controller_catalog (name, brand)
       VALUES ($1, $2) RETURNING id, name, brand, active, created_at`,
      [name, body.brand?.trim() || null]
    );
    return jsonOk({ controller: rows[0] }, 201);
  } catch (err) {
    return jsonError("No se pudo crear el controlador", 500, String(err));
  }
}