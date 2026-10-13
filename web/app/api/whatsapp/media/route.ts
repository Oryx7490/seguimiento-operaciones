import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

const ALLOWED_KINDS = new Set(["image", "video", "audio", "document", "sticker", "other"]);

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from")?.trim() || null;
  const to = sp.get("to")?.trim() || null;
  const sender = sp.get("sender")?.trim() || null;
  const conversation = sp.get("conversation")?.trim() || null;
  const tag = sp.get("tag")?.trim() || null;
  const q = sp.get("q")?.trim() || null;
  const kind = sp.get("kind")?.trim() || null;
  const favorite = sp.get("favorite") === "true";
  const archived = sp.get("archived")?.trim() || null;

  const limitRaw = Number(sp.get("limit"));
  const offsetRaw = Number(sp.get("offset"));
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 60;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;

  if (kind && !ALLOWED_KINDS.has(kind)) return jsonError("kind inválido");

  const where: string[] = ["mm.state = 'stored'", "mm.sha256 IS NOT NULL"];
  const vals: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    vals.push(value);
    where.push(clause.replaceAll("$N", `$${vals.length}`));
  };

  if (kind) add("mm.media_kind = $N::whatsapp_capture.media_kind", kind);
  if (favorite) where.push("mo.is_favorite = true");
  if (archived === "true") where.push("mo.is_archived = true");
  else if (archived !== "all") where.push("mo.is_archived = false");
  if (from) add("(COALESCE(m.sent_at, m.received_at) AT TIME ZONE 'America/Mexico_City')::date >= $N::date", from);
  if (to) add("(COALESCE(m.sent_at, m.received_at) AT TIME ZONE 'America/Mexico_City')::date <= $N::date", to);
  if (sender) add("m.sender_id = $N", sender);
  if (conversation) add("c.id = $N::uuid", conversation);
  if (tag) add("EXISTS (SELECT 1 FROM whatsapp_capture.media_tags t WHERE t.sha256 = mm.sha256 AND lower(t.tag) = lower($N))", tag);
  if (q) {
    add(
      "(m.body_text ILIKE '%' || $N || '%' OR mm.file_name ILIKE '%' || $N || '%' OR m.sender_display_name ILIKE '%' || $N || '%' OR EXISTS (SELECT 1 FROM whatsapp_capture.media_analyses a WHERE a.sha256 = mm.sha256 AND a.analysis_type = 'ocr' AND a.result->>'text' ILIKE '%' || $N || '%'))",
      q
    );
  }

  vals.push(limit, offset);

  try {
    const { rows } = await pool.query(
      `SELECT mm.id AS media_id, mm.sha256, mm.file_name, mm.media_kind, mm.content_type, mm.size_bytes,
              m.id AS message_id, m.sender_id, m.sender_display_name, m.direction, m.body_text AS caption,
              COALESCE(m.sent_at, m.received_at) AS at,
              c.id AS conversation_id, c.display_name AS conversation_name, c.is_group,
              mo.note, mo.is_favorite, mo.is_archived,
              COALESCE((
                SELECT json_agg(t.tag ORDER BY lower(t.tag))
                  FROM whatsapp_capture.media_tags t WHERE t.sha256 = mm.sha256
              ), '[]'::json) AS tags,
              COALESCE((
                SELECT json_agg(x ORDER BY x->>'label')
                FROM (
                  SELECT json_build_object('type','project','id',pr.id,'label', pr.code || ' · ' || pr.name) AS x
                    FROM whatsapp_capture.message_entity_links l
                    JOIN projects pr ON pr.id = l.project_id
                   WHERE l.message_id = m.id AND l.status IN ('suggested','confirmed')
                  UNION ALL
                  SELECT json_build_object('type','ticket','id',tk.id,'label', tk.code || ' · ' || tk.title) AS x
                    FROM whatsapp_capture.message_entity_links l
                    JOIN tickets tk ON tk.id = l.ticket_id
                   WHERE l.message_id = m.id AND l.status IN ('suggested','confirmed')
                ) s
              ), '[]'::json) AS links,
              count(*) OVER() AS total
         FROM whatsapp_capture.message_media mm
         JOIN whatsapp_capture.messages m ON m.id = mm.message_id
         JOIN whatsapp_capture.conversations c ON c.id = m.conversation_id
         LEFT JOIN whatsapp_capture.media_objects mo ON mo.sha256 = mm.sha256
        WHERE ${where.join(" AND ")}
        ORDER BY COALESCE(m.sent_at, m.received_at) DESC, mm.ordinal
        LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
      vals
    );
    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    const items = rows.map(({ total: _total, ...r }) => r);
    return jsonOk({ items, total, limit, offset });
  } catch (err) {
    return jsonError("No se pudieron leer las fotografías", 500, String(err));
  }
}
