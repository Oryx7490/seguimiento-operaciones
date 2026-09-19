import pool from "@/app/lib/db";
import { jsonOk } from "@/app/lib/api";

export async function GET() {
  const { rows: projects } = await pool.query(
    `SELECT projects.id, projects.code, projects.name, projects.health_status,
            projects.planned_start_date, projects.planned_end_date,
            clients.name AS client_name,
            (SELECT min(planned_start_date) FROM project_phases
              WHERE project_id = projects.id AND status <> 'not_applicable' AND planned_start_date IS NOT NULL) AS min_phase_start,
            (SELECT max(planned_end_date) FROM project_phases
              WHERE project_id = projects.id AND status <> 'not_applicable' AND planned_end_date IS NOT NULL) AS max_phase_end
       FROM projects
       LEFT JOIN clients ON clients.id = projects.client_id
      WHERE projects.status <> 'cancelled'
      ORDER BY projects.created_at ASC`
  );

  const { rows: phases } = await pool.query(
    `SELECT pp.id, pp.project_id, pp.name, pc.kind, pp.status,
            pp.planned_start_date, pp.planned_end_date,
            pp.actual_start_date, pp.actual_end_date
       FROM project_phases pp
       LEFT JOIN phase_catalog pc ON pc.id = pp.catalog_phase_id
      WHERE pp.status <> 'not_applicable'
      ORDER BY pp.sort_order ASC, pp.created_at ASC`
  );

  const byProject = new Map<string, typeof phases>();
  for (const phase of phases) {
    const list = byProject.get(phase.project_id) ?? [];
    list.push(phase);
    byProject.set(phase.project_id, list);
  }

  return jsonOk({
    projects: projects.map((p) => ({
      ...p,
      phases: byProject.get(p.id) ?? [],
    })),
  });
}