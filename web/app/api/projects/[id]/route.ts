import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { getCurrentUserId, jsonError, jsonOk, parseId } from "@/app/lib/api";
import { logActivity } from "@/app/lib/audit";

const PROJECT_STATUS = [
  "new",
  "planning",
  "waiting_authorization",
  "waiting_materials",
  "assembly",
  "ready_install",
  "installation",
  "pending_docs",
  "closed",
  "cancelled",
];

const HEALTH_STATUS = ["on_time", "at_risk", "blocked", "no_update"];


export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  try {
    const project = await pool.query(
      `SELECT p.*, c.name AS client_name, l.name AS location_name, l.city,
              pr.name AS priority_name, u.name AS coordinator_name
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN locations l ON l.id = p.location_id
       LEFT JOIN priorities pr ON pr.id = p.priority_id
       LEFT JOIN users u ON u.id = p.coordinator_id
       WHERE p.id = $1`,
      [id]
    );
    if (project.rows.length === 0) return jsonError("proyecto no encontrado", 404);

    const [phases, assignments, comments, history, attachments, screens, screenAttachments, screenControllers] = await Promise.all([
      pool.query(
        `SELECT ph.*, u.name AS owner_name FROM project_phases ph
         LEFT JOIN users u ON u.id = ph.owner_id
         WHERE ph.project_id = $1 ORDER BY ph.sort_order`,
        [id]
      ),
      pool.query(
        `SELECT a.id, a.technician_id, a.role, a.assigned_at, a.unassigned_at, a.created_at,
                t.display_name AS technician_name, u.email AS technician_email
         FROM assignments a
         JOIN technicians t ON t.id = a.technician_id
         LEFT JOIN users u ON u.id = t.user_id
         WHERE a.project_id = $1 AND a.unassigned_at IS NULL
         ORDER BY a.assigned_at`,
        [id]
      ),
      pool.query(
        `SELECT cm.id, cm.author_id, cm.body, cm.created_at, cm.updated_at, u.name AS author_name
         FROM comments cm JOIN users u ON u.id = cm.author_id
         WHERE cm.project_id = $1 ORDER BY cm.created_at`,
        [id]
      ),
      pool.query(
        `SELECT sh.*, u.name AS changed_by_name
         FROM status_history sh JOIN users u ON u.id = sh.changed_by
         WHERE sh.entity_type = 'project' AND sh.entity_id = $1 ORDER BY sh.created_at`,
        [id]
      ),
      pool.query(
        `SELECT at.*, u.name AS uploaded_by_name
         FROM attachments at JOIN users u ON u.id = at.uploaded_by
         WHERE at.project_id = $1 ORDER BY at.created_at`,
        [id]
      ),
      pool.query(
        `SELECT ps.id, ps.project_id, ps.screen_type, ps.environment, ps.quantity,
                ps.width_m, ps.height_m, ps.is_irregular, ps.area_m2, ps.pitch_mm, ps.voltage,
                ps.installed, ps.cancelled, ps.cancel_reason, ps.created_at, ps.sort_order,
                ps.screen_catalog_id, sc.name AS catalog_screen_name, sc.active AS catalog_screen_active,
                CASE WHEN ps.is_irregular THEN COALESCE(ps.area_m2, 0)
                     ELSE COALESCE(ps.width_m, 0) * COALESCE(ps.height_m, 0) END AS m2,
                (CASE WHEN ps.is_irregular THEN COALESCE(ps.area_m2, 0)
                      ELSE COALESCE(ps.width_m, 0) * COALESCE(ps.height_m, 0) END)::text AS m2_exact
         FROM project_screens ps
         LEFT JOIN screen_catalog sc ON sc.id = ps.screen_catalog_id
         WHERE ps.project_id = $1 ORDER BY ps.sort_order, ps.created_at`,
        [id]
      ),
      pool.query(
        `SELECT at.id, at.screen_id, at.file_name, at.mime_type, at.size_bytes,
                at.attachment_type, at.created_at, u.name AS uploaded_by_name
         FROM attachments at JOIN users u ON u.id = at.uploaded_by
         WHERE at.screen_id IN (SELECT id FROM project_screens WHERE project_id = $1)
         ORDER BY at.created_at`,
        [id]
      ),
      pool.query(
        `SELECT sc.id, sc.screen_id, sc.controller_id, sc.quantity,
                cc.name, cc.brand
         FROM screen_controllers sc
         JOIN controller_catalog cc ON cc.id = sc.controller_id
         WHERE sc.screen_id IN (SELECT id FROM project_screens WHERE project_id = $1)
         ORDER BY cc.name`,
        [id]
      ),
    ]);

    const closure = await pool.query(
      `SELECT pc.* FROM project_closures pc WHERE pc.project_id = $1`,
      [id]
    );

    const closureControllers = await pool.query(
      `SELECT pcc.id, pcc.screen_id, pcc.controller_id, pcc.controller_name,
              pcc.quantity, pcc.serial_numbers, pcc.no_equipment
       FROM project_closure_controllers pcc
       WHERE pcc.project_id = $1
       ORDER BY pcc.created_at`,
      [id]
    );

    const closureModuleLots = await pool.query(
      `SELECT pml.id, pml.screen_id, pml.manufacturer_brand, pml.lot_number, pml.module_count
       FROM project_closure_module_lots pml
       WHERE pml.project_id = $1
       ORDER BY pml.created_at`,
      [id]
    );

    const screenRows = screens.rows.map((s) => ({
      ...s,
      attachment: screenAttachments.rows.filter((a) => a.screen_id === s.id),
      controllers: screenControllers.rows.filter((c) => c.screen_id === s.id),
    }));

    return jsonOk({
      project: project.rows[0],
      phases: phases.rows,
      assignments: assignments.rows,
      comments: comments.rows,
      history: history.rows,
      attachments: attachments.rows,
      screens: screenRows,
      closure: closure.rows[0] ?? null,
      closure_controllers: closureControllers.rows,
      closure_module_lots: closureModuleLots.rows,
    });
  } catch (err) {
    return jsonError("No se pudo leer el proyecto", 500, String(err));
  }
}

