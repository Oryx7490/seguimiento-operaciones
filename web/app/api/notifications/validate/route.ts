import { jsonError, jsonOk } from "@/app/lib/api";
import pool from "@/app/lib/db";

export async function POST() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Obtener todas las notificaciones no leídas (o todas) que son de sistema
    const { rows: notifications } = await client.query(
      `SELECT n.id, n.template, n.entity_type, n.entity_id, n.recipient_id
       FROM notifications n
       WHERE n.channel = 'system'
         AND n.read_at IS NULL
       ORDER BY n.created_at DESC`
    );

    let removed = 0;

    for (const n of notifications) {
      let isValid = false;

      if (n.entity_type === "activity" && n.template === "activity_overdue") {
        const { rows } = await client.query(
          `SELECT 1 FROM activities WHERE id = $1 AND status IN ('planned', 'in_progress') AND COALESCE(end_date, date) < current_date`,
          [n.entity_id]
        );
        isValid = rows.length > 0;
      }
      else if (n.entity_type === "project" && n.template === "project_blocked_no_next_action") {
        const { rows } = await client.query(
          `SELECT 1 FROM projects WHERE id = $1 AND health_status = 'blocked' AND (next_action IS NULL OR btrim(next_action) = '') AND status <> 'cancelled'`,
          [n.entity_id]
        );
        isValid = rows.length > 0;
      }
      else if (n.entity_type === "project" && n.template === "next_action_overdue") {
        const { rows } = await client.query(
          `SELECT 1 FROM projects WHERE id = $1 AND next_action_date < current_date AND next_action IS NOT NULL AND btrim(next_action) <> '' AND status NOT IN ('closed', 'cancelled')`,
          [n.entity_id]
        );
        isValid = rows.length > 0;
      }
      else if (n.entity_type === "ticket" && n.template === "next_action_overdue") {
        const { rows } = await client.query(
          `SELECT 1 FROM tickets WHERE id = $1 AND next_action_date < current_date AND next_action IS NOT NULL AND btrim(next_action) <> '' AND status NOT IN ('closed', 'cancelled')`,
          [n.entity_id]
        );
        isValid = rows.length > 0;
      }
      else if (n.entity_type === "ticket" && n.template === "ticket_unassigned") {
        const { rows } = await client.query(
          `SELECT 1 FROM tickets t
           WHERE t.id = $1
             AND t.status IN ('new', 'to_review', 'unassigned')
             AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.ticket_id = t.id AND a.unassigned_at IS NULL)`,
          [n.entity_id]
        );
        isValid = rows.length > 0;
      }
      else if (n.entity_type === "ticket" && n.template === "ticket_no_update") {
        const { rows } = await client.query(
          `SELECT 1 FROM tickets WHERE id = $1 AND status NOT IN ('closed', 'cancelled', 'resolved_pending_validation') AND last_activity_at < now() - interval '3 days'`,
          [n.entity_id]
        );
        isValid = rows.length > 0;
      }
      else if (n.entity_type === "ticket" && n.template === "ticket_resolved_unvalidated") {
        const { rows } = await client.query(
          `SELECT 1 FROM tickets WHERE id = $1 AND status = 'resolved_pending_validation' AND COALESCE(resolved_at, updated_at) < now() - interval '2 days'`,
          [n.entity_id]
        );
        isValid = rows.length > 0;
      }
      else if (n.entity_type === "project" && n.template === "installation_no_delivery_sheet") {
        const { rows } = await client.query(
          `SELECT 1 FROM projects p
           JOIN project_phases ph ON ph.project_id = p.id AND ph.name = 'Instalación' AND ph.status = 'completed'
           WHERE p.id = $1
             AND p.status NOT IN ('closed', 'cancelled')
             AND COALESCE(ph.actual_end_date, ph.planned_end_date) IS NOT NULL
             AND COALESCE(ph.actual_end_date, ph.planned_end_date) < current_date - interval '2 days'
             AND NOT EXISTS (
               SELECT 1 FROM project_closures pc
               WHERE pc.project_id = p.id AND pc.delivery_sheet_attachment_id IS NOT NULL
             )`,
          [n.entity_id]
        );
        isValid = rows.length > 0;
      }
      else if (n.entity_type === "project" && n.template === "hours_over_planned") {
        const { rows } = await client.query(
          `SELECT 1 FROM projects p
           LEFT JOIN (
             SELECT ap.project_id, SUM(a.planned_hours) AS h
               FROM activity_projects ap JOIN activities a ON a.id = ap.activity_id
              GROUP BY ap.project_id) pl ON pl.project_id = p.id
           LEFT JOIN (
             SELECT ap.project_id, SUM(te.duration_hours) AS h
               FROM activity_projects ap JOIN time_entries te ON te.activity_id = ap.activity_id
              GROUP BY ap.project_id) re ON re.project_id = p.id
           WHERE p.id = $1
             AND p.status NOT IN ('closed', 'cancelled')
             AND COALESCE(pl.h, 0) > 0
             AND COALESCE(re.h, 0) > COALESCE(pl.h, 0) * 1.2`,
          [n.entity_id]
        );
        isValid = rows.length > 0;
      }
      else {
        // Template desconocido: mantener por seguridad
        isValid = true;
      }

      if (!isValid) {
        await client.query(`DELETE FROM notifications WHERE id = $1`, [n.id]);
        removed++;
      }
    }

    await client.query("COMMIT");
    return jsonOk({ validated: notifications.length, removed });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudieron validar las notificaciones", 500, String(err));
  } finally {
    client.release();
  }
}