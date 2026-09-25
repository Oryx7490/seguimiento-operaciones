import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk } from "@/app/lib/api";
import { validateInventoryLot } from "@/app/lib/inventory";

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

  const valid: Array<{ brand: string; lot: string; count: number; location: string | null }> = [];
  const errors: string[] = [];
  body.rows.forEach((r, i) => {
    const v = validateInventoryLot(r as never);
    if (v.ok) {
      valid.push(v.lot);
    } else {
      errors.push(`Fila ${i + 1}: ${v.error}`);
    }
  });
  if (valid.length === 0) {
    return jsonError(`Ninguna fila válida. ${errors.join(" | ")}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let added = 0;
    let updated = 0;
    for (const r of valid) {
      const { rows } = await client.query(
        `INSERT INTO inventory_lots (manufacturer_brand, lot_number, module_count, location)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (LOWER(manufacturer_brand), LOWER(lot_number)) DO UPDATE
           SET module_count = EXCLUDED.module_count,
               location     = EXCLUDED.location
         RETURNING (xmax = 0) AS is_insert`,
        [r.brand, r.lot, r.count, r.location]
      );
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