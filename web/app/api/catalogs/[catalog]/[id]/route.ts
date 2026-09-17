import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

const CATALOGS: Record<string, { table: string; cols: string }> = {
  priorities: { table: "priorities", cols: "name, sort_order, active" },
  phases: { table: "phase_catalog", cols: "name, sort_order, active" },
  "internal-activity-types": {
    table: "internal_activity_types",
    cols: "name, requires_approval, sort_order, active",
  },
  channels: { table: "ticket_channels", cols: "name, active" },
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ catalog: string; id: string }> }) {
  const { catalog, id } = await params;
  const conf = CATALOGS[catalog];
  if (!conf) return jsonError("catálogo desconocido", 404);
  if (!parseId(id)) return jsonError("id inválido");

  let body: { name?: string; sort_order?: number; requires_approval?: boolean; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const allowed = new Set(conf.cols.split(",").map((c) => c.trim()));
  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown) => {
    values.push(val);
    sets.push(`${col} = $${values.length + 1}`);
  };
  if (allowed.has("name") && typeof body.name === "string" && body.name.trim()) push("name", body.name.trim());
  if (allowed.has("sort_order") && typeof body.sort_order === "number") push("sort_order", body.sort_order);
  if (allowed.has("requires_approval") && typeof body.requires_approval === "boolean") push("requires_approval", body.requires_approval);
  if (allowed.has("active") && typeof body.active === "boolean") push("active", body.active);

  if (sets.length === 0) return jsonOk({ item: null });

  try {
    const { rows } = await pool.query(
      `UPDATE ${conf.table} SET ${sets.join(", ")} WHERE id = $1 RETURNING ${conf.cols}`,
      [id, ...values]
    );
    if (rows.length === 0) return jsonError("elemento no encontrado", 404);
    return jsonOk({ item: rows[0] });
  } catch (err) {
    return jsonError("No se pudo actualizar el elemento", 500, String(err));
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ catalog: string; id: string }> }) {
  const { catalog, id } = await params;
  const conf = CATALOGS[catalog];
  if (!conf) return jsonError("catálogo desconocido", 404);
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `UPDATE ${conf.table} SET active = false WHERE id = $1 RETURNING id`,
      [id]
    );
    if (rows.length === 0) return jsonError("elemento no encontrado", 404);
    return jsonOk({ deleted: rows[0].id });
  } catch (err) {
    return jsonError("No se pudo dar de baja el elemento", 500, String(err));
  }
}