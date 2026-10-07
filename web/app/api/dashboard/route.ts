import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET() {
  try {
    const [agenda, projects, tickets, admin] = await Promise.all([
      pool.query<{
        today: number;
        overdue: number;
        upcoming: number;
        technicians: number;
      }>(
        `SELECT
           count(*) FILTER (
             WHERE a.status <> 'cancelled'
               AND a.date <= CURRENT_DATE
               AND COALESCE(a.end_date, a.date) >= CURRENT_DATE
           )::int AS today,
           count(*) FILTER (
             WHERE a.status IN ('planned', 'in_progress')
               AND COALESCE(a.end_date, a.date) < CURRENT_DATE
           )::int AS overdue,
           count(*) FILTER (
             WHERE a.status <> 'cancelled'
               AND a.date > CURRENT_DATE
               AND a.date <= CURRENT_DATE + 7
           )::int AS upcoming,
           (SELECT count(*)::int FROM technicians WHERE active = true) AS technicians
         FROM activities a`
      ),
      pool.query<{
        active: number;
        blocked: number;
        installation: number;
        total_m2: number;
      }>(
        `SELECT
           count(*) FILTER (WHERE p.status NOT IN ('closed', 'cancelled'))::int AS active,
           count(*) FILTER (WHERE p.status NOT IN ('closed', 'cancelled') AND p.health_status = 'blocked')::int AS blocked,
           count(*) FILTER (WHERE p.status IN ('ready_install', 'installation'))::int AS installation,
           COALESCE((
             SELECT SUM((CASE WHEN ps.is_irregular
                               THEN COALESCE(ps.area_m2, 0)
                               ELSE COALESCE(ps.width_m, 0) * COALESCE(ps.height_m, 0)
                          END) * ps.quantity)::float8
               FROM project_screens ps
               JOIN projects p2 ON p2.id = ps.project_id
              WHERE p2.status NOT IN ('closed', 'cancelled')
                AND ps.cancelled = false
           ), 0)::float8 AS total_m2
         FROM projects p`
      ),
      pool.query<{
        open: number;
        unassigned: number;
        in_progress: number;
        waiting: number;
        overdue_actions: number;
      }>(
        `SELECT
           count(*) FILTER (WHERE t.status NOT IN ('closed', 'cancelled'))::int AS open,
           count(*) FILTER (
             WHERE t.status NOT IN ('closed', 'cancelled')
               AND NOT EXISTS (
                 SELECT 1 FROM assignments a
                  WHERE a.ticket_id = t.id AND a.unassigned_at IS NULL
               )
           )::int AS unassigned,
           count(*) FILTER (WHERE t.status = 'in_progress')::int AS in_progress,
           count(*) FILTER (WHERE t.status IN ('waiting_client', 'waiting_material', 'waiting_access'))::int AS waiting,
           count(*) FILTER (
             WHERE t.status NOT IN ('closed', 'cancelled')
               AND t.next_action_date < CURRENT_DATE
           )::int AS overdue_actions
         FROM tickets t`
      ),
      pool.query<{
        users: number;
        clients: number;
        pending_deletions: number;
        unread_notifications: number;
        available_modules: number;
        incoming_modules: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM users WHERE active = true) AS users,
           (SELECT count(*)::int FROM clients WHERE active = true) AS clients,
           ((SELECT count(*) FROM projects WHERE deletion_requested_at IS NOT NULL) +
            (SELECT count(*) FROM tickets WHERE deletion_requested_at IS NOT NULL))::int AS pending_deletions,
           (SELECT count(*)::int FROM notifications WHERE read_at IS NULL) AS unread_notifications,
           (SELECT COALESCE(sum(module_count), 0)::int FROM inventory_lots WHERE status = 'available') AS available_modules,
           (SELECT COALESCE(sum(module_count), 0)::int FROM inventory_lots WHERE status IN ('ordered', 'in_transit')) AS incoming_modules`
      ),
    ]);

    return jsonOk({
      generated_at: new Date().toISOString(),
      agenda: agenda.rows[0],
      projects: projects.rows[0],
      tickets: tickets.rows[0],
      admin: admin.rows[0],
    });
  } catch (err) {
    return jsonError("No se pudo generar el dashboard", 500, String(err));
  }
}
