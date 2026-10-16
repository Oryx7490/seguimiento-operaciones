import type { PoolClient } from "pg";
import pool from "@/app/lib/db";

export const COMPANY_STATUSES = ["current", "former", "external", "unclassified"] as const;
export const ALIAS_TYPES = ["phone", "whatsapp_id", "display_name"] as const;
export const PHONE_CATEGORIES = ["primary", "permanent_secondary", "temporary", "previous"] as const;

export type AliasInput = {
  identifier_type: (typeof ALIAS_TYPES)[number];
  identifier_value: string;
  category: string;
  label: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_verified: boolean;
};

export function validIsoDate(value: unknown): string | null | undefined {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  if (!dateOnly && !timestamp) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString();
}

export function parseAlias(value: unknown): AliasInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const identifierType = body.identifier_type;
  const identifierValue = typeof body.identifier_value === "string" ? body.identifier_value.trim() : "";
  if (!ALIAS_TYPES.includes(identifierType as (typeof ALIAS_TYPES)[number]) || !identifierValue || identifierValue.length > 256) return null;
  const category = typeof body.category === "string" ? body.category : identifierType === "phone" ? "primary" : "identity";
  if (identifierType === "phone" && !PHONE_CATEGORIES.includes(category as (typeof PHONE_CATEGORIES)[number])) return null;
  if (identifierType !== "phone" && category !== "identity") return null;
  if (identifierType === "phone" && identifierValue.replace(/\D/g, "").length < 3) return null;
  const validFrom = validIsoDate(body.valid_from);
  const validTo = validIsoDate(body.valid_to);
  if (validFrom === undefined || validTo === undefined) return null;
  if (identifierType === "phone" && category === "previous" && !validTo) return null;
  if (validFrom && validTo && new Date(validTo) <= new Date(validFrom)) return null;
  return {
    identifier_type: identifierType as AliasInput["identifier_type"],
    identifier_value: identifierValue,
    category,
    label: typeof body.label === "string" ? body.label.trim().slice(0, 120) || null : null,
    valid_from: validFrom,
    valid_to: validTo,
    is_verified: typeof body.is_verified === "boolean" ? body.is_verified : true,
  };
}

export async function addAlias(
  client: PoolClient,
  participantId: string,
  alias: AliasInput,
  actorId: string | null,
  source: "manual" | "capture" | "legacy" | "import" = "manual"
) {
  const { rows } = await client.query(
    `INSERT INTO whatsapp_capture.participant_aliases
       (participant_id, identifier_type, identifier_value, category, label,
        valid_from, valid_to, is_verified, source, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, participant_id, identifier_type, identifier_value, normalized_value,
               category, label, valid_from, valid_to, is_verified, source, created_at`,
    [participantId, alias.identifier_type, alias.identifier_value, alias.category, alias.label,
      alias.valid_from, alias.valid_to, alias.is_verified, source, actorId]
  );
  await refreshMessagesForAlias(client, rows[0]);
  return rows[0];
}

export async function refreshMessagesForAlias(client: PoolClient, alias: {
  identifier_type: string;
  normalized_value: string;
}) {
  const idExpression = alias.identifier_type === "display_name"
    ? "whatsapp_capture.normalize_identity('display_name', m.sender_display_name)"
    : "whatsapp_capture.normalize_identity('whatsapp_id', m.sender_id)";
  const sourceExpression = alias.identifier_type === "display_name" ? "m.sender_display_name IS NOT NULL" : "m.sender_id IS NOT NULL";
  await client.query(
    `UPDATE whatsapp_capture.messages m
        SET participant_id = whatsapp_capture.resolve_participant(
          m.sender_id, m.sender_display_name, coalesce(m.sent_at, m.received_at)
        )
       WHERE ${sourceExpression}
         AND ${idExpression} = $1`,
    [alias.normalized_value]
  );
}

export async function listParticipants(q: string | null, limit: number, offset: number) {
  const filter = q ? `WHERE p.display_name ILIKE '%' || $1 || '%'
                      OR u.name ILIKE '%' || $1 || '%'
                      OR t.display_name ILIKE '%' || $1 || '%'
                      OR EXISTS (SELECT 1 FROM whatsapp_capture.participant_aliases ax
                                  WHERE ax.participant_id = p.id AND ax.identifier_value ILIKE '%' || $1 || '%')` : "";
  const params = q ? [q] : [];
  const [{ rows: participants }, { rows: total }] = await Promise.all([
    pool.query(
      `SELECT p.id, p.display_name, p.company_status, p.user_id, u.name AS user_name,
              p.technician_id, t.display_name AS technician_name, p.notes,
              p.created_at, p.updated_at,
              (SELECT count(*)::int FROM whatsapp_capture.messages m WHERE m.participant_id = p.id) AS message_count,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'id', a.id, 'identifier_type', a.identifier_type, 'identifier_value', a.identifier_value,
                'category', a.category, 'label', a.label, 'valid_from', a.valid_from,
                'valid_to', a.valid_to, 'is_verified', a.is_verified, 'source', a.source
              ) ORDER BY a.identifier_type, a.category, a.created_at)
                FROM whatsapp_capture.participant_aliases a WHERE a.participant_id = p.id), '[]'::jsonb) AS aliases
         FROM whatsapp_capture.participants p
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN technicians t ON t.id = p.technician_id
         ${filter}
        ORDER BY p.display_name, p.id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    pool.query(
      `SELECT count(*)::int AS total
         FROM whatsapp_capture.participants p
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN technicians t ON t.id = p.technician_id
         ${filter}`,
      params
    ),
  ]);
  return { participants, total: total[0]?.total ?? 0 };
}

export async function listUnresolvedSenders(q: string | null, limit: number) {
  const values: unknown[] = [];
  const clauses = ["c.is_group = true", "m.participant_id IS NULL", "(m.sender_id IS NOT NULL OR m.sender_display_name IS NOT NULL)"];
  if (q) {
    values.push(`%${q}%`);
    clauses.push(`(m.sender_id ILIKE $${values.length} OR m.sender_display_name ILIKE $${values.length})`);
  }
  values.push(limit);
  const { rows } = await pool.query(
    `SELECT m.sender_id, m.sender_display_name, count(*)::int AS message_count,
            min(coalesce(m.sent_at, m.received_at)) AS first_seen_at,
            max(coalesce(m.sent_at, m.received_at)) AS last_seen_at
       FROM whatsapp_capture.messages m
       JOIN whatsapp_capture.conversations c ON c.id = m.conversation_id
      WHERE ${clauses.join(" AND ")}
      GROUP BY m.sender_id, m.sender_display_name
      ORDER BY count(*) DESC, max(coalesce(m.sent_at, m.received_at)) DESC
      LIMIT $${values.length}`,
    values
  );
  return rows;
}

export async function isTechnicianUserPair(technicianId: string, userId: string) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM technicians WHERE id = $1 AND user_id = $2`,
    [technicianId, userId]
  );
  return rowCount === 1;
}
