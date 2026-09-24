import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

// Proyección de m² de pantalla a instalar por tipo, en horizontes
// corto / mediano / largo plazo.
// Parámetros:
//   short  (default 3): meses del corto plazo
//   medium (default 6): meses hasta fin del mediano plazo
//   long   (default 12): meses hasta fin del largo plazo
//   anchor (default hoy): fecha de inicio del rango
//   pitch  (opcional): valores de pitch_mm separados por coma (ej. "1.2,2.5")

function clampMonth(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const short = clampMonth(Number(searchParams.get("short") || 3), 1, 36);
  const medium = clampMonth(Number(searchParams.get("medium") || 6), short, 36);
  const long = clampMonth(Number(searchParams.get("long") || 12), medium, 36);

  const pitchParam = searchParams.get("pitch");
  const selectedPitches = pitchParam
    ? [...new Set(pitchParam.split(",").map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0))]
    : [];

  const anchor = new Date();
  const anchorParam = searchParams.get("anchor");
  if (anchorParam) {
    const parsed = new Date(anchorParam);
    if (!isNaN(parsed.getTime())) anchor.setTime(parsed.getTime());
  }
  anchor.setDate(1);
  anchor.setHours(0, 0, 0, 0);

  const rangeEnd = new Date(anchor);
  rangeEnd.setMonth(rangeEnd.getMonth() + long);
  rangeEnd.setDate(0);
  rangeEnd.setHours(23, 59, 59, 999);

  const from = anchor.toISOString().slice(0, 10);
  const to = rangeEnd.toISOString().slice(0, 10);

  const anchorYear = anchor.getFullYear();
  const anchorMonth = anchor.getMonth();

  interface RawRow {
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
  }

  try {
    const whereBase = [
      `p.status NOT IN ('cancelled', 'closed')`,
      `p.planned_end_date IS NOT NULL`,
      `p.planned_end_date >= $1`,
      `p.planned_end_date <= $2`,
    ];
    const params: string[] = [from, to];
    if (selectedPitches.length) {
      whereBase.push(`ps.pitch_mm IN (${selectedPitches.map((_, i) => `$${params.length + 1 + i}`).join(", ")})`);
      params.push(...selectedPitches.map(String));
    }

    const { rows: pitchRows } = await pool.query(
      `SELECT DISTINCT ps.pitch_mm AS pitch
       FROM projects p
       JOIN project_screens ps ON ps.project_id = p.id
       WHERE p.status NOT IN ('cancelled', 'closed')
         AND p.planned_end_date IS NOT NULL
         AND p.planned_end_date >= $1
         AND p.planned_end_date <= $2
         AND ps.pitch_mm IS NOT NULL
       ORDER BY ps.pitch_mm`,
      [from, to]
    );
    const allPitches = pitchRows.map(r => Number(r.pitch));

    const { rows } = await pool.query<RawRow>(
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
       WHERE ${whereBase.join(" AND ")}
       ORDER BY p.planned_end_date, p.code, ps.screen_type`,
      params
    );

    type Bucket = {
      key: string;
      label: string;
      from_months: number;
      to_months: number;
      total_m2: number;
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
      }>;
    };

    const buckets: Record<string, Bucket> = {
      short: { key: "short", label: "Corto plazo", from_months: 0, to_months: short, total_m2: 0, projects: {} },
      medium: { key: "medium", label: "Mediano plazo", from_months: short, to_months: medium, total_m2: 0, projects: {} },
      long: { key: "long", label: "Largo plazo", from_months: medium, to_months: long, total_m2: 0, projects: {} },
    };

    const monthIdxFor = (r: RawRow) => {
      const [y, m] = r.month.split("-").map(Number);
      return (y - anchorYear) * 12 + (m - anchorMonth);
    };

    const bucketOf = (idx: number): Bucket | null => {
      if (idx < short) return buckets.short;
      if (idx < medium) return buckets.medium;
      if (idx < long) return buckets.long;
      return null;
    };

    const byType: Record<string, Record<string, number>> = { short: {}, medium: {}, long: {} };

    for (const r of rows) {
      const idx = monthIdxFor(r);
      const bucket = bucketOf(idx);
      if (!bucket) continue;

      const m2 = Number(r.m2_total);
      bucket.total_m2 += m2;
      byType[bucket.key][r.screen_type] = (byType[bucket.key][r.screen_type] ?? 0) + m2;

      if (!bucket.projects[r.project_id]) {
        bucket.projects[r.project_id] = {
          project_id: r.project_id,
          code: r.code,
          name: r.name,
          client_name: r.client_name,
          planned_end_date: r.planned_end_date,
          status: r.status,
          screens: [],
        };
      }
      const proj = bucket.projects[r.project_id];
      // Evitar pantallas duplicadas por mes dentro del mismo bucket
      const exists = proj.screens.find(
        s => s.screen_type === r.screen_type && s.quantity === r.quantity
      );
      if (!exists) {
        proj.screens.push({
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
      }
    }

    const allTypes = [...new Set(rows.map(r => r.screen_type))].sort();

    const round2 = (n: number) => Math.round(n * 100) / 100;

    const horizons = (Object.keys(buckets) as Array<keyof typeof buckets>)
      .map(k => {
        const b = buckets[k];
        const projects = Object.values(b.projects).sort(
          (a, b2) => a.planned_end_date.localeCompare(b2.planned_end_date) || a.code.localeCompare(b2.code)
        );
        const by_type: Record<string, number> = {};
        for (const p of projects) {
          for (const s of p.screens) {
            by_type[s.screen_type] = (by_type[s.screen_type] ?? 0) + s.m2_total;
          }
        }
        return {
          key: b.key,
          label: b.label,
          from_months: b.from_months,
          to_months: b.to_months,
          total_m2: round2(b.total_m2),
          by_type,
          project_count: projects.length,
          projects,
        };
      });

    const totalAll = horizons.reduce((s, h) => s + h.total_m2, 0);

    return jsonOk({
      from,
      to,
      anchor_month: `${anchorYear}-${String(anchorMonth + 1).padStart(2, "0")}`,
      horizons,
      all_types: allTypes,
      all_pitches: allPitches,
      selected_pitches: selectedPitches.sort((a, b) => a - b),
      total_m2: round2(totalAll),
    });
  } catch (err) {
    return jsonError("No se pudo generar la proyección", 500, String(err));
  }
}