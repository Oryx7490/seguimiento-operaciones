import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId } from "@/app/lib/api";
import { logActivityAsync } from "@/app/lib/audit";
import { validateInventoryLot, type ValidLot } from "@/app/lib/inventory";

function toParams(v: ValidLot) {
  return [v.brand, v.lot, v.count, v.location, v.pitch, v.moduleType, v.ledType, v.observations, v.ic1, v.ic2, v.ic3, v.status, v.eta, v.widthMm, v.heightMm];
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const v = validateInventoryLot(body as never);
  if (!v.ok) return jsonError(v.error);
  const p = toParams(v.lot);

  try {
    const { rows } = await pool.query(
      `UPDATE inventory_lots
       SET manufacturer_brand = $2, lot_number = $3, module_count = $4, location = $5,
           pitch_mm = $6, module_type = $7, led_type = $8, observations = $9,
           ic_serial_1 = $10, ic_serial_2 = $11, ic_serial_3 = $12,
           status = $13, expected_arrival = $14, width_mm = $15, height_mm = $16
       WHERE id = $1
       RETURNING id, manufacturer_brand, lot_number, module_count, location, pitch_mm, module_type,
                 led_type, observations, ic_serial_1, ic_serial_2, ic_serial_3, status, expected_arrival,
                 width_mm, height_mm,
                 created_at, updated_at`,
      [id, ...p]
    );
    if (rows.length === 0) return jsonError("lote no encontrado", 404);
    await logActivityAsync({
      entity_type: "inventory",
      entity_id: id,
      entity_label: `${v.lot.brand} · ${v.lot.lot}`,
      action: "update",
      summary: `Lote de inventario actualizado: ${v.lot.brand} · ${v.lot.lot}`,
      details: {
        module_count: v.lot.count,
        status: v.lot.status,
        expected_arrival: v.lot.eta,
        width_mm: v.lot.widthMm,
        height_mm: v.lot.heightMm,
      },
    });
    return jsonOk({ lot: rows[0] });
  } catch (err) {
    const msg = String(err);
    if (msg.includes("idx_inventory_lots_brand_lot")) {
      return jsonError("Ya existe un lote con esa marca y número de lote", 409);
    }
    return jsonError("No se pudo actualizar el lote", 500, msg);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `DELETE FROM inventory_lots WHERE id = $1 RETURNING id, manufacturer_brand, lot_number`,
      [id]
    );
    if (rows.length === 0) return jsonError("lote no encontrado", 404);
    await logActivityAsync({
      entity_type: "inventory",
      entity_id: id,
      entity_label: `${rows[0].manufacturer_brand} · ${rows[0].lot_number}`,
      action: "delete",
      summary: `Lote de inventario eliminado: ${rows[0].manufacturer_brand} · ${rows[0].lot_number}`,
      details: {},
    });
    return jsonOk({ deleted: rows[0].id });
  } catch (err) {
    return jsonError("No se pudo eliminar el lote", 500, String(err));
  }
}