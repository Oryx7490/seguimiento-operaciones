export interface InventoryLotInput {
  manufacturer_brand?: unknown;
  lot_number?: unknown;
  module_count?: unknown;
  location?: unknown;
}

function normStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function validateInventoryLot(input: InventoryLotInput): { ok: true; lot: { brand: string; lot: string; count: number; location: string | null } } | { ok: false; error: string } {
  const brand = normStr(input.manufacturer_brand);
  const lot = normStr(input.lot_number);
  const location = normStr(input.location);
  if (!brand) return { ok: false, error: "Falta la marca del fabricante" };
  if (!lot) return { ok: false, error: "Falta el número de lote" };
  const count = Number(input.module_count);
  if (!Number.isInteger(count) || count <= 0) {
    return { ok: false, error: "La cantidad de módulos debe ser un entero > 0" };
  }
  return { ok: true, lot: { brand, lot, count, location } };
}

export const SELECT_INVENTORY = `SELECT id, manufacturer_brand, lot_number, module_count, location, created_at, updated_at FROM inventory_lots`;