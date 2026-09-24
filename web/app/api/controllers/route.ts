import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

const OWNERSHIP = ["propio", "cliente", "tercero"];

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, brand, ownership, active, created_at
       FROM controller_catalog
       ORDER BY active DESC, brand NULLS LAST, name`
    );
    return jsonOk({ controllers: rows });
  } catch (err) {
    return jsonError("No se pudo leer el catálogo de controladores", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: { name?: string; brand?: string | null; ownership?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const name = body.name?.trim();
  if (!name) return jsonError("name es obligatorio");
  const ownership = body.ownership ?? "propio";
  if (!OWNERSHIP.includes(ownership)) return jsonError("ownership inválido");

  try {
    const { rows } = await pool.query(
      `INSERT INTO controller_catalog (name, brand, ownership)
       VALUES ($1, $2, $3) RETURNING id, name, brand, ownership, active, created_at`,
      [name, body.brand?.trim() || null, ownership]
    );
    return jsonOk({ controller: rows[0] }, 201);
  } catch (err) {
    return jsonError("No se pudo crear el controlador", 500, String(err));
  }
}