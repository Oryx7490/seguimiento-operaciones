export interface InventoryLotInput {
  manufacturer_brand?: unknown;
  lot_number?: unknown;
  module_count?: unknown;
  location?: unknown;
  pitch_mm?: unknown;
  module_type?: unknown;
  led_type?: unknown;
  observations?: unknown;
  ic_serial_1?: unknown;
  ic_serial_2?: unknown;
  ic_serial_3?: unknown;
  status?: unknown;
  expected_arrival?: unknown;
  width_mm?: unknown;
  height_mm?: unknown;
}

export type LotStatus = "available" | "ordered" | "in_transit";

export const LOT_STATUSES: LotStatus[] = ["available", "ordered", "in_transit"];

export function normStatus(v: unknown): LotStatus {
  return v === "ordered" || v === "in_transit" ? v : "available";
}

export function normDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function normStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function normNum(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

export interface ValidLot {
  brand: string;
  lot: string;
  count: number;
  location: string | null;
  pitch: number | null;
  moduleType: string | null;
  ledType: string | null;
  observations: string | null;
  ic1: string | null;
  ic2: string | null;
  ic3: string | null;
  status: LotStatus;
  eta: string | null;
  widthMm: number;
  heightMm: number;
}

export function validateInventoryLot(input: InventoryLotInput): { ok: true; lot: ValidLot } | { ok: false; error: string } {
  const brand = normStr(input.manufacturer_brand);
  const lot = normStr(input.lot_number);
  const location = normStr(input.location);
  if (!brand) return { ok: false, error: "Falta la marca del fabricante" };
  if (!lot) return { ok: false, error: "Falta el número de lote" };
  const count = Number(input.module_count);
  if (!Number.isInteger(count) || count <= 0) {
    return { ok: false, error: "La cantidad de módulos debe ser un entero > 0" };
  }
  const pitch = normNum(input.pitch_mm);
  if (Number.isNaN(pitch) || (pitch !== null && pitch < 0)) {
    return { ok: false, error: "El pitch debe ser un número ≥ 0" };
  }
  const width = input.width_mm === undefined || input.width_mm === null || input.width_mm === "" ? 320 : normNum(input.width_mm);
  const height = input.height_mm === undefined || input.height_mm === null || input.height_mm === "" ? 160 : normNum(input.height_mm);
  if (width === null || Number.isNaN(width) || width <= 0 || height === null || Number.isNaN(height) || height <= 0) {
    return { ok: false, error: "Las medidas del módulo deben ser milímetros mayores a 0" };
  }
  const status = normStatus(input.status);
  const eta = normDate(input.expected_arrival);
  if (input.expected_arrival !== undefined && input.expected_arrival !== null && input.expected_arrival !== "" && eta === null) {
    return { ok: false, error: "La fecha estimada de llegada debe ser una fecha válida (AAAA-MM-DD)" };
  }
  return {
    ok: true,
    lot: {
      brand,
      lot,
      count,
      location,
      pitch,
      moduleType: normStr(input.module_type),
      ledType: normStr(input.led_type),
      observations: normStr(input.observations),
      ic1: normStr(input.ic_serial_1),
      ic2: normStr(input.ic_serial_2),
      ic3: normStr(input.ic_serial_3),
      status,
      eta: status === "available" ? null : eta,
      widthMm: width,
      heightMm: height,
    },
  };
}

export const SELECT_INVENTORY = `SELECT id, manufacturer_brand, lot_number, module_count, location,
                                        pitch_mm, module_type, led_type, observations,
                                        ic_serial_1, ic_serial_2, ic_serial_3, status, expected_arrival,
                                        width_mm, height_mm,
                                        created_at, updated_at
                                 FROM inventory_lots`;