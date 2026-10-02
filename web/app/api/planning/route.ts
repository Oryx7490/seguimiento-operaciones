import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

const NOTES_MAX = 2000;

const M2_UNIT = `CASE WHEN ps.is_irregular
  THEN COALESCE(ps.area_m2, 0)
  ELSE COALESCE(ps.width_m, 0) * COALESCE(ps.height_m, 0)
END`;

type Row = {
  project_id: string;
  code: string;
  project_name: string;
  client_name: string | null;
  status: string;
  screen_id: string | null;
  screen_type: string | null;
  environment: string | null;
  quantity: number | null;
  pitch_mm: string | null;
  width_m: string | null;
  height_m: string | null;
  is_irregular: boolean | null;
  area_m2: string | null;
  screen_notes: string | null;
  m2_unit: string | null;
  m2_total: string | null;
  assignment_id: string | null;
  controller_qty: number | null;
  controller_notes: string | null;
  installed: boolean | null;
  controller_id: string | null;
  controller_name: string | null;
  brand: string | null;
};

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET() {
  try {
    const { rows } = await pool.query<Row>(
      `SELECT p.id AS project_id, p.code, p.name AS project_name, p.status,
              cl.name AS client_name,
              ps.id AS screen_id, ps.screen_type, ps.environment, ps.quantity, ps.pitch_mm,
              ps.width_m, ps.height_m, ps.is_irregular, ps.area_m2, ps.notes AS screen_notes,
              (${M2_UNIT})::numeric(12,4) AS m2_unit,
              ((${M2_UNIT}) * ps.quantity)::numeric(12,4) AS m2_total,
              sc.id AS assignment_id, sc.quantity AS controller_qty, sc.notes AS controller_notes, sc.installed,
              cc.id AS controller_id, cc.name AS controller_name, cc.brand
         FROM projects p
         LEFT JOIN clients cl ON cl.id = p.client_id
         LEFT JOIN project_screens ps ON ps.project_id = p.id
         LEFT JOIN screen_controllers sc ON sc.screen_id = ps.id
         LEFT JOIN controller_catalog cc ON cc.id = sc.controller_id
        WHERE p.status <> 'cancelled'
        ORDER BY p.code, ps.created_at NULLS LAST, cc.brand NULLS LAST, cc.name`
    );

    const projects = new Map<string, {
      id: string;
      code: string;
      name: string;
      client_name: string | null;
      status: string;
      screens: Map<string, {
        id: string;
        screen_type: string;
        environment: string | null;
        quantity: number;
        pitch_mm: number | null;
        width_m: number | null;
        height_m: number | null;
        is_irregular: boolean;
        area_m2: number | null;
        notes: string | null;
        m2_unit: number;
        m2_total: number;
        controllers: {
          id: string;
          controller_id: string;
          name: string;
          brand: string | null;
          quantity: number;
          notes: string | null;
          installed: boolean;
        }[];
      }>;
    }>();

    for (const r of rows) {
      let project = projects.get(r.project_id);
      if (!project) {
        project = {
          id: r.project_id,
          code: r.code,
          name: r.project_name,
          client_name: r.client_name,
          status: r.status,
          screens: new Map(),
        };
        projects.set(r.project_id, project);
      }
      if (!r.screen_id || !r.screen_type) continue;
      let screen = project.screens.get(r.screen_id);
      if (!screen) {
        screen = {
          id: r.screen_id,
          screen_type: r.screen_type,
          environment: r.environment,
          quantity: r.quantity ?? 1,
          pitch_mm: num(r.pitch_mm),
          width_m: num(r.width_m),
          height_m: num(r.height_m),
          is_irregular: Boolean(r.is_irregular),
          area_m2: num(r.area_m2),
          notes: r.screen_notes,
          m2_unit: round2(num(r.m2_unit) ?? 0),
          m2_total: round2(num(r.m2_total) ?? 0),
          controllers: [],
        };
        project.screens.set(r.screen_id, screen);
      }
      if (r.assignment_id && r.controller_id && r.controller_name) {
        screen.controllers.push({
          id: r.assignment_id,
          controller_id: r.controller_id,
          name: r.controller_name,
          brand: r.brand,
          quantity: r.controller_qty ?? 1,
          notes: r.controller_notes,
          installed: Boolean(r.installed),
        });
      }
    }

    const list = [...projects.values()].map((p) => {
      const screens = [...p.screens.values()];
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        client_name: p.client_name,
        status: p.status,
        screens,
        total_m2: round2(screens.reduce((s, sc) => s + sc.m2_total, 0)),
      };
    });

    const demand = new Map<string, {
      controller_id: string;
      name: string;
      brand: string | null;
      quantity: number;
    }>();
    for (const p of list) {
      for (const s of p.screens) {
        for (const c of s.controllers) {
          const cur = demand.get(c.controller_id) ?? {
            controller_id: c.controller_id,
            name: c.name,
            brand: c.brand,
            quantity: 0,
          };
          cur.quantity += c.quantity * s.quantity;
          demand.set(c.controller_id, cur);
        }
      }
    }

    return jsonOk({
      projects: list,
      totals: {
        projects: list.length,
        screens: list.reduce((s, p) => s + p.screens.length, 0),
        m2: round2(list.reduce((s, p) => s + p.total_m2, 0)),
      },
      controllers: [...demand.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "es")),
    });
  } catch (err) {
    return jsonError("No se pudo leer la planeación", 500, String(err));
  }
}

export async function PATCH(req: NextRequest) {
  let body: { target?: string; id?: string; notes?: string | null; installed?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const id = body.id && parseId(body.id);
  if (!id) return jsonError("id inválido");
  if (body.target !== "screen" && body.target !== "controller") {
    return jsonError("target debe ser screen o controller");
  }
  if (body.target === "controller" && typeof body.installed === "boolean" && body.notes === undefined) {
    try {
      const { rows } = await pool.query(
        `UPDATE screen_controllers SET installed = $2 WHERE id = $1 RETURNING id, installed`,
        [id, body.installed]
      );
      if (rows.length === 0) return jsonError("No encontrado", 404);
      return jsonOk({ item: rows[0] });
    } catch (err) {
      return jsonError("No se pudo guardar la instalación", 500, String(err));
    }
  }
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (notes.length > NOTES_MAX) return jsonError(`El comentario no puede pasar de ${NOTES_MAX} caracteres`);

  const table = body.target === "screen" ? "project_screens" : "screen_controllers";
  try {
    const { rows } = await pool.query(
      `UPDATE ${table} SET notes = $2 WHERE id = $1 RETURNING id, notes`,
      [id, notes || null]
    );
    if (rows.length === 0) return jsonError("No encontrado", 404);
    return jsonOk({ item: rows[0] });
  } catch (err) {
    return jsonError("No se pudo guardar el comentario", 500, String(err));
  }
}
