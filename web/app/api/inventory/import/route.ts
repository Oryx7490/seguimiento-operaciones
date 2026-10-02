import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk } from "@/app/lib/api";
import { validateInventoryLot, type ValidLot } from "@/app/lib/inventory";

const UPSERT = `INSERT INTO inventory_lots
  (manufacturer_brand, lot_number, module_count, location, pitch_mm, module_type, led_type, observations,
   ic_serial_1, ic_serial_2, ic_serial_3, status, expected_arrival, width_mm, height_mm)
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
ON CONFLICT (LOWER(manufacturer_brand), LOWER(lot_number)) DO UPDATE
  SET module_count     = EXCLUDED.module_count,
      location         = EXCLUDED.location,
      pitch_mm         = EXCLUDED.pitch_mm,
      module_type      = EXCLUDED.module_type,
      led_type         = EXCLUDED.led_type,
      observations     = EXCLUDED.observations,
      ic_serial_1      = EXCLUDED.ic_serial_1,
      ic_serial_2      = EXCLUDED.ic_serial_2,
      ic_serial_3      = EXCLUDED.ic_serial_3,
      status           = EXCLUDED.status,
      expected_arrival = EXCLUDED.expected_arrival,
      width_mm         = EXCLUDED.width_mm,
      height_mm        = EXCLUDED.height_mm
RETURNING (xmax = 0) AS is_insert, id`;

export async function POST(req: NextRequest) {
  let body: { rows?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return jsonError("Manda al menos una fila en rows");
  }

  const valid: Array<ValidLot> = [];
  const errors: string[] = [];
  body.rows.forEach((r, i) => {
    const v = validateInventoryLot(r as never);
    if (v.ok) valid.push(v.lot);
    else errors.push(`Fila ${i + 1}: ${v.error}`);
  });
  if (valid.length === 0) {
    return jsonError(`Ninguna fila válida. ${errors.join(" | ")}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let added = 0;
    let updated = 0;
    for (const lot of valid) {
      const { rows } = await client.query(UPSERT, [
        lot.brand, lot.lot, lot.count, lot.location, lot.pitch, lot.moduleType, lot.ledType, lot.observations,
        lot.ic1, lot.ic2, lot.ic3, lot.status, lot.eta, lot.widthMm, lot.heightMm,
      ]);
      if (rows[0]?.is_insert) added++;
      else updated++;
    }
    await client.query("COMMIT");
    return jsonOk({ added, updated, skipped: errors.length, errors }, 201);
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo importar el inventario", 500, String(err));
  } finally {
    client.release();
  }
}