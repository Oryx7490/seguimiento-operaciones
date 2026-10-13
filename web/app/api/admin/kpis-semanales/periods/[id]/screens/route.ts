import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

// screen_installed_at representa una fecha de calendario. Normalizamos su día
// UTC a medianoche de Ciudad de México para compararlo con los límites semanales.
const INSTALLATION_AT_SQL = `COALESCE(
  ((ps.screen_installed_at AT TIME ZONE 'UTC')::date::timestamp AT TIME ZONE 'America/Mexico_City'),
  (ph.actual_end_date::timestamp AT TIME ZONE 'America/Mexico_City')
)`;

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows: p } = await pool.query(
      `SELECT starts_at, ends_at FROM weekly_kpi_periods WHERE id = $1`,
      [id]
    );
    if (p.length === 0) return jsonError("Periodo no encontrado", 404);
    const per = p[0];
    const { rows } = await pool.query(
      `SELECT ps.id, ps.project_id, pr.code AS project_code, pr.name AS project_name,
              ps.screen_type, ps.quantity, ps.width_m, ps.height_m, ps.is_irregular, ps.area_m2, ps.pitch_mm,
              ps.environment, ps.voltage, ps.installed, ps.cancelled, ps.screen_installed_at,
              ph.actual_end_date AS install_phase_end,
              to_char(COALESCE((ps.screen_installed_at AT TIME ZONE 'UTC')::date, ph.actual_end_date), 'YYYY-MM-DD') AS installation_date
         FROM project_screens ps
         JOIN projects pr ON pr.id = ps.project_id
         LEFT JOIN project_phases ph ON ph.project_id = ps.project_id AND ph.name = 'Instalación'
        WHERE ps.installed = true AND ps.cancelled = false
          AND ${INSTALLATION_AT_SQL} BETWEEN $1 AND $2
        ORDER BY ${INSTALLATION_AT_SQL} DESC NULLS LAST, pr.code`,
      [per.starts_at, per.ends_at]
    );
    return jsonOk({ screens: rows });
  } catch (err) {
    return jsonError("No se pudieron obtener pantallas instaladas", 500, String(err));
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: periodId } = await params;
  if (!parseId(periodId)) return jsonError("id de periodo inválido");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  if (typeof body !== "object" || body === null) return jsonError("Cuerpo JSON inválido");

  const payload = body as { screen_id?: unknown; installation_date?: unknown };
  const screenId = typeof payload.screen_id === "string" ? payload.screen_id : "";
  if (!parseId(screenId)) return jsonError("id de pantalla inválido");
  const installationDate = typeof payload.installation_date === "string" ? payload.installation_date : "";
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(installationDate)
    ? new Date(`${installationDate}T00:00:00.000Z`)
    : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== installationDate) {
    return jsonError("Fecha de instalación inválida");
  }

  try {
    const period = await pool.query(`SELECT id FROM weekly_kpi_periods WHERE id = $1`, [periodId]);
    if (period.rows.length === 0) return jsonError("Periodo no encontrado", 404);

    const updated = await pool.query(
      `UPDATE project_screens
          SET screen_installed_at = ($2::date::timestamp AT TIME ZONE 'America/Mexico_City')
        WHERE id = $1 AND installed = true AND cancelled = false
        RETURNING id, to_char((screen_installed_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS installation_date`,
      [screenId, installationDate]
    );
    if (updated.rows.length === 0) return jsonError("Pantalla instalada no encontrada", 404);
    return jsonOk({ screen: updated.rows[0] });
  } catch (err) {
    return jsonError("No se pudo actualizar la fecha de instalación", 500, String(err));
  }
}
