import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk } from "@/app/lib/api";
import { SELECT_INVENTORY, validateInventoryLot } from "@/app/lib/inventory";

export async function GET() {
  try {
    const [inventory, usage] = await Promise.all([
      pool.query(`${SELECT_INVENTORY} ORDER BY manufacturer_brand, lot_number`),
      pool.query(
        `SELECT pml.manufacturer_brand, pml.lot_number, pml.module_count,
                pml.project_id, p.code AS project_code, p.name AS project_name,
                pml.screen_id, ps.screen_type AS screen_type
         FROM project_closure_module_lots pml
         JOIN projects p ON p.id = pml.project_id
         LEFT JOIN project_screens ps ON ps.id = pml.screen_id
         ORDER BY p.code, pml.manufacturer_brand, pml.lot_number`
      ),
    ]);
    return jsonOk({
      inventory: inventory.rows,
      usage: usage.rows,
    });
  } catch (err) {
    return jsonError("No se pudo leer el inventario", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const v = validateInventoryLot(body as never);
  if (!v.ok) return jsonError(v.error);
  const { brand, lot, count, location } = v.lot;

  try {
    const { rows } = await pool.query(
      `INSERT INTO inventory_lots (manufacturer_brand, lot_number, module_count, location)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (LOWER(manufacturer_brand), LOWER(lot_number)) DO UPDATE
         SET module_count = EXCLUDED.module_count,
             location     = EXCLUDED.location
       RETURNING id, manufacturer_brand, lot_number, module_count, location, created_at, updated_at`,
      [brand, lot, count, location]
    );
    return jsonOk({ lot: rows[0] }, 201);
  } catch (err) {
    return jsonError("No se pudo guardar el lote", 500, String(err));
  }
}