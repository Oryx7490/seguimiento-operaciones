import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk } from "@/app/lib/api";
import { SELECT_INVENTORY, validateInventoryLot, type ValidLot } from "@/app/lib/inventory";

const UPSERT = `INSERT INTO inventory_lots
  (manufacturer_brand, lot_number, module_count, location, pitch_mm, module_type, led_type, observations,
   ic_serial_1, ic_serial_2, ic_serial_3, status, expected_arrival, width_mm, height_mm)
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
ON CONFLICT (LOWER(manufacturer_brand), LOWER(lot_number)) DO UPDATE
  SET module_count    = EXCLUDED.module_count,
      location        = EXCLUDED.location,
      pitch_mm        = EXCLUDED.pitch_mm,
      module_type     = EXCLUDED.module_type,
      led_type        = EXCLUDED.led_type,
      observations    = EXCLUDED.observations,
      ic_serial_1     = EXCLUDED.ic_serial_1,
      ic_serial_2     = EXCLUDED.ic_serial_2,
      ic_serial_3     = EXCLUDED.ic_serial_3,
      status          = EXCLUDED.status,
      expected_arrival = EXCLUDED.expected_arrival,
      width_mm         = EXCLUDED.width_mm,
      height_mm        = EXCLUDED.height_mm
RETURNING id, manufacturer_brand, lot_number, module_count, location, pitch_mm, module_type,
          led_type, observations, ic_serial_1, ic_serial_2, ic_serial_3, status, expected_arrival,
          width_mm, height_mm,
          created_at, updated_at`;

function toParams(v: ValidLot) {
  return [
    v.brand,
    v.lot,
    v.count,
    v.location,
    v.pitch,
    v.moduleType,
    v.ledType,
    v.observations,
    v.ic1,
    v.ic2,
    v.ic3,
    v.status,
    v.eta,
    v.widthMm,
    v.heightMm,
  ];
}

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

  try {
    const { rows } = await pool.query(UPSERT, toParams(v.lot));
    return jsonOk({ lot: rows[0] }, 201);
  } catch (err) {
    return jsonError("No se pudo guardar el lote", 500, String(err));
  }
}