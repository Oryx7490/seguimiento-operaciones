import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { getCurrentUserId, jsonError, jsonOk, parseId } from "@/app/lib/api";
import { logActivityAsync } from "@/app/lib/audit";
import {
  CATALOG_SCREEN_COLUMNS,
  catalogScreenParams,
  toRow,
  validateScreenCatalog,
} from "@/app/api/screen-catalog/route";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `SELECT ${CATALOG_SCREEN_COLUMNS},
              (SELECT count(*)::int FROM project_screens ps WHERE ps.screen_catalog_id = sc.id) AS used_in_projects
         FROM screen_catalog sc
         JOIN clients c ON c.id = sc.client_id
        WHERE sc.id = $1`,
      [id]
    );
    if (rows.length === 0) return jsonError("pantalla no encontrada", 404);
    return jsonOk({ screen: rows[0] });
  } catch (err) {
    return jsonError("No se pudo leer la pantalla", 500, String(err));
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  // `active` va aparte: es el interruptor del catálogo, no una medida.
  if (Object.keys(body).length === 1 && typeof body.active === "boolean") {
    return toggleActive(id, body.active);
  }

  const current = await pool.query(
    `SELECT client_id, name, width_m, height_m, area_m2, pitch_mm, is_irregular,
            environment, voltage, notes
       FROM screen_catalog WHERE id = $1`,
    [id]
  );
  if (current.rows.length === 0) return jsonError("pantalla no encontrada", 404);
  const c = current.rows[0];

  const merged = {
    client_id: body.client_id ?? c.client_id,
    name: body.name ?? c.name,
    width_m: body.width_m ?? c.width_m,
    height_m: body.height_m ?? c.height_m,
    area_m2: body.area_m2 ?? c.area_m2,
    pitch_mm: body.pitch_mm ?? c.pitch_mm,
    is_irregular: body.is_irregular ?? c.is_irregular,
    environment: body.environment === undefined ? c.environment : body.environment,
    voltage: body.voltage === undefined ? c.voltage : body.voltage,
    notes: body.notes === undefined ? c.notes : body.notes,
  };
  const v = validateScreenCatalog(merged);
  if (!v.ok) return jsonError(v.error);
  const actorId = await getCurrentUserId();

  try {
    const { rows } = await pool.query(
      `UPDATE screen_catalog SET
         client_id = $2, name = $3, width_m = $4, height_m = $5, area_m2 = $6,
         pitch_mm = $7, is_irregular = $8, environment = $9, voltage = $10, notes = $11,
         updated_at = now()
       WHERE id = $1
       RETURNING id, active, updated_at`,
      [id, ...catalogScreenParams(v.screen)]
    );
    if (rows.length === 0) return jsonError("pantalla no encontrada", 404);
    await logActivityAsync({
      entity_type: "screen",
      entity_id: id,
      entity_label: v.screen.name,
      action: "update",
      summary: `Pantalla del catálogo actualizada: ${v.screen.name}`,
      details: {
        width_m: v.screen.widthM,
        height_m: v.screen.heightM,
        area_m2: v.screen.areaM2,
        pitch_mm: v.screen.pitchMm,
      },
      actor_id: actorId,
    });
    return jsonOk({
      screen: toRow(id, v.screen, { active: rows[0].active, updated_at: rows[0].updated_at }),
    });
  } catch (err) {
    const msg = String(err);
    if (msg.includes("idx_screen_catalog_active_name") || msg.includes("idx_screen_catalog_client_name")) {
      return jsonError("Esa cuenta ya tiene una pantalla con ese nombre", 409);
    }
    return jsonError("No se pudo actualizar la pantalla del catálogo", 500, msg);
  }
}

// DELETE → desactivar (borrado lógico), igual que controller_catalog. Los proyectos
// que la usan conservan el enlace; el catálogo sigue siendo legible para el histórico.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  const actorId = await getCurrentUserId();
  try {
    const { rows } = await pool.query(
      `UPDATE screen_catalog SET active = false, updated_at = now()
        WHERE id = $1
        RETURNING id, name, (SELECT count(*)::int FROM project_screens WHERE screen_catalog_id = $1) AS used_in_projects`,
      [id]
    );
    if (rows.length === 0) return jsonError("pantalla no encontrada", 404);
    await logActivityAsync({
      entity_type: "screen",
      entity_id: id,
      entity_label: rows[0].name,
      action: "delete",
      summary: `Pantalla desactivada en el catálogo: ${rows[0].name}`,
      details: { used_in_projects: rows[0].used_in_projects },
      actor_id: actorId,
    });
    return jsonOk({ deleted: id, used_in_projects: rows[0].used_in_projects });
  } catch (err) {
    return jsonError("No se pudo desactivar la pantalla", 500, String(err));
  }
}

async function toggleActive(id: string, active: boolean) {
  const actorId = await getCurrentUserId();
  const { rows } = await pool.query(
    `UPDATE screen_catalog SET active = $2, updated_at = now() WHERE id = $1 RETURNING id, name, active`,
    [id, active]
  );
  if (rows.length === 0) return jsonError("pantalla no encontrada", 404);
  await logActivityAsync({
    entity_type: "screen",
    entity_id: id,
    entity_label: rows[0].name,
    action: "update",
    summary: `${active ? "Reactivada" : "Desactivada"} en el catálogo: ${rows[0].name}`,
    details: { active },
    actor_id: actorId,
  });
  return jsonOk({ screen: rows[0] });
}