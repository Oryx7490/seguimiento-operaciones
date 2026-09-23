import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

// Devuelve proyectos con pantallas cuyo planned_end_date cae en el rango [from, to].
// Parámetros:
//   months (default 6): cuántos meses hacia adelante
//   anchor (default hoy, formato YYYY-MM-DD): fecha de inicio del rango

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const months = Math.max(1, Math.min(24, Number(searchParams.get("months") || 6)));
  const anchorParam = searchParams.get("anchor");

  // Calcular rango
  const anchor = anchorParam
    ? new Date(anchorParam + "T00:00:00")
    : new Date();
  anchor.setDate(1); // inicio de mes
  anchor.setHours(0, 0, 0, 0);

  const rangeEnd = new Date(anchor);
  rangeEnd.setMonth(rangeEnd.getMonth() + months);
  rangeEnd.setDate(0); // último día del mes anterior al siguiente
  rangeEnd.setHours(23, 59, 59, 999);

  const from = anchor.toISOString().slice(0, 10);
  const to = rangeEnd.toISOString().slice(0, 10);

  try {
    const { rows } = await pool.query<{
      month: string;
      project_id: string;
      code: string;
      name: string;
      client_name: string | null;
      planned_end_date: string;
      status: string;
      screen_type: string;
      quantity: number;
      pitch_mm: number | null;
      width_m: number | null;
      height_m: number | null;
      is_irregular: boolean;
      area_m2: number | null;
      m2_unit: number;
      m2_total: number;
    }>(
      `SELECT
         to_char(p.planned_end_date, 'YYYY-MM')              AS month,
         p.id                                                  AS project_id,
         p.code,
         p.name,
         c.name                                               AS client_name,
         to_char(p.planned_end_date, 'YYYY-MM-DD')           AS planned_end_date,
         p.status,
         ps.screen_type,
         ps.quantity,
         ps.pitch_mm,
         ps.width_m,
         ps.height_m,
         ps.is_irregular,
         ps.area_m2,
         CASE WHEN ps.is_irregular
              THEN COALESCE(ps.area_m2, 0)
              ELSE COALESCE(ps.width_m, 0) * COALESCE(ps.height_m, 0)
         END::numeric(12,4)                                   AS m2_unit,
         (CASE WHEN ps.is_irregular
               THEN COALESCE(ps.area_m2, 0)
               ELSE COALESCE(ps.width_m, 0) * COALESCE(ps.height_m, 0)
          END * ps.quantity)::numeric(12,4)                   AS m2_total
       FROM projects p
       JOIN project_screens ps ON ps.project_id = p.id
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE p.status NOT IN ('cancelled', 'closed')
         AND p.planned_end_date IS NOT NULL
         AND p.planned_end_date >= $1
         AND p.planned_end_date <= $2
       ORDER BY p.planned_end_date, p.code, ps.screen_type`,
      [from, to]
    );

    // Agrupar por mes → proyecto → pantallas
    const monthMap: Record<string, {
      month: string;
      projects: Record<string, {
        project_id: string;
        code: string;
        name: string;
        client_name: string | null;
        planned_end_date: string;
        status: string;
        screens: {
          screen_type: string;
          quantity: number;
          pitch_mm: number | null;
          m2_unit: number;
          m2_total: number;
          width_m: number | null;
          height_m: number | null;
          is_irregular: boolean;
          area_m2: number | null;
        }[];
        total_m2: number;
      }>;
      total_m2: number;
      by_type: Record<string, number>;
    }> = {};

    for (const r of rows) {
      if (!monthMap[r.month]) {
        monthMap[r.month] = { month: r.month, projects: {}, total_m2: 0, by_type: {} };
      }
      const m = monthMap[r.month];

      if (!m.projects[r.project_id]) {
        m.projects[r.project_id] = {
          project_id: r.project_id,
          code: r.code,
          name: r.name,
          client_name: r.client_name,
          planned_end_date: r.planned_end_date,
          status: r.status,
          screens: [],
          total_m2: 0,
        };
      }
      const p = m.projects[r.project_id];
      const m2 = Number(r.m2_total);
      p.screens.push({
        screen_type: r.screen_type,
        quantity: r.quantity,
        pitch_mm: r.pitch_mm ? Number(r.pitch_mm) : null,
        m2_unit: Number(r.m2_unit),
        m2_total: m2,
        width_m: r.width_m ? Number(r.width_m) : null,
        height_m: r.height_m ? Number(r.height_m) : null,
        is_irregular: r.is_irregular,
        area_m2: r.area_m2 ? Number(r.area_m2) : null,
      });
      p.total_m2 += m2;
      m.total_m2 += m2;
      m.by_type[r.screen_type] = (m.by_type[r.screen_type] ?? 0) + m2;
    }

    // Construir lista de meses con todos los meses del rango (incluso vacíos)
    const allMonths: typeof monthMap[string][] = [];
    const cursor = new Date(anchor);
    for (let i = 0; i < months; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      allMonths.push(monthMap[key] ?? { month: key, projects: {}, total_m2: 0, by_type: {} });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Todos los tipos de pantalla que aparecen en el rango
    const allTypes = [...new Set(rows.map(r => r.screen_type))].sort();

    return jsonOk({
      from,
      to,
      months: allMonths.map(m => ({
        month: m.month,
        total_m2: Math.round(m.total_m2 * 100) / 100,
        by_type: m.by_type,
        projects: Object.values(m.projects).sort((a, b) =>
          a.planned_end_date.localeCompare(b.planned_end_date) || a.code.localeCompare(b.code)
        ),
      })),
      all_types: allTypes,
    });
  } catch (err) {
    return jsonError("No se pudo generar el reporte", 500, String(err));
  }
}