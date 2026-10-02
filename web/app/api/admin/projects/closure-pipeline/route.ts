import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

// Pipeline de pre-cierre: proyectos cuya instalación técnica ya se realizó o está
// en curso y pueden pasar a la etapa administrativa (cobros, facturación, evidencias).
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.code, p.name, p.status, p.planned_end_date, p.actual_end_date,
              c.name AS client_name,
              u.name AS coordinator_name,
              pc.installation_done,
              pc.hours_justified,
              (pc.delivery_sheet_attachment_id IS NOT NULL) AS delivery_sheet_present,
              (
                (SELECT COUNT(*) FROM project_screens ps
                 WHERE ps.project_id = p.id AND COALESCE(ps.cancelled, false) = false) > 0
                AND
                (SELECT COUNT(DISTINCT pml.screen_id)
                 FROM project_closure_module_lots pml
                 JOIN project_screens ps ON ps.id = pml.screen_id
                 WHERE pml.project_id = p.id
                   AND pml.screen_id IS NOT NULL
                   AND ps.project_id = p.id
                   AND COALESCE(ps.cancelled, false) = false)
                >=
                (SELECT COUNT(*) FROM project_screens ps
                 WHERE ps.project_id = p.id AND COALESCE(ps.cancelled, false) = false)
              ) AS module_lots_by_screen,
              pc.receiver_name,
              pc.reception_date,
              pc.closed_at,
              pac.cobro, pac.facturacion, pac.evidencias,
              pac.finiquito, pac.complemento_fiscal, pac.note,
              pac.updated_at AS admin_updated_at
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN users u ON u.id = p.coordinator_id
       LEFT JOIN project_closures pc ON pc.project_id = p.id
       LEFT JOIN project_admin_closure pac ON pac.project_id = p.id
       WHERE p.status IN ('installation', 'pending_docs')
          OR (pc.installation_done = true AND p.status NOT IN ('closed', 'cancelled'))
       ORDER BY
         (CASE WHEN p.status = 'pending_docs' THEN 0
               WHEN pc.installation_done = true THEN 1
               ELSE 2 END),
         p.planned_end_date NULLS LAST, p.name`
    );

    const rows2 = rows.map((r) => ({
      ...r,
      installation_done: Boolean(r.installation_done),
      hours_justified: Boolean(r.hours_justified),
      delivery_sheet_present: Boolean(r.delivery_sheet_present),
      module_lots_by_screen: Boolean(r.module_lots_by_screen),
      cobro: Boolean(r.cobro),
      facturacion: Boolean(r.facturacion),
      evidencias: Boolean(r.evidencias),
      finiquito: Boolean(r.finiquito),
      complemento_fiscal: Boolean(r.complemento_fiscal),
    }));

    return jsonOk({ projects: rows2 });
  } catch (err) {
    return jsonError("No se pudo leer el pipeline de cierres", 500, String(err));
  }
}
