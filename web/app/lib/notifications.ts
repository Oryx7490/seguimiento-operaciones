import pool from "@/app/lib/db";

export type Channel = "system" | "email" | "whatsapp";
export type EntityType = "project" | "ticket" | "activity";

export type SettingValue = string | number | boolean | string[] | null;

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

export function renderTemplate(
  body: string,
  vars: Record<string, string | number | boolean | null | undefined>
): string {
  return body.replace(VAR_RE, (_m, key: string) => {
    const value = vars[key.toLowerCase()];
    return value === null || value === undefined ? "" : String(value);
  });
}

export async function getSettings(): Promise<Record<string, unknown>> {
  const { rows } = await pool.query<{ key: string; value: unknown }>(
    `SELECT key, value FROM app_settings`
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function asStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return fallback;
}

interface TemplateRow {
  channel: Channel;
  subject: string | null;
  body: string;
}

export async function getTemplates(code: string): Promise<Map<Channel, TemplateRow>> {
  const { rows } = await pool.query<TemplateRow>(
    `SELECT channel, subject, body FROM notification_templates WHERE code = $1 AND active`,
    [code]
  );
  return new Map(rows.map((r) => [r.channel, r]));
}

export interface RecipientChannel {
  user_id: string;
  email: string | null;
  phone: string | null;
  role: string;
}

export async function listActiveUsers(): Promise<RecipientChannel[]> {
  const { rows } = await pool.query<RecipientChannel>(
    `SELECT u.id AS user_id, u.email, t.phone, u.role::text AS role
       FROM users u
       LEFT JOIN technicians t ON t.user_id = u.id
      WHERE u.active`
  );
  return rows;
}

export function pickRecipients(
  pool: RecipientChannel[],
  roles: string[],
  extraUserId: string | null
): RecipientChannel[] {
  const chosen = pool.filter((u) => roles.includes(u.role));
  if (extraUserId) {
    const extra = pool.find((u) => u.user_id === extraUserId);
    if (extra && !chosen.some((u) => u.user_id === extra.user_id)) chosen.push(extra);
  }
  return chosen;
}

export interface EmitOptions {
  rule: string;
  entity_type: EntityType;
  entity_id: string;
  recipients: RecipientChannel[];
  vars: Record<string, string | number | boolean | null | undefined>;
  link: string;
  channels: Channel[];
  dedup?: boolean;
  cooldownHours?: number;
}

export interface EmitResult {
  inserted: number;
  skipped: boolean;
}

export async function emitAlert(opts: EmitOptions): Promise<EmitResult> {
  const dedupKey = `${opts.rule}:${opts.entity_type}:${opts.entity_id}`;
  const cooldown = opts.cooldownHours ?? 0;

  if (opts.dedup !== false && cooldown > 0) {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM notifications
        WHERE dedup_key = $1 AND created_at > now() - make_interval(hours => $2::int)
        LIMIT 1`,
      [dedupKey, Math.round(cooldown)]
    );
    if (rowCount) return { inserted: 0, skipped: true };
  }

  const templates = await getTemplates(opts.rule);
  if (templates.size === 0) return { inserted: 0, skipped: false };

  const vars = { ...opts.vars, link: opts.link };
  let inserted = 0;

  for (const recipient of opts.recipients) {
    for (const channel of opts.channels) {
      if (channel === "email" && !recipient.email) continue;
      if (channel === "whatsapp" && !recipient.phone) continue;
      const tpl = templates.get(channel);
      if (!tpl) continue;
      const body = renderTemplate(tpl.body, vars);
      const subject = tpl.subject ? renderTemplate(tpl.subject, vars) : null;
      const isSystem = channel === "system";
      await pool.query(
        `INSERT INTO notifications
           (recipient_id, entity_type, entity_id, channel, title, body, template, payload,
            scheduled_at, sent_at, status, dedup_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), $9, $10, $11)`,
        [
          recipient.user_id,
          opts.entity_type,
          opts.entity_id,
          channel,
          subject,
          body,
          opts.rule,
          JSON.stringify({ ...vars, email: recipient.email, phone: recipient.phone }),
          isSystem ? new Date() : null,
          isSystem ? "sent" : "pending",
          dedupKey,
        ]
      );
      inserted++;
    }
  }
  return { inserted, skipped: false };
}

/* ── Entrega ─────────────────────────────────────────────── */

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export function emailConfig(): EmailConfig | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT ?? 1025);
  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS || undefined,
    from: process.env.SMTP_FROM || "Seguimiento Ops <no-reply@localhost>",
  };
}

export function whatsappConfig(): { token: string; phoneId: string } | null {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return null;
  return { token, phoneId };
}

interface PendingNotification {
  id: string;
  recipient_id: string;
  channel: Channel;
  title: string | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  attempts: number;
  email: string | null;
  phone: string | null;
}

async function sendEmail(
  cfg: EmailConfig,
  to: string,
  subject: string,
  text: string
): Promise<{ providerId: string | null }> {
  const { createTransport } = await import("nodemailer");
  const transport = createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  const info = await transport.sendMail({ from: cfg.from, to, subject, text });
  return { providerId: info.messageId ?? null };
}

async function sendWhatsApp(
  cfg: { token: string; phoneId: string },
  to: string,
  text: string
): Promise<{ providerId: string | null }> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${cfg.phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  const data = (await res.json().catch(() => null)) as
    | { messages?: { id?: string }[]; error?: { message?: string } }
    | null;
  if (!res.ok) throw new Error(data?.error?.message ?? `WhatsApp HTTP ${res.status}`);
  return { providerId: data?.messages?.[0]?.id ?? null };
}

const MAX_ATTEMPTS = 3;

export async function processPendingDeliveries(limit = 20): Promise<{ sent: number; failed: number }> {
  const { rows } = await pool.query<PendingNotification>(
    `SELECT n.id, n.recipient_id, n.channel, n.title, n.body, n.payload, n.attempts,
            u.email, t.phone
       FROM notifications n
       JOIN users u ON u.id = n.recipient_id
       LEFT JOIN technicians t ON t.user_id = u.id
      WHERE n.status = 'pending' AND n.channel IN ('email','whatsapp')
      ORDER BY n.created_at ASC
      LIMIT $1`,
    [limit]
  );

  const email = emailConfig();
  const whatsapp = whatsappConfig();
  let sent = 0;
  let failed = 0;

  for (const n of rows) {
    await pool.query(`UPDATE notifications SET status = 'sending' WHERE id = $1`, [n.id]);
    const attemptedAt = new Date();
    let provider: string | null = null;
    let providerId: string | null = null;
    let error: string | null = null;

    try {
      if (n.channel === "email") {
        if (!email) throw new Error("SMTP no configurado");
        if (!n.email) throw new Error("El destinatario no tiene correo");
        provider = "smtp";
        const r = await sendEmail(email, n.email, n.title ?? "Alerta de seguimiento", n.body ?? "");
        providerId = r.providerId;
      } else if (n.channel === "whatsapp") {
        if (!whatsapp) throw new Error("WhatsApp no configurado");
        if (!n.phone) throw new Error("El destinatario no tiene teléfono");
        provider = "whatsapp_cloud";
        const r = await sendWhatsApp(whatsapp, n.phone, n.body ?? "");
        providerId = r.providerId;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const attempts = n.attempts + 1;
    const status = error ? (attempts >= MAX_ATTEMPTS ? "failed" : "pending") : "sent";

    await pool.query(
      `UPDATE notifications
          SET status = $2, attempts = $3, error_message = $4, sent_at = $5
        WHERE id = $1`,
      [n.id, status, attempts, error, error ? null : attemptedAt]
    );
    await pool.query(
      `INSERT INTO notification_deliveries
         (notification_id, channel, provider, provider_message_id, status, error_message, attempted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [n.id, n.channel, provider, providerId, error ? "failed" : "sent", error, attemptedAt]
    );
    if (error) failed++;
    else sent++;
  }

  return { sent, failed };
}

export async function createInboxNotification(input: {
  recipient_id: string;
  entity_type: EntityType;
  entity_id: string;
  title: string;
  body: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (recipient_id, entity_type, entity_id, channel, title, body, status, sent_at)
     VALUES ($1,$2,$3,'system',$4,$5,'sent', now())`,
    [input.recipient_id, input.entity_type, input.entity_id, input.title, input.body]
  );
}