interface PhasePatch {
  phases?: Array<{
    id?: string;
    name?: string;
    catalog_phase_id?: string | null;
    sort_order?: number;
    owner_id?: string | null;
    planned_start_date?: string | null;
    planned_end_date?: string | null;
    actual_start_date?: string | null;
    actual_end_date?: string | null;
    status?: string;
    blocked_reason?: string | null;
    next_action?: string | null;
    next_action_date?: string | null;
    _deleted?: boolean;
  }>;
}

interface ClosurePatch {
  closure?: {
    installation_done?: boolean;
    mandatory_activities_completed?: boolean;
    hours_justified?: boolean;
    delivery_sheet_attachment_id?: string | null;
    receiver_name?: string | null;
    reception_date?: string | null;
    finiquito_attachment_id?: string | null;
    fiscal_complement_attachment_id?: string | null;
    digital_signature_attachment_id?: string | null;
    final_note?: string | null;
  };
  close_project?: boolean;
  closure_controllers?: Array<{
    id?: string;
    screen_id?: string | null;
    controller_id?: string | null;
    controller_name?: string;
    quantity?: number;
    serial_numbers?: string | null;
    _deleted?: boolean;
    no_equipment?: boolean;
  }>;
  closure_module_lots?: Array<{
    id?: string;
    screen_id?: string | null;
    manufacturer_brand?: string;
    lot_number?: string;
    module_count?: number | null;
    _deleted?: boolean;
  }>;
}

interface ScreensPatch {
  screens?: Array<{
    id?: string;
    screen_type?: string;
    screen_catalog_id?: string | null;
    /** Trae ancho/alto/m²/pitch/voltage/ambiente desde la pantalla del catálogo. */
    apply_catalog_specs?: boolean;
    environment?: string | null;
    quantity?: number;
    width_m?: number | null;
    height_m?: number | null;
    is_irregular?: boolean;
    area_m2?: number | null;
    pitch_mm?: number | null;
    voltage?: string | null;
    installed?: boolean;
    cancelled?: boolean;
    cancel_reason?: string | null;
    controllers?: Array<{ controller_id: string; quantity: number }>;
    _deleted?: boolean;
  }>;
  /** Reordenamiento gráfico de pantallas (V4): lista de ids en el orden deseado. */
  screen_order?: string[];
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: {
    name?: string;
    client_id?: string | null;
    location_id?: string | null;
    priority_id?: string | null;
    coordinator_id?: string | null;
    planned_start_date?: string | null;
    planned_end_date?: string | null;
    actual_start_date?: string | null;
    actual_end_date?: string | null;
    status?: string;
    health_status?: string;
    blocked_reason?: string | null;
    next_action?: string | null;
    next_action_date?: string | null;
    reason?: string;
    actor_id?: string;
    // Solicitud de eliminación
    request_deletion?: boolean;
    cancel_deletion?: boolean;
    deletion_reason?: string;
  } & PhasePatch & ClosurePatch & ScreensPatch;
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const actorId = await getCurrentUserId();

  const setters: string[] = [];
  const values: unknown[] = [id];
  const changedFields: string[] = [];
  const push = (col: string, val: unknown) => {
    setters.push(`${col} = $${values.length + 1}`);
    values.push(val);
    if (!changedFields.includes(col)) changedFields.push(col);
  };

