import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

type TicketRow = {
  id: string;
  code: string;
  title: string;
  status: string;
  ticket_type: string;
  client_name: string | null;
  priority_name: string | null;
  next_action: string | null;
  next_action_date: string | null;
  opened_at: string;
};

type ActivityRow = {
  id: string;
  ticket_id: string;
  description: string;
  status: string;
  date: string;
  end_date: string | null;
  planned_hours: string | number;
};

export async function GET() {
  try {
    const { rows: tickets } = await pool.query<TicketRow>(
      `SELECT t.id, t.code, t.title, t.status, t.ticket_type,
              COALESCE(c.name, CASE WHEN t.ticket_type = 'internal' THEN 'RGB' END) AS client_name,
              pr.name AS priority_name, t.next_action,
              t.next_action_date::text AS next_action_date, t.opened_at::text
         FROM tickets t
         LEFT JOIN clients c ON c.id = t.client_id
         LEFT JOIN priorities pr ON pr.id = t.priority_id
        WHERE t.status NOT IN ('closed', 'cancelled')
        ORDER BY t.opened_at, t.code`
    );

    const ticketIds = tickets.map((t) => t.id);
    const assignments = ticketIds.length === 0
      ? []
      : (
          await pool.query<{
            id: string;
            ticket_id: string;
            technician_id: string;
            technician_name: string;
          }>(
            `SELECT a.id, a.ticket_id, a.technician_id, t.display_name AS technician_name
               FROM assignments a
               JOIN technicians t ON t.id = a.technician_id
              WHERE a.ticket_id = ANY($1::uuid[])
                AND a.unassigned_at IS NULL
              ORDER BY t.display_name`,
            [ticketIds]
          )
        ).rows;
    const { rows: technicians } = await pool.query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM technicians WHERE active = true ORDER BY display_name`
    );
    const activities = ticketIds.length === 0
      ? []
      : (
          await pool.query<ActivityRow>(
            `SELECT a.id, a.ticket_id, a.description, a.status,
                    a.date::text AS date, a.end_date::text AS end_date, a.planned_hours
               FROM activities a
              WHERE a.ticket_id = ANY($1::uuid[])
                AND a.status <> 'cancelled'
              ORDER BY a.date, a.created_at`,
            [ticketIds]
          )
        ).rows;

    const activityIds = activities.map((a) => a.id);
    const activityTechnicians = activityIds.length === 0
      ? []
      : (
          await pool.query<{ activity_id: string; display_name: string }>(
            `SELECT at.activity_id, t.display_name
               FROM activity_technicians at
               JOIN technicians t ON t.id = at.technician_id
              WHERE at.activity_id = ANY($1::uuid[])
              ORDER BY t.display_name`,
            [activityIds]
          )
        ).rows;

    const techsByActivity = new Map<string, string[]>();
    for (const tech of activityTechnicians) {
      const list = techsByActivity.get(tech.activity_id) ?? [];
      list.push(tech.display_name);
      techsByActivity.set(tech.activity_id, list);
    }

    const assignmentsByTicket = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const list = assignmentsByTicket.get(assignment.ticket_id) ?? [];
      list.push(assignment);
      assignmentsByTicket.set(assignment.ticket_id, list);
    }

    const itemsByTicket = new Map<string, Array<{
      id: string;
      kind: "activity" | "next_action";
      label: string;
      status: string;
      start_date: string;
      end_date: string | null;
      planned_hours: number;
      technicians: string[];
    }>>();
    for (const activity of activities) {
      const list = itemsByTicket.get(activity.ticket_id) ?? [];
      list.push({
        id: activity.id,
        kind: "activity",
        label: activity.description,
        status: activity.status,
        start_date: activity.date,
        end_date: activity.end_date,
        planned_hours: Number(activity.planned_hours) || 0,
        technicians: techsByActivity.get(activity.id) ?? [],
      });
      itemsByTicket.set(activity.ticket_id, list);
    }

    return jsonOk({
      tickets: tickets.map((ticket) => {
        const items = itemsByTicket.get(ticket.id) ?? [];
        if (ticket.next_action_date) {
          items.push({
            id: `next-${ticket.id}`,
            kind: "next_action",
            label: ticket.next_action?.trim() || "Próxima acción",
            status: ticket.status,
            start_date: ticket.next_action_date,
            end_date: ticket.next_action_date,
            planned_hours: 0,
            technicians: [],
          });
        }
        return { ...ticket, items, assignments: assignmentsByTicket.get(ticket.id) ?? [] };
      }),
      technicians,
    });
  } catch (err) {
    return jsonError("No se pudo generar el Gantt de tickets", 500, String(err));
  }
}
