import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  const sp = request.nextUrl.searchParams;
  const from = sp.get("from")?.trim() || null;
  const to = sp.get("to")?.trim() || null;
  const sender = sp.get("sender")?.trim() || null;
  const q = sp.get("q")?.trim() || null;
  const limitRaw = Number(sp.get("limit"));
  const offsetRaw = Number(sp.get("offset"));
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 100;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;

  const where: string[] = ["m.conversation_id = $1"];
  const vals: unknown[] = [id];
  const add = (clause: string, value: unknown) => {
    vals.push(value);
    where.push(clause.replaceAll("$N", `$${vals.length}`));
  };
  if (from) add("(COALESCE(m.sent_at, m.received_at) AT TIME ZONE 'America/Mexico_City')::date >= $N::date", from);
  if (to) add("(COALESCE(m.sent_at, m.received_at) AT TIME ZONE 'America/Mexico_City')::date <= $N::date", to);
  if (sender) add("(m.sender_id = $N OR m.sender_display_name ILIKE '%' || $N || '%')", sender);
  if (q) add("m.body_text ILIKE '%' || $N || '%'", q);
  vals.push(limit, offset);

  try {
    const { rows } = await pool.query(
      `SELECT m.id, m.external_message_id, m.direction, m.sender_id, m.sender_display_name,
              m.body_text, m.message_kind, COALESCE(m.sent_at, m.received_at) AS at,
              m.delivery_status,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'media_id', mm.id, 'sha256', mm.sha256, 'media_kind', mm.media_kind,
                  'file_name', mm.file_name, 'content_type', mm.content_type, 'state', mm.state,
                  'missing_reason', CASE WHEN mm.state = 'unavailable' THEN COALESCE(mm.last_error, 'media_unavailable') ELSE NULL END
                ) ORDER BY mm.ordinal)
                  FROM whatsapp_capture.message_media mm WHERE mm.message_id = m.id
              ), '[]'::json) AS attachments,
              count(*) OVER() AS total
         FROM whatsapp_capture.messages m
        WHERE ${where.join(" AND ")}
        ORDER BY COALESCE(m.sent_at, m.received_at) DESC
        LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
      vals
    );
    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    const messages = rows.map(({ total: _total, ...r }) => r);
    return jsonOk({ messages, total, limit, offset });
  } catch (err) {
    return jsonError("No se pudieron leer los mensajes", 500, String(err));
  }
}
