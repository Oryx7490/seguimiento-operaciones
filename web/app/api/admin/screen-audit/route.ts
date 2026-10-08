import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";
import { auditScreenMeasures } from "@/app/lib/screen-rules";

// Auditoría de medidas de pantallas: recorre todas las pantallas de proyectos no
// cancelados y aplica las reglas de screen-rules (orden de magnitud, dimensiones
// imposibles, coherencia ancho×alto vs área, píxeles/área vs pitch, y desviación
// frente al catálogo de la cuenta). Devuelve solo las pantallas con alertas.
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT ps.id AS screen_id,
              ps.project_id, ps.screen_type, ps.quantity, ps.environment, ps.voltage,
              ps.width_m, ps.height_m, ps.is_irregular, ps.area_m2, ps.pitch_mm,
              ps.installed, ps.cancelled, ps.screen_catalog_id,
              p.code AS project_code, p.name AS project_name, p.status AS project_status,
              c.name AS client_name,
              sc.name AS catalog_name,
              sc.width_m AS catalog_width_m, sc.height_m AS catalog_height_m,
              sc.area_m2 AS catalog_area_m2, sc.pitch_mm AS catalog_pitch_mm
       FROM project_screens ps
       JOIN projects p ON p.id = ps.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN screen_catalog sc ON sc.id = ps.screen_catalog_id
       WHERE p.status <> 'cancelled'
       ORDER BY p.code, ps.sort_order, ps.screen_type`
    );
    const { rows: ignoreRows } = await pool.query(
      `SELECT screen_id, issue_key FROM screen_audit_ignores`
    );
    const ignored = new Set(ignoreRows.map((r) => `${r.screen_id}:${r.issue_key}`));

    const items = rows
      .map((r) => {
        const { errors, warnings } = auditScreenMeasures(
          {
            width_m: r.width_m,
            height_m: r.height_m,
            area_m2: r.area_m2,
            is_irregular: Boolean(r.is_irregular),
            pitch_mm: r.pitch_mm,
            quantity: Number(r.quantity),
          },
          { width_m: r.catalog_width_m, height_m: r.catalog_height_m, area_m2: r.catalog_area_m2, pitch_mm: r.catalog_pitch_mm },
          r.catalog_name
        );
        let area_m2 = r.area_m2 == null ? null : Number(r.area_m2);
        if (!r.is_irregular) {
          const w = r.width_m == null ? null : Number(r.width_m);
          const h = r.height_m == null ? null : Number(r.height_m);
          area_m2 = w != null && h != null ? w * h : area_m2;
        }
        const flagged = errors.length > 0 || warnings.length > 0;
        const issueKeys = [...errors, ...warnings].map((m) => {
          const h = Buffer.from(String(m)).toString("hex").slice(0, 40);
          return `err_${h}`;
        });
        return {
          screen_id: r.screen_id,
          project_id: r.project_id,
          project_code: r.project_code,
          project_name: r.project_name,
          project_status: r.project_status,
          client_name: r.client_name ?? null,
          screen_type: r.screen_type,
          quantity: Number(r.quantity),
          cancelled: Boolean(r.cancelled),
          installed: Boolean(r.installed),
          width_m: r.width_m == null ? null : Number(r.width_m),
          height_m: r.height_m == null ? null : Number(r.height_m),
          area_m2,
          pitch_mm: r.pitch_mm == null ? null : Number(r.pitch_mm),
          environment: r.environment ?? null,
          voltage: r.voltage ?? null,
          catalog_name: r.catalog_name ?? null,
          catalog_width_m: r.catalog_width_m == null ? null : Number(r.catalog_width_m),
          catalog_height_m: r.catalog_height_m == null ? null : Number(r.catalog_height_m),
          catalog_area_m2: r.catalog_area_m2 == null ? null : Number(r.catalog_area_m2),
          catalog_pitch_mm: r.catalog_pitch_mm == null ? null : Number(r.catalog_pitch_mm),
          errors,
          warnings,
          has_errors: errors.length > 0,
          has_warnings: warnings.length > 0,
          severity: errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok",
          flagged,
          issue_keys: issueKeys,
          alerts: [...errors, ...warnings],
        };
      })
      .filter((i) => i.flagged && !i.issue_keys.some((k) => ignored.has(`${i.screen_id}:${k}`)));

    const total = rows.length;
    const withErrors = items.filter((i) => i.has_errors).length;
    const withWarnings = items.filter((i) => i.has_warnings && !i.has_errors).length;

    return jsonOk({
      total,
      with_errors: withErrors,
      with_warnings: withWarnings,
      ok: total - items.length,
      items,
    });
  } catch (err) {
    return jsonError("No se pudo leer la auditoría de pantallas", 500, String(err));
  }
}