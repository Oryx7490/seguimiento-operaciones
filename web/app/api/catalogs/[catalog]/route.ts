import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

const CATALOGS: Record<string, { table: string; sort?: string; hasSortOrder?: boolean; extra?: (string)[] }> = {
  priorities: { table: "priorities", sort: "sort_order", hasSortOrder: true },
  phases: { table: "phase_catalog", sort: "sort_order", hasSortOrder: true },
  "internal-activity-types": { table: "internal_activity_types", sort: "sort_order", hasSortOrder: true },
  channels: { table: "ticket_channels", sort: "name" },
};

const VALID_CATALOGS = Object.keys(CATALOGS);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ catalog: string }> }) {
  const { catalog } = await params;
  if (!VALID_CATALOGS.includes(catalog)) return jsonError("catálogo desconocido", 404);
  const conf = CATALOGS[catalog];
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ${conf.table} WHERE active = true ORDER BY ${conf.sort}`
    );
    return jsonOk({ [catalog]: rows });
  } catch (err) {
    return jsonError("No se pudo leer el catálogo", 500, String(err));
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ catalog: string }> }) {
  const { catalog } = await params;
  if (!VALID_CATALOGS.includes(catalog)) return jsonError("catálogo desconocido", 404);
  const conf = CATALOGS[catalog];

  let body: { name?: string; sort_order?: number; requires_approval?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const name = body.name?.trim();
  if (!name) return jsonError("name es obligatorio");

  try {
    const sortOrder = body.sort_order ?? null;
    if (catalog === "internal-activity-types") {
      const { rows } = await pool.query(
        `INSERT INTO internal_activity_types (name, requires_approval, sort_order)
         VALUES ($1, $2, $3) RETURNING id, name, requires_approval, sort_order, active`,
        [name, body.requires_approval ?? false, sortOrder]
      );
      return jsonOk({ item: rows[0] }, 201);
    }
    if (!conf.hasSortOrder) {
      const { rows } = await pool.query(
        `INSERT INTO ${conf.table} (name) VALUES ($1)
         RETURNING id, name, active`,
        [name]
      );
      return jsonOk({ item: rows[0] }, 201);
    }
    const { rows } = await pool.query(
      `INSERT INTO ${conf.table} (name, sort_order) VALUES ($1, $2)
       RETURNING id, name, sort_order, active`,
      [name, sortOrder]
    );
    return jsonOk({ item: rows[0] }, 201);
  } catch (err) {
    return jsonError("No se pudo crear el elemento del catálogo", 500, String(err));
  }
}