import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId } from "@/app/lib/api";
import { validateInventoryLot } from "@/app/lib/inventory";

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
  const { brand, lot, count, location } = v.lot;

  try {
    const { rows } = await pool.query(
      `UPDATE inventory_lots
       SET manufacturer_brand = $2, lot_number = $3, module_count = $4, location = $5
       WHERE id = $1
       RETURNING id, manufacturer_brand, lot_number, module_count, location, created_at, updated_at`,
      [id, brand, lot, count, location]
    );
    if (rows.length === 0) return jsonError("lote no encontrado", 404);
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
      `DELETE FROM inventory_lots WHERE id = $1 RETURNING id`,
      [id]
    );
    if (rows.length === 0) return jsonError("lote no encontrado", 404);
    return jsonOk({ deleted: rows[0].id });
  } catch (err) {
    return jsonError("No se pudo eliminar el lote", 500, String(err));
  }
}