  const stringFields: Array<[string, keyof typeof body]> = [
    ["name", "name"],
    ["client_id", "client_id"],
    ["location_id", "location_id"],
    ["priority_id", "priority_id"],
    ["coordinator_id", "coordinator_id"],
    ["planned_start_date", "planned_start_date"],
    ["planned_end_date", "planned_end_date"],
    ["actual_start_date", "actual_start_date"],
    ["actual_end_date", "actual_end_date"],
    ["blocked_reason", "blocked_reason"],
    ["next_action", "next_action"],
    ["next_action_date", "next_action_date"],
  ];
  for (const [col, key] of stringFields) {
    if (key in body) push(col, (body[key] as string | null | undefined) || null);
  }
  if (typeof body.health_status === "string") {
    if (!HEALTH_STATUS.includes(body.health_status)) return jsonError("health_status inválido");
    if (body.health_status === "blocked") {
      const reason = typeof body.blocked_reason === "string" ? body.blocked_reason.trim() : "";
      const nextAction = typeof body.next_action === "string" ? body.next_action.trim() : "";
      if (!reason || !nextAction) {
        return jsonError("Para marcar el proyecto como bloqueado indica motivo y próxima acción");
      }
    }
    push("health_status", body.health_status);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT status, version FROM projects WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (current.rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("proyecto no encontrado", 404);
    }
    const fromStatus = current.rows[0].status;

    if (typeof body.status === "string") {
      if (!PROJECT_STATUS.includes(body.status)) {
        await client.query("ROLLBACK");
        return jsonError("status inválido");
      }
      push("status", body.status);
    }

    if (setters.length > 0) {
      setters.push(`version = version + 1`);
      await client.query(`UPDATE projects SET ${setters.join(", ")} WHERE id = $1`, values);
    }

    if (body.status && body.status !== fromStatus && actorId) {
      await client.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('project', $1, $2, $3, $4, $5)`,
        [id, fromStatus, body.status, actorId, body.reason || null]
      );
      await logActivity(client, {
        entity_type: "project",
        entity_id: id,
        action: "status_change",
        summary: `Proyecto ${fromStatus} → ${body.status}`,
        details: { from: fromStatus, to: body.status, reason: body.reason ?? null },
        project_id: id,
        actor_id: actorId,
      });
    }

    // El cambio de estado ya quedó registrado como `status_change`.
    const otherFields = changedFields.filter((f) => f !== "status");
    if (otherFields.length > 0) {
      await logActivity(client, {
        entity_type: "project",
        entity_id: id,
        action: "update",
        summary: `Proyecto actualizado: ${otherFields.join(", ")}`,
        details: { fields: otherFields },
        project_id: id,
        actor_id: actorId,
      });
    }

    // Solicitud de eliminación
    if (body.request_deletion) {
      await client.query(
        `UPDATE projects SET
           deletion_requested_at = now(),
           deletion_requested_by = $2,
           deletion_reason       = $3
         WHERE id = $1`,
        [id, actorId, body.deletion_reason?.trim() || null]
      );
    }
    if (body.cancel_deletion) {
      await client.query(
        `UPDATE projects SET
           deletion_requested_at = NULL,
           deletion_requested_by = NULL,
           deletion_reason       = NULL
         WHERE id = $1`,
        [id]
      );
    }

    if (Array.isArray(body.phases)) {
      for (const ph of body.phases) {
        if (ph._deleted && ph.id) {
          await client.query(`DELETE FROM project_phases WHERE id = $1 AND project_id = $2`, [ph.id, id]);
          continue;
        }
        if (ph.id) {
          const sets: string[] = [];
          const vals: unknown[] = [];
          const setPush = (col: string, val: unknown) => {
            sets.push(`${col} = $${vals.length + 3}`);
            vals.push(val);
          };
          if (ph.name !== undefined && ph.name.trim()) setPush("name", ph.name.trim());
          if (ph.catalog_phase_id !== undefined) setPush("catalog_phase_id", ph.catalog_phase_id || null);
          if (ph.sort_order !== undefined) setPush("sort_order", ph.sort_order);
          if (ph.owner_id !== undefined) setPush("owner_id", ph.owner_id || null);
          if (ph.planned_start_date !== undefined) setPush("planned_start_date", ph.planned_start_date || null);
          if (ph.planned_end_date !== undefined) setPush("planned_end_date", ph.planned_end_date || null);
          if (ph.actual_start_date !== undefined) setPush("actual_start_date", ph.actual_start_date || null);
          if (ph.actual_end_date !== undefined) setPush("actual_end_date", ph.actual_end_date || null);
          if (ph.status) {
            if (ph.status === "blocked") {
              const reason = typeof ph.blocked_reason === "string" ? ph.blocked_reason.trim() : "";
              const nextAction = typeof ph.next_action === "string" ? ph.next_action.trim() : "";
              if (!reason || !nextAction) {
                await client.query("ROLLBACK");
                return jsonError("Para bloquear una fase indica motivo y próxima acción");
              }
            }
            setPush("status", ph.status);
          }
          if (ph.blocked_reason !== undefined) setPush("blocked_reason", ph.blocked_reason?.trim() || null);
          if (ph.next_action !== undefined) setPush("next_action", ph.next_action?.trim() || null);
          if (ph.next_action_date !== undefined) setPush("next_action_date", ph.next_action_date || null);
          if (sets.length > 0) {
            await client.query(
              `UPDATE project_phases SET ${sets.join(", ")} WHERE id = $1 AND project_id = $2`,
              [ph.id, id, ...vals]
            );
          }
        } else if (ph.name?.trim()) {
          await client.query(
            `INSERT INTO project_phases (project_id, name, catalog_phase_id, sort_order, owner_id,
                                         planned_start_date, planned_end_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, ph.name.trim(), ph.catalog_phase_id || null, ph.sort_order ?? 0, ph.owner_id || null, ph.planned_start_date || null, ph.planned_end_date || null]
          );
        }
      }
    }

    if (Array.isArray(body.screens)) {
      for (const sc of body.screens) {
        // Sin esto, un id mal formado llega a Postgres y sale un 500 con el error crudo.
        if (sc.id !== undefined && !parseId(sc.id)) {
          await client.query("ROLLBACK");
          return jsonError("Identificador de pantalla inválido");
        }
        if (sc._deleted && sc.id) {
          await client.query(`DELETE FROM project_screens WHERE id = $1 AND project_id = $2`, [sc.id, id]);
          continue;
        }
        const statusOnly =
          Boolean(sc.id) &&
          (sc.installed !== undefined || sc.cancelled !== undefined || sc.cancel_reason !== undefined) &&
          sc.screen_type === undefined &&
          sc.screen_catalog_id === undefined &&
          sc.apply_catalog_specs === undefined &&
          sc.environment === undefined &&
          sc.quantity === undefined &&
          sc.width_m === undefined &&
          sc.height_m === undefined &&
          sc.is_irregular === undefined &&
          sc.area_m2 === undefined &&
          sc.pitch_mm === undefined &&
          sc.voltage === undefined &&
          sc.controllers === undefined;
        if (statusOnly && sc.id) {
          if (sc.cancelled === true) {
            const reason = typeof sc.cancel_reason === "string" ? sc.cancel_reason.trim() : "";
            if (!reason) {
              await client.query("ROLLBACK");
              return jsonError("Indica el motivo de la cancelación");
            }
            await client.query(
              `UPDATE project_screens
                  SET cancelled = true, installed = false, cancel_reason = $3
                WHERE id = $1 AND project_id = $2`,
              [sc.id, id, reason]
            );
          } else if (sc.cancelled === false) {
            await client.query(
              `UPDATE project_screens
                  SET cancelled = false, cancel_reason = NULL
                WHERE id = $1 AND project_id = $2`,
              [sc.id, id]
            );
          }
          if (sc.installed === true) {
            await client.query(
              `UPDATE project_screens
                  SET installed = true, cancelled = false, cancel_reason = NULL
                WHERE id = $1 AND project_id = $2`,
              [sc.id, id]
            );
          } else if (sc.installed === false && sc.cancelled === undefined) {
            await client.query(
              `UPDATE project_screens SET installed = false WHERE id = $1 AND project_id = $2`,
              [sc.id, id]
            );
          }
          continue;
        }
        if (
          sc.screen_type !== undefined ||
          sc.screen_catalog_id !== undefined ||
          sc.apply_catalog_specs !== undefined ||
          sc.environment !== undefined ||
          sc.quantity !== undefined ||
          sc.width_m !== undefined ||
          sc.height_m !== undefined ||
          sc.is_irregular !== undefined ||
          sc.area_m2 !== undefined ||
          sc.pitch_mm !== undefined ||
          sc.voltage !== undefined
        ) {
          // Pantalla del catálogo: se valida que sea de la cuenta del proyecto.
          let catalog: {
            id: string;
            name: string;
            width_m: number | null;
            height_m: number | null;
            area_m2: number | null;
            pitch_mm: number | null;
            is_irregular: boolean;
            environment: string | null;
            voltage: string | null;
          } | null = null;
          const catalogId = sc.screen_catalog_id === undefined ? undefined : sc.screen_catalog_id;
          if (catalogId !== undefined) {
            if (catalogId === null || catalogId === "") {
              await client.query(
                `UPDATE project_screens SET screen_catalog_id = NULL WHERE id = $1 AND project_id = $2`,
                [sc.id ?? null, id]
              );
            } else {
              if (!parseId(catalogId)) {
                await client.query("ROLLBACK");
                return jsonError("id de pantalla de catálogo inválido");
              }
              const found = await client.query(
                `SELECT sc.id, sc.name, sc.width_m, sc.height_m, sc.area_m2, sc.pitch_mm,
                        sc.is_irregular, sc.environment, sc.voltage
                   FROM screen_catalog sc
                   JOIN projects p ON p.id = $2
                  WHERE sc.id = $1 AND sc.client_id = p.client_id`,
                [catalogId, id]
              );
              if (found.rows.length === 0) {
                await client.query("ROLLBACK");
                return jsonError("La pantalla del catálogo no existe o no pertenece a la cuenta del proyecto");
              }
              catalog = found.rows[0];
            }
          }
          if (sc.apply_catalog_specs) {
            if (!catalog) {
              await client.query("ROLLBACK");
              return jsonError("Elige primero la pantalla del catálogo");
            }
            sc.width_m = catalog.width_m;
            sc.height_m = catalog.height_m;
            sc.area_m2 = catalog.area_m2;
            sc.pitch_mm = catalog.pitch_mm;
            sc.is_irregular = catalog.is_irregular;
            sc.environment = catalog.environment;
            sc.voltage = catalog.voltage;
            if (sc.screen_type === undefined) sc.screen_type = catalog.name;
          }

          const sType = typeof sc.screen_type === "string" ? sc.screen_type.trim() : undefined;
          const qty = sc.quantity;
          const w = sc.width_m;
          const h = sc.height_m;
          const irregular = sc.is_irregular;
          const area = sc.area_m2;

          let environment: string | null | undefined = sc.environment;
          if (environment !== undefined && environment !== null) {
            const env = String(environment).trim().toLowerCase();
            if (env !== "exterior" && env !== "interior" && env !== "semi_exterior" && env !== "interior_flexible") {
              await client.query("ROLLBACK");
              return jsonError("environment debe ser 'exterior', 'interior', 'semi_exterior' o 'interior_flexible'");
            }
            environment = env;
          }

          const voltage = (() => {
            if (sc.voltage === undefined) return undefined;
            if (sc.voltage === null) return null;
            const v = String(sc.voltage).trim().toLowerCase();
            if (v !== "110ac" && v !== "220ac") {
              return "__invalid__";
            }
            return v;
          })();
          if (voltage === "__invalid__") {
            await client.query("ROLLBACK");
            return jsonError("voltage debe ser '110ac' o '220ac'");
          }

          // Validar coherencia de dimensiones
          const willBeIrregular = irregular ?? (sc.id ? false : false); // si no se envía, asume regular
          if (willBeIrregular) {
            if (area === undefined || area === null || !Number.isFinite(Number(area)) || Number(area) <= 0) {
              await client.query("ROLLBACK");
              return jsonError(
                catalog
                  ? "La pantalla del catálogo es irregular: captura el área o pulsa «Traer specs»"
                  : "Pantalla irregular requiere area_m2 > 0"
              );
            }
          } else {
            if (w === undefined || w === null || !Number.isFinite(Number(w)) || Number(w) <= 0 ||
                h === undefined || h === null || !Number.isFinite(Number(h)) || Number(h) <= 0) {
              await client.query("ROLLBACK");
              return jsonError(
                catalog
                  ? "Captura las medidas de la pantalla o pulsa «Traer specs» para tomarlas del catálogo"
                  : "Pantalla regular requiere width_m > 0 y height_m > 0"
              );
            }
          }
          if (qty !== undefined && qty !== null && (!Number.isFinite(Number(qty)) || Number(qty) <= 0)) {
            await client.query("ROLLBACK");
            return jsonError("quantity debe ser > 0");
          }

          // Validar controladores antes de tocar la BD
          let screenId: string | null = sc.id ?? null;
          if (Array.isArray(sc.controllers)) {
            if (sc.controllers.length === 0) {
              // Lista vacía = sin controladores: se limpia abajo.
              void 0;
            } else {
              for (const c of sc.controllers) {
                if (!c.controller_id || !parseId(c.controller_id)) {
                  await client.query("ROLLBACK");
                  return jsonError("controller_id inválido en controladores");
                }
                if (!Number.isFinite(Number(c.quantity)) || Number(c.quantity) <= 0) {
                  await client.query("ROLLBACK");
                  return jsonError("cantidad de controlador debe ser > 0");
                }
                const { rows: exist } = await client.query(
                  `SELECT id FROM controller_catalog WHERE id = $1`,
                  [c.controller_id]
                );
                if (exist.length === 0) {
                  await client.query("ROLLBACK");
                  return jsonError("Controlador no encontrado en el catálogo");
                }
              }
            }
          }

          const num = (v: number | null | undefined): number | null =>
            v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null;
          if (sc.id) {
            const sets: string[] = [];
            const vals: unknown[] = [];
            const setPush = (col: string, val: unknown) => {
              sets.push(`${col} = $${vals.length + 3}`);
              vals.push(val);
            };
            if (sType !== undefined) setPush("screen_type", sType);
            if (catalogId !== undefined) setPush("screen_catalog_id", catalogId);
            if (environment !== undefined) setPush("environment", environment);
            if (voltage !== undefined) setPush("voltage", voltage);
            if (sc.quantity !== undefined) setPush("quantity", sc.quantity);
            if (sc.width_m !== undefined) setPush("width_m", num(sc.width_m));
            if (sc.height_m !== undefined) setPush("height_m", num(sc.height_m));
            if (sc.is_irregular !== undefined) setPush("is_irregular", sc.is_irregular);
            if (sc.area_m2 !== undefined) setPush("area_m2", num(sc.area_m2));
            if (sc.pitch_mm !== undefined) setPush("pitch_mm", num(sc.pitch_mm));
            if (sets.length > 0) {
              await client.query(
                `UPDATE project_screens SET ${sets.join(", ")} WHERE id = $1 AND project_id = $2`,
                [sc.id, id, ...vals]
              );
            }
          } else if (sType) {
            const { rows: inserted } = await client.query(
              `INSERT INTO project_screens (project_id, screen_type, screen_catalog_id, environment, quantity, width_m, height_m, is_irregular, area_m2, pitch_mm, voltage, sort_order)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE((SELECT MAX(sort_order) FROM project_screens WHERE project_id = $1), -1) + 1) RETURNING id`,
              [id, sType, catalog?.id ?? null, environment ?? null, sc.quantity ?? 1, num(sc.width_m), num(sc.height_m), sc.is_irregular ?? false, num(sc.area_m2), num(sc.pitch_mm), voltage ?? null]
            );
            screenId = inserted[0]?.id ?? null;
          }

          // Reemplazar controladores de la pantalla (equipos de la cotización)
          if (screenId && Array.isArray(sc.controllers)) {
            await client.query(`DELETE FROM screen_controllers WHERE screen_id = $1`, [screenId]);
            if (sc.controllers.length > 0) {
              for (const c of sc.controllers) {
                await client.query(
                  `INSERT INTO screen_controllers (screen_id, controller_id, quantity)
                   VALUES ($1, $2, $3)`,
                  [screenId, c.controller_id, c.quantity]
                );
              }
            }
          }
        }
      }
    }

    // Reordenamiento gráfico de pantallas (V4): persiste el orden de la lista.
    if (Array.isArray((body as { screen_order?: unknown }).screen_order)) {
      const order = (body as { screen_order: unknown[] }).screen_order;
      if (order.length === 0) {
        await client.query("ROLLBACK");
        return jsonError("screen_order no puede estar vacío");
      }
      const ids: string[] = [];
      for (const v of order) {
        if (typeof v !== "string" || !parseId(v)) {
          await client.query("ROLLBACK");
          return jsonError("Identificador de pantalla inválido en screen_order");
        }
        ids.push(v);
      }
      if (new Set(ids).size !== ids.length) {
        await client.query("ROLLBACK");
        return jsonError("screen_order tiene identificadores duplicados");
      }
      const { rows: owned } = await client.query(
        `SELECT id FROM project_screens WHERE project_id = $1`,
        [id]
      );
      const ownedIds = new Set(owned.map((r: { id: string }) => r.id));
      if (ids.length !== ownedIds.size || !ids.every((sid) => ownedIds.has(sid))) {
        await client.query("ROLLBACK");
        return jsonError("screen_order debe incluir todas las pantallas del proyecto una sola vez");
      }
      for (let i = 0; i < ids.length; i++) {
        await client.query(
          `UPDATE project_screens SET sort_order = $3 WHERE id = $1 AND project_id = $2`,
          [ids[i], id, i]
        );
      }
    }

    if (body.closure) {
      const cols: string[] = [];
      const vals: unknown[] = [];
      const cpush = (col: string, val: unknown) => {
        cols.push(col);
        vals.push(val);
      };
      const c = body.closure;
      if (c.delivery_sheet_attachment_id) {
        if (!parseId(c.delivery_sheet_attachment_id)) {
          await client.query("ROLLBACK");
          return jsonError("Hoja de entrega inválida");
        }
        const sheet = await client.query(
          `SELECT id FROM attachments
           WHERE id = $1 AND project_id = $2 AND attachment_type = 'delivery_sheet'`,
          [c.delivery_sheet_attachment_id, id]
        );
        if (sheet.rows.length === 0) {
          await client.query("ROLLBACK");
          return jsonError("La hoja de entrega debe ser un archivo de este proyecto");
        }
      }
      if (typeof c.installation_done === "boolean") cpush("installation_done", c.installation_done);
      if (typeof c.mandatory_activities_completed === "boolean") cpush("mandatory_activities_completed", c.mandatory_activities_completed);
      if (typeof c.hours_justified === "boolean") cpush("hours_justified", c.hours_justified);
      if (c.delivery_sheet_attachment_id !== undefined) cpush("delivery_sheet_attachment_id", c.delivery_sheet_attachment_id || null);
      if (c.receiver_name !== undefined) cpush("receiver_name", c.receiver_name?.trim() || null);
      if (c.reception_date !== undefined) cpush("reception_date", c.reception_date || null);
      if (c.finiquito_attachment_id !== undefined) cpush("finiquito_attachment_id", c.finiquito_attachment_id || null);
      if (c.fiscal_complement_attachment_id !== undefined) cpush("fiscal_complement_attachment_id", c.fiscal_complement_attachment_id || null);
      if (c.digital_signature_attachment_id !== undefined) cpush("digital_signature_attachment_id", c.digital_signature_attachment_id || null);
      if (c.final_note !== undefined) cpush("final_note", c.final_note?.trim() || null);
      if (cols.length > 0) {
        await client.query(
          `INSERT INTO project_closures (project_id, ${cols.join(", ")})
           VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")})
           ON CONFLICT (project_id) DO UPDATE SET ${cols.map((col) => `${col} = EXCLUDED.${col}`).join(", ")}`,
          [id, ...vals]
        );
      }
    }

    // Equipos definitivos utilizados en la instalación (con números de serie).
    if (Array.isArray(body.closure_controllers)) {
      // Validar antes de reemplazar.
      for (const cc of body.closure_controllers) {
        const noEquipment = Boolean(cc.no_equipment);
        if (noEquipment) {
          if (!cc.screen_id || !parseId(cc.screen_id)) {
            await client.query("ROLLBACK");
            return jsonError("La fila 'Sin equipo' debe asociarse a una pantalla");
          }
          if (cc.controller_id) {
            await client.query("ROLLBACK");
            return jsonError("Una fila 'Sin equipo' no puede referenciar un controlador");
          }
          const { rows: scr } = await client.query(
            `SELECT id FROM project_screens
             WHERE id = $1 AND project_id = $2 AND COALESCE(cancelled, false) = false`,
            [cc.screen_id, id]
          );
          if (scr.length === 0) {
            await client.query("ROLLBACK");
            return jsonError("La pantalla seleccionada en 'Sin equipo' no pertenece al proyecto o está cancelada");
          }
          continue;
        }
        const name = cc.controller_name?.trim();
        if (cc.controller_id && !parseId(cc.controller_id)) {
          await client.query("ROLLBACK");
          return jsonError("controller_id inválido en equipos del cierre");
        }
        if (!name) {
          await client.query("ROLLBACK");
          return jsonError("Cada equipo definitivo requiere un nombre/modelo");
        }
        if (!Number.isFinite(Number(cc.quantity)) || Number(cc.quantity) <= 0) {
          await client.query("ROLLBACK");
          return jsonError("La cantidad de cada equipo definitivo debe ser > 0");
        }
      }
      if (body.closure_controllers.length === 0) {
        // Se usa -1 para que DELETE no colisione en parametrización vacía.
        await client.query(`DELETE FROM project_closure_controllers WHERE project_id = $1`, [id]);
      } else {
        await client.query(`DELETE FROM project_closure_controllers WHERE project_id = $1`, [id]);
        for (const cc of body.closure_controllers) {
          const noEquipment = Boolean(cc.no_equipment);
          await client.query(
            `INSERT INTO project_closure_controllers (
               project_id, screen_id, controller_id, controller_name, quantity, serial_numbers, no_equipment
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              id,
              cc.screen_id && parseId(cc.screen_id) ? cc.screen_id : null,
              noEquipment ? null : (cc.controller_id || null),
              noEquipment ? "Sin equipo" : cc.controller_name!.trim(),
              noEquipment ? 1 : (cc.quantity ?? 1),
              noEquipment ? null : (cc.serial_numbers?.trim() || null),
              noEquipment,
            ]
          );
        }
      }
    }

    // Lotes de módulos LED y marca del fabricante, siempre asociados a una pantalla activa.
    if (Array.isArray(body.closure_module_lots)) {
      const requestedByInventoryLot = new Map<string, number>();
      for (const lot of body.closure_module_lots) {
        const brand = lot.manufacturer_brand?.trim();
        const lotNo = lot.lot_number?.trim();
        if (!brand) {
          await client.query("ROLLBACK");
          return jsonError("Cada lote de módulos requiere la marca del fabricante");
        }
        if (!lotNo) {
          await client.query("ROLLBACK");
          return jsonError("Cada lote de módulos requiere el número de lote");
        }
        if (!lot.screen_id || !parseId(lot.screen_id)) {
          await client.query("ROLLBACK");
          return jsonError("Cada lote de módulos debe asociarse a una pantalla válida");
        }
        const { rows: screenRows } = await client.query(
          `SELECT id FROM project_screens
           WHERE id = $1 AND project_id = $2 AND COALESCE(cancelled, false) = false`,
          [lot.screen_id, id]
        );
        if (screenRows.length === 0) {
          await client.query("ROLLBACK");
          return jsonError("La pantalla del lote no pertenece al proyecto o está cancelada");
        }
        const moduleCount = Number(lot.module_count);
        if (!Number.isInteger(moduleCount) || moduleCount <= 0) {
          await client.query("ROLLBACK");
          return jsonError("Cada lote de módulos requiere una cantidad entera > 0");
        }
        const inventoryKey = `${brand.toLowerCase()}\u0001${lotNo.toLowerCase()}`;
        requestedByInventoryLot.set(inventoryKey, (requestedByInventoryLot.get(inventoryKey) ?? 0) + moduleCount);
        const { rows: inventoryRows } = await client.query(
          `SELECT il.module_count,
                  COALESCE(SUM(CASE WHEN pml.project_id <> $1 THEN COALESCE(pml.module_count, 0) ELSE 0 END), 0)::int AS used_elsewhere
             FROM inventory_lots il
             LEFT JOIN project_closure_module_lots pml
               ON LOWER(pml.manufacturer_brand) = LOWER(il.manufacturer_brand)
              AND LOWER(pml.lot_number) = LOWER(il.lot_number)
            WHERE LOWER(il.manufacturer_brand) = LOWER($2)
              AND LOWER(il.lot_number) = LOWER($3)
              AND il.status = 'available'
            GROUP BY il.id, il.module_count`,
          [id, brand, lotNo],
        );
        if (inventoryRows.length === 0) {
          await client.query("ROLLBACK");
          return jsonError(`El lote ${brand} ${lotNo} ya no está disponible en el inventario`);
        }
        const available = Math.max(0, Number(inventoryRows[0].module_count) - Number(inventoryRows[0].used_elsewhere));
        if ((requestedByInventoryLot.get(inventoryKey) ?? 0) > available) {
          await client.query("ROLLBACK");
          return jsonError(`El lote ${brand} ${lotNo} solo tiene ${available} módulos disponibles`);
        }
      }
      if (body.closure_module_lots.length === 0) {
        await client.query(`DELETE FROM project_closure_module_lots WHERE project_id = $1`, [id]);
      } else {
        await client.query(`DELETE FROM project_closure_module_lots WHERE project_id = $1`, [id]);
        for (const lot of body.closure_module_lots) {
          await client.query(
            `INSERT INTO project_closure_module_lots (project_id, screen_id, manufacturer_brand, lot_number, module_count)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              id,
              lot.screen_id,
              lot.manufacturer_brand!.trim(),
              lot.lot_number!.trim(),
              Number(lot.module_count),
            ]
          );
        }
      }
    }

    if (body.close_project) {
      const { rows: closureRows } = await client.query(
        `SELECT * FROM project_closures WHERE project_id = $1`,
        [id]
      );
      const c = closureRows[0];
      const missing: string[] = [];
      if (!c) {
        missing.push(
          "Instalación realizada",
          "Horas justificadas",
          "Hoja de entrega firmada adjunta",
          "Nombre de quien recibe",
          "Fecha de recepción"
        );
      } else {
        if (!c.installation_done) missing.push("Instalación realizada");
        if (!c.hours_justified) missing.push("Horas justificadas");
        const signedSheet = c.delivery_sheet_attachment_id
          ? await client.query(
              `SELECT id FROM attachments
               WHERE id = $1 AND project_id = $2 AND attachment_type = 'delivery_sheet'`,
              [c.delivery_sheet_attachment_id, id]
            )
          : null;
        if (!signedSheet?.rows.length) missing.push("Hoja de entrega firmada adjunta");
        if (!c.receiver_name) missing.push("Nombre de quien recibe");
        if (!c.reception_date) missing.push("Fecha de recepción");
      }
      const { rows: requiredScreens } = await client.query(
        `SELECT id, screen_type FROM project_screens
         WHERE project_id = $1 AND COALESCE(cancelled, false) = false`,
        [id]
      );
      const { rows: lotScreens } = await client.query(
        `SELECT DISTINCT pml.screen_id
         FROM project_closure_module_lots pml
         JOIN project_screens ps ON ps.id = pml.screen_id
         WHERE pml.project_id = $1
           AND pml.screen_id IS NOT NULL
           AND ps.project_id = $1
           AND COALESCE(ps.cancelled, false) = false`,
        [id]
      );
      const lotScreenIds = new Set(lotScreens.map((row) => row.screen_id));
      const missingLotScreens = requiredScreens.filter((screen) => !lotScreenIds.has(screen.id));
      if (requiredScreens.length === 0) {
        missing.push("Pantallas activas del proyecto");
      } else if (missingLotScreens.length > 0) {
        missing.push(
          `Lote de módulos colocado para: ${missingLotScreens.map((screen) => screen.screen_type || screen.id).join(", ")}`
        );
      }
      if (missing.length > 0) {
        await client.query("ROLLBACK");
        return jsonError(`El proyecto no se cierra: falta ${missing.join("; ")}`);
      }
      await client.query(
        `UPDATE projects SET status = 'closed', version = version + 1 WHERE id = $1`,
        [id]
      );
      await client.query(
        `UPDATE project_closures SET closed_by = $2, closed_at = now() WHERE project_id = $1`,
        [id, actorId]
      );
      if (actorId) {
        await client.query(
          `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
           VALUES ('project', $1, $2, 'closed', $3, 'Cierre de proyecto')`,
          [id, fromStatus, actorId]
        );
        await logActivity(client, {
          entity_type: "project",
          entity_id: id,
          action: "close",
          summary: `Proyecto cerrado (${fromStatus} → closed)`,
          details: { from: fromStatus, to: "closed" },
          project_id: id,
          actor_id: actorId,
        });
      }
    }

    const { rows } = await client.query(
      `SELECT id, code, name, status, health_status, version, updated_at FROM projects WHERE id = $1`,
      [id]
    );
    await client.query("COMMIT");
    return jsonOk({ project: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo actualizar el proyecto", 500, String(err));
  } finally {
    client.release();
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  const actorId = await getCurrentUserId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE projects SET status = 'cancelled' WHERE id = $1 AND status <> 'cancelled' RETURNING id, status`,
      [id]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("proyecto no encontrado", 404);
    }
    if (actorId) {
      await client.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('project', $1, $2, 'cancelled', $3, 'Cancelación de proyecto')`,
        [id, rows[0].status, actorId]
      );
      await logActivity(client, {
        entity_type: "project",
        entity_id: id,
        action: "cancel",
        summary: `Proyecto cancelado (${rows[0].status} → cancelled)`,
        details: { from: rows[0].status, to: "cancelled" },
        project_id: id,
        actor_id: actorId,
      });
    }
    await client.query("COMMIT");
    return jsonOk({ cancelled: rows[0].id });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo cancelar el proyecto", 500, String(err));
  } finally {
    client.release();
  }
}
