import pool from "@/app/lib/db";
import { jsonOk } from "@/app/lib/api";

export async function GET() {
  const [bloqueados, vencidos, faltaPlanificacion, ticketsNuevos, ticketsSinTecnico, ticketsSinAct, porValidar] =
    await Promise.all([
      pool.query(`
        SELECT p.id, p.code, p.name, p.health_status, p.status AS project_status,
               p.blocked_reason, p.next_action, p.next_action_date, p.updated_at,
               u.name AS coordinator_name,
               (SELECT ph.name FROM project_phases ph
                 WHERE ph.project_id = p.id AND ph.status = 'blocked'
                 ORDER BY ph.sort_order LIMIT 1) AS phase_blocked_name,
               COALESCE(
                 (SELECT ph.blocked_reason FROM project_phases ph
                   WHERE ph.project_id = p.id AND ph.status = 'blocked' AND ph.blocked_reason IS NOT NULL
                   ORDER BY ph.sort_order LIMIT 1),
                 p.blocked_reason
               ) AS reason,
               (current_date - p.updated_at::date) AS age_days
          FROM projects p
          LEFT JOIN users u ON u.id = p.coordinator_id
         WHERE (p.health_status = 'blocked'
                OR EXISTS (SELECT 1 FROM project_phases ph
                            WHERE ph.project_id = p.id AND ph.status = 'blocked'))
           AND p.status <> 'cancelled'
         ORDER BY p.updated_at ASC
      `),
      // Vencimientos por fecha planificada (proyectos y fases)
      pool.query(`
        SELECT 'project' AS kind, p.id, p.id AS project_id, p.code AS label, p.name AS title,
               p.planned_end_date AS due_date, p.status::text AS status, p.updated_at AS last_move,
               (current_date - p.planned_end_date) AS overdue_days,
               u.name AS responsible
          FROM projects p
          LEFT JOIN users u ON u.id = p.coordinator_id
         WHERE p.planned_end_date < current_date AND p.status NOT IN ('closed', 'cancelled')
        UNION ALL
        SELECT 'phase' AS kind, pp.id, pp.project_id AS project_id, p.code AS label, pp.name AS title,
               pp.planned_end_date AS due_date, pp.status::text AS status, pp.updated_at AS last_move,
               (current_date - pp.planned_end_date) AS overdue_days,
               u.name AS responsible
          FROM project_phases pp
          JOIN projects p ON p.id = pp.project_id
          LEFT JOIN users u ON u.id = pp.owner_id
         WHERE pp.planned_end_date < current_date AND pp.status NOT IN ('completed', 'not_applicable')
           AND p.status <> 'cancelled'
        ORDER BY due_date ASC
      `),
      // Fases planificadas sin fecha (pendientes de programar)
      pool.query(`
        SELECT pp.id, pp.project_id, p.code AS project_code, pp.name AS phase_name,
               pp.status AS phase_status, pp.updated_at
          FROM project_phases pp
          JOIN projects p ON p.id = pp.project_id
         WHERE pp.planned_start_date IS NULL AND pp.status NOT IN ('completed', 'not_applicable')
           AND p.status <> 'cancelled'
         ORDER BY p.code, pp.sort_order
      `),
      pool.query(`
        SELECT t.id, t.code, t.title, t.opened_at, t.last_activity_at,
               c.name AS client_name, l.name AS location_name, pr.name AS priority_name,
               (current_date - t.opened_at::date) AS age_days
          FROM tickets t
          LEFT JOIN clients c ON c.id = t.client_id
          LEFT JOIN locations l ON l.id = t.location_id
          LEFT JOIN priorities pr ON pr.id = t.priority_id
         WHERE t.status = 'new'
         ORDER BY t.opened_at ASC
      `),
      pool.query(`
        SELECT t.id, t.code, t.title, t.opened_at,
               c.name AS client_name, l.name AS location_name, pr.name AS priority_name,
               (current_date - t.opened_at::date) AS age_days
          FROM tickets t
          LEFT JOIN clients c ON c.id = t.client_id
          LEFT JOIN locations l ON l.id = t.location_id
          LEFT JOIN priorities pr ON pr.id = t.priority_id
         WHERE t.status = 'unassigned'
            OR (t.status IN ('new', 'to_review')
                AND NOT EXISTS (SELECT 1 FROM assignments a
                                 WHERE a.ticket_id = t.id AND a.unassigned_at IS NULL))
         ORDER BY t.opened_at ASC
      `),
      pool.query(`
        SELECT t.id, t.code, t.title, t.last_activity_at, t.status,
               c.name AS client_name,
               (current_date - t.last_activity_at::date) AS idle_days
          FROM tickets t
          LEFT JOIN clients c ON c.id = t.client_id
         WHERE t.status NOT IN ('closed', 'cancelled', 'resolved_pending_validation')
           AND t.last_activity_at < now() - interval '3 days'
         ORDER BY t.last_activity_at ASC
      `),
      pool.query(`
        SELECT t.id, t.code, t.title, t.resolved_at, t.next_action, t.next_action_date,
               c.name AS client_name, pr.name AS priority_name
          FROM tickets t
          LEFT JOIN clients c ON c.id = t.client_id
          LEFT JOIN priorities pr ON pr.id = t.priority_id
         WHERE t.status = 'resolved_pending_validation'
         ORDER BY COALESCE(t.resolved_at, t.updated_at) ASC
      `),
    ]);

  const actividadesVencidas = await pool.query(`
    SELECT a.id, a.date, a.description, a.planned_hours,
           t.code AS ticket_code, t.title AS ticket_title,
           array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL) AS project_codes,
           array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL) AS project_names,
           array_agg(DISTINCT tech.display_name) FILTER (WHERE tech.display_name IS NOT NULL) AS technicians
      FROM activities a
      LEFT JOIN tickets t ON t.id = a.ticket_id
      LEFT JOIN activity_projects ap ON ap.activity_id = a.id
      LEFT JOIN projects p ON p.id = ap.project_id
      LEFT JOIN activity_technicians at ON at.activity_id = a.id
      LEFT JOIN technicians tech ON tech.id = at.technician_id
     WHERE a.status IN ('planned', 'in_progress') AND a.date < current_date
     GROUP BY a.id, t.code, t.title
     ORDER BY a.date ASC
  `);

  return jsonOk({
    bloqueados: bloqueados.rows,
    vencimientos: vencidos.rows,
    sin_planificar: faltaPlanificacion.rows,
    actividades_vencidas: actividadesVencidas.rows,
    tickets_nuevos: ticketsNuevos.rows,
    tickets_sin_tecnico: ticketsSinTecnico.rows,
    tickets_sin_actualizacion: ticketsSinAct.rows,
    resoluciones_por_validar: porValidar.rows,
  });
}