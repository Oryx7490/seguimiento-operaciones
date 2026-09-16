import pool from "@/app/lib/db";
import {
  asBool,
  asNumber,
  asStringArray,
  emitAlert,
  getSettings,
  listActiveUsers,
  pickRecipients,
  processPendingDeliveries,
  type Channel,
  type RecipientChannel,
} from "@/app/lib/notifications";

const BASE_URL = process.env.APP_BASE_URL || "http://localhost:8080";

interface Common {
  channels: Channel[];
  roles: string[];
  cooldown: number;
  users: RecipientChannel[];
}

async function emit(
  common: Common,
  input: {
    rule: string;
    entity_type: "project" | "ticket" | "activity";
    entity_id: string;
    coordinator_id: string | null;
    vars: Record<string, string | number | boolean | null>;
    path: string;
  }
): Promise<number> {
  const recipients = pickRecipients(common.users, common.roles, input.coordinator_id);
  if (recipients.length === 0) return 0;
  const { inserted } = await emitAlert({
    rule: input.rule,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    recipients,
    vars: input.vars,
    link: `${BASE_URL}${input.path}`,
    channels: common.channels,
    dedup: true,
    cooldownHours: common.cooldown,
  });
  return inserted;
}

/* ── Reglas ─────────────────────────────────────────────── */

async function ticketUnassigned(settings: Record<string, unknown>, common: Common) {
  const hours = Math.round(asNumber(settings.alert_ticket_unassigned_hours, 4));
  const { rows } = await pool.query(
    `SELECT t.id, t.code, t.title, t.coordinator_id,
            floor(extract(epoch FROM (now() - t.opened_at)) / 3600)::int AS hours
       FROM tickets t
      WHERE t.status IN ('new', 'to_review', 'unassigned')
        AND NOT EXISTS (SELECT 1 FROM assignments a
                         WHERE a.ticket_id = t.id AND a.unassigned_at IS NULL)
        AND t.opened_at < now() - make_interval(hours => $1::int)`,
    [hours]
  );
  let n = 0;
  for (const r of rows) {
    n += await emit(common, {
      rule: "ticket_unassigned",
      entity_type: "ticket",
      entity_id: r.id,
      coordinator_id: r.coordinator_id,
      vars: { code: r.code, title: r.title, hours: r.hours },
      path: `/tickets/${r.id}`,
    });
  }
  return n;
}

async function ticketNoUpdate(settings: Record<string, unknown>, common: Common) {
  const days = Math.round(asNumber(settings.alert_ticket_no_update_days, 3));
  const { rows } = await pool.query(
    `SELECT t.id, t.code, t.title, t.coordinator_id,
            floor(extract(epoch FROM (now() - t.last_activity_at)) / 86400)::int AS days
       FROM tickets t
      WHERE t.status NOT IN ('closed', 'cancelled', 'resolved_pending_validation')
        AND t.last_activity_at < now() - make_interval(days => $1::int)`,
    [days]
  );
  let n = 0;
  for (const r of rows) {
    n += await emit(common, {
      rule: "ticket_no_update",
      entity_type: "ticket",
      entity_id: r.id,
      coordinator_id: r.coordinator_id,
      vars: { code: r.code, title: r.title, days: r.days },
      path: `/tickets/${r.id}`,
    });
  }
  return n;
}

async function projectBlocked(settings: Record<string, unknown>, common: Common) {
  const hours = Math.round(asNumber(settings.alert_project_blocked_no_next_action_hours, 24));
  const { rows } = await pool.query(
    `SELECT p.id, p.code, p.name, p.coordinator_id
       FROM projects p
      WHERE p.health_status = 'blocked'
        AND (p.next_action IS NULL OR btrim(p.next_action) = '')
        AND p.status <> 'cancelled'
        AND p.updated_at < now() - make_interval(hours => $1::int)`,
    [hours]
  );
  let n = 0;
  for (const r of rows) {
    n += await emit(common, {
      rule: "project_blocked_no_next_action",
      entity_type: "project",
      entity_id: r.id,
      coordinator_id: r.coordinator_id,
      vars: { code: r.code, name: r.name },
      path: `/proyectos/${r.id}`,
    });
  }
  return n;
}

async function activityOverdue(settings: Record<string, unknown>, common: Common) {
  if (!asBool(settings.alert_activity_overdue_enabled, true)) return 0;
  const { rows } = await pool.query(
    `SELECT a.id, to_char(a.date, 'YYYY-MM-DD') AS date,
            COALESCE(NULLIF(btrim(a.description), ''), 'Actividad') AS title
       FROM activities a
      WHERE a.status = 'planned' AND a.date < current_date`
  );
  let n = 0;
  for (const r of rows) {
    n += await emit(common, {
      rule: "activity_overdue",
      entity_type: "activity",
      entity_id: r.id,
      coordinator_id: null,
      vars: { title: r.title, date: r.date },
      path: `/`,
    });
  }
  return n;
}

async function installationNoDeliverySheet(settings: Record<string, unknown>, common: Common) {
  const days = Math.round(asNumber(settings.alert_installation_no_delivery_sheet_days, 2));
  const { rows } = await pool.query(
    `SELECT p.id, p.code, p.name, p.coordinator_id
       FROM projects p
       JOIN project_phases ph
         ON ph.project_id = p.id AND ph.name = 'Instalación' AND ph.status = 'completed'
      WHERE p.status NOT IN ('closed', 'cancelled')
        AND COALESCE(ph.actual_end_date, ph.planned_end_date) IS NOT NULL
        AND COALESCE(ph.actual_end_date, ph.planned_end_date) < current_date - $1::int
        AND NOT EXISTS (
          SELECT 1 FROM project_closures pc
           WHERE pc.project_id = p.id AND pc.delivery_sheet_attachment_id IS NOT NULL)`,
    [days]
  );
  let n = 0;
  for (const r of rows) {
    n += await emit(common, {
      rule: "installation_no_delivery_sheet",
      entity_type: "project",
      entity_id: r.id,
      coordinator_id: r.coordinator_id,
      vars: { code: r.code, name: r.name },
      path: `/proyectos/${r.id}`,
    });
  }
  return n;
}

async function ticketResolvedUnvalidated(settings: Record<string, unknown>, common: Common) {
  const days = Math.round(asNumber(settings.alert_ticket_resolved_unvalidated_days, 2));
  const { rows } = await pool.query(
    `SELECT t.id, t.code, t.title, t.coordinator_id,
            floor(extract(epoch FROM (now() - COALESCE(t.resolved_at, t.updated_at))) / 86400)::int AS days
       FROM tickets t
      WHERE t.status = 'resolved_pending_validation'
        AND COALESCE(t.resolved_at, t.updated_at) < now() - make_interval(days => $1::int)`,
    [days]
  );
  let n = 0;
  for (const r of rows) {
    n += await emit(common, {
      rule: "ticket_resolved_unvalidated",
      entity_type: "ticket",
      entity_id: r.id,
      coordinator_id: r.coordinator_id,
      vars: { code: r.code, title: r.title, days: r.days },
      path: `/tickets/${r.id}`,
    });
  }
  return n;
}

async function nextActionOverdue(settings: Record<string, unknown>, common: Common) {
  if (!asBool(settings.alert_next_action_overdue_enabled, true)) return 0;
  let n = 0;

  const projects = await pool.query(
    `SELECT p.id, p.code, p.name, p.coordinator_id, to_char(p.next_action_date, 'YYYY-MM-DD') AS date
       FROM projects p
      WHERE p.next_action_date < current_date
        AND p.next_action IS NOT NULL AND btrim(p.next_action) <> ''
        AND p.status NOT IN ('closed', 'cancelled')`
  );
  for (const r of projects.rows) {
    n += await emit(common, {
      rule: "next_action_overdue",
      entity_type: "project",
      entity_id: r.id,
      coordinator_id: r.coordinator_id,
      vars: { code: r.code, title: r.name, date: r.date },
      path: `/proyectos/${r.id}`,
    });
  }

  const tickets = await pool.query(
    `SELECT t.id, t.code, t.title, t.coordinator_id, to_char(t.next_action_date, 'YYYY-MM-DD') AS date
       FROM tickets t
      WHERE t.next_action_date < current_date
        AND t.next_action IS NOT NULL AND btrim(t.next_action) <> ''
        AND t.status NOT IN ('closed', 'cancelled')`
  );
  for (const r of tickets.rows) {
    n += await emit(common, {
      rule: "next_action_overdue",
      entity_type: "ticket",
      entity_id: r.id,
      coordinator_id: r.coordinator_id,
      vars: { code: r.code, title: r.title, date: r.date },
      path: `/tickets/${r.id}`,
    });
  }
  return n;
}

async function hoursOverPlanned(settings: Record<string, unknown>, common: Common) {
  const percent = asNumber(settings.alert_hours_over_planned_percent, 20);
  const { rows } = await pool.query(
    `SELECT p.id, p.code, p.name, p.coordinator_id,
            COALESCE(pl.h, 0)::numeric AS planned_hours,
            COALESCE(re.h, 0)::numeric AS real_hours,
            round((COALESCE(re.h, 0) / NULLIF(pl.h, 0) - 1) * 100)::int AS percent
       FROM projects p
       LEFT JOIN (
         SELECT ap.project_id, SUM(a.planned_hours) AS h
           FROM activity_projects ap JOIN activities a ON a.id = ap.activity_id
          GROUP BY ap.project_id) pl ON pl.project_id = p.id
       LEFT JOIN (
         SELECT ap.project_id, SUM(te.duration_hours) AS h
           FROM activity_projects ap JOIN time_entries te ON te.activity_id = ap.activity_id
          GROUP BY ap.project_id) re ON re.project_id = p.id
      WHERE p.status NOT IN ('closed', 'cancelled')
        AND COALESCE(pl.h, 0) > 0
        AND COALESCE(re.h, 0) > COALESCE(pl.h, 0) * (1 + $1::numeric / 100)`,
    [percent]
  );
  let n = 0;
  for (const r of rows) {
    n += await emit(common, {
      rule: "hours_over_planned",
      entity_type: "project",
      entity_id: r.id,
      coordinator_id: r.coordinator_id,
      vars: {
        code: r.code,
        name: r.name,
        percent: r.percent,
        hours: r.real_hours,
        planned_hours: r.planned_hours,
      },
      path: `/proyectos/${r.id}`,
    });
  }
  return n;
}

/* ── Orquestación ───────────────────────────────────────── */

export interface ScanResult {
  alerts: number;
  delivered: { sent: number; failed: number };
}

export async function runAlertScan(): Promise<ScanResult> {
  const settings = await getSettings();
  const common: Common = {
    channels: asStringArray(settings.alert_channels, ["system", "email"]) as Channel[],
    roles: asStringArray(settings.alert_recipient_roles, ["coordinator", "admin"]),
    cooldown: asNumber(settings.alert_cooldown_hours, 24),
    users: await listActiveUsers(),
  };

  let alerts = 0;
  for (const rule of [
    ticketUnassigned,
    ticketNoUpdate,
    projectBlocked,
    activityOverdue,
    installationNoDeliverySheet,
    ticketResolvedUnvalidated,
    nextActionOverdue,
    hoursOverPlanned,
  ]) {
    try {
      alerts += await rule(settings, common);
    } catch (err) {
      console.error(`[alerts] regla ${rule.name} falló:`, err);
    }
  }

  const delivered = await processPendingDeliveries();
  return { alerts, delivered };
}
