import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { getCurrentUserId, jsonError, jsonOk, parseId } from "@/app/lib/api";
import { logActivityAsync } from "@/app/lib/audit";

/** Valida el cuerpo de alta/edición de una pantalla de catálogo. */
export function validateScreenCatalog(input: {
  client_id?: unknown;
  name?: unknown;
  width_m?: unknown;
  height_m?: unknown;
  area_m2?: unknown;
  pitch_mm?: unknown;
  is_irregular?: unknown;
  environment?: unknown;
  voltage?: unknown;
  notes?: unknown;
}): { ok: true; screen: CatalogScreen } | { ok: false; error: string } {
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const num = (v: unknown): number | null => {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : Number.NaN;
  };

  const name = str(input.name);
  if (!name) return { ok: false, error: "Falta el nombre de la pantalla" };

  const clientId = str(input.client_id);
  if (!clientId) return { ok: false, error: "Falta la cuenta (cliente)" };
  if (!parseId(clientId)) return { ok: false, error: "id de cliente inválido" };

  const width = num(input.width_m);
  const height = num(input.height_m);
  const area = num(input.area_m2);
  const pitch = num(input.pitch_mm);
  for (const [label, value] of [
    ["ancho", width],
    ["alto", height],
    ["m²", area],
    ["pitch", pitch],
  ] as const) {
    if (Number.isNaN(value)) return { ok: false, error: `El ${label} debe ser un número` };
  }
  if (width !== null && width <= 0) return { ok: false, error: "El ancho debe ser mayor a 0" };
  if (height !== null && height <= 0) return { ok: false, error: "El alto debe ser mayor a 0" };
  if (area !== null && area <= 0) return { ok: false, error: "El m² debe ser mayor a 0" };
  if (pitch !== null && pitch < 0) return { ok: false, error: "El pitch no puede ser negativo" };

  const isIrregular = input.is_irregular === undefined ? false : Boolean(input.is_irregular);
  // Igual que en la pantalla del proyecto: regular exige ancho y alto, irregular exige m².
  if (isIrregular) {
    if (area === null) return { ok: false, error: "Una pantalla irregular necesita el m²" };
  } else if (width === null || height === null) {
    return { ok: false, error: "Una pantalla regular necesita ancho y alto" };
  }

  const voltage = str(input.voltage);
  if (voltage !== null && !["110ac", "220ac"].includes(voltage)) {
    return { ok: false, error: "El voltaje debe ser 110ac o 220ac" };
  }

  return {
    ok: true,
    screen: {
      clientId,
      name,
      widthM: width,
      heightM: height,
      areaM2: area,
      pitchMm: pitch,
      isIrregular,
      environment: str(input.environment),
      voltage,
      notes: str(input.notes),
    },
  };
}

export interface CatalogScreen {
  clientId: string;
  name: string;
  widthM: number | null;
  heightM: number | null;
  areaM2: number | null;
  pitchMm: number | null;
  isIrregular: boolean;
  environment: string | null;
  voltage: string | null;
  notes: string | null;
}

export function catalogScreenParams(s: CatalogScreen): unknown[] {
  return [
    s.clientId,
    s.name,
    s.widthM,
    s.heightM,
    s.areaM2,
    s.pitchMm,
    s.isIrregular,
    s.environment,
    s.voltage,
    s.notes,
  ];
}

/** Convierte el payload validado a la misma forma snake_case que devuelve el GET. */
export function toRow(id: string, s: CatalogScreen, extra: Record<string, unknown> = {}) {
  return {
    id,
    client_id: s.clientId,
    name: s.name,
    width_m: s.widthM,
    height_m: s.heightM,
    area_m2: s.areaM2,
    pitch_mm: s.pitchMm,
    is_irregular: s.isIrregular,
    environment: s.environment,
    voltage: s.voltage,
    notes: s.notes,
    ...extra,
  };
}

export const CATALOG_SCREEN_COLUMNS = `sc.id, sc.client_id, c.name AS client_name, sc.name,
  sc.width_m, sc.height_m, sc.area_m2, sc.pitch_mm, sc.is_irregular,
  sc.environment, sc.voltage, sc.notes, sc.active, sc.created_at, sc.updated_at`;

// GET → ?client_id= filtra por cuenta; ?q= busca por nombre.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const clientId = params.get("client_id");
  const q = params.get("q");

  // Un proyecto sin cuenta no tiene catálogo: parámetro presente y vacío = lista vacía
  // (sin este caso, un filtro ausente devolvería el catálogo de todas las cuentas).
  if (clientId !== null && clientId === "") return jsonOk({ screens: [] });

  const where: string[] = [];
  const values: unknown[] = [];
  if (clientId) {
    if (!parseId(clientId)) return jsonError("client_id inválido");
    values.push(clientId);
    where.push(`sc.client_id = $${values.length}`);
  }
  if (q) {
    // Busca por nombre de pantalla o por cuenta: "Diafi" debe encontrar sus pantallas.
    values.push(`%${q}%`);
    where.push(`(sc.name ILIKE $${values.length} OR c.name ILIKE $${values.length} OR COALESCE(sc.notes, '') ILIKE $${values.length})`);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const { rows } = await pool.query(
      `SELECT ${CATALOG_SCREEN_COLUMNS},
              (SELECT count(*)::int FROM project_screens ps WHERE ps.screen_catalog_id = sc.id) AS used_in_projects
         FROM screen_catalog sc
         JOIN clients c ON c.id = sc.client_id
         ${clause}
        ORDER BY c.name, sc.active DESC, sc.name`,
      values
    );
    return jsonOk({ screens: rows });
  } catch (err) {
    return jsonError("No se pudo leer el catálogo de pantallas", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const v = validateScreenCatalog(body);
  if (!v.ok) return jsonError(v.error);
  const actorId = await getCurrentUserId();

  try {
    const { rows } = await pool.query(
      `INSERT INTO screen_catalog
         (client_id, name, width_m, height_m, area_m2, pitch_mm, is_irregular, environment, voltage, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, active, created_at`,
      catalogScreenParams(v.screen)
    );
    await logActivityAsync({
      entity_type: "screen",
      entity_id: rows[0].id,
      entity_label: v.screen.name,
      action: "create",
      summary: `Pantalla agregada al catálogo de la cuenta: ${v.screen.name}`,
      details: {
        client_id: v.screen.clientId,
        width_m: v.screen.widthM,
        height_m: v.screen.heightM,
        area_m2: v.screen.areaM2,
        pitch_mm: v.screen.pitchMm,
      },
      actor_id: actorId,
    });
    return jsonOk(
      { screen: toRow(rows[0].id, v.screen, { active: true, created_at: rows[0].created_at, used_in_projects: 0 }) },
      201
    );
  } catch (err) {
    const msg = String(err);
    if (msg.includes("idx_screen_catalog_active_name") || msg.includes("idx_screen_catalog_client_name")) {
      return jsonError("Esa cuenta ya tiene una pantalla con ese nombre", 409);
    }
    if (msg.includes("clients_pkey") || msg.includes("foreign key")) {
      return jsonError("La cuenta no existe", 404);
    }
    return jsonError("No se pudo crear la pantalla del catálogo", 500, msg);
  }
}