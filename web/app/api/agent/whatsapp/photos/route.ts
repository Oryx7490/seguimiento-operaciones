import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId } from "@/app/lib/api";
import { authenticateAgent, unauthorized } from "@/app/lib/agent-auth";

export const runtime = "nodejs";

function parseTimestamp(value: string | null): Date | null | undefined {
  if (value == null || value.trim() === "") return null;
  const input = value.trim();
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(input)) return undefined;
  const parsed = new Date(input);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
}

function parsePage(request: NextRequest) {
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const rawOffset = request.nextUrl.searchParams.get("offset");
  const limit = rawLimit == null ? 50 : Number(rawLimit);
  const offset = rawOffset == null ? 0 : Number(rawOffset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return null;
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) return null;
  return { limit, offset };
}

export async function GET(request: NextRequest) {
  const identity = await authenticateAgent(request);
  if (!identity) return unauthorized();

  const params = request.nextUrl.searchParams;
  const page = parsePage(request);
  if (!page) return jsonError("limit debe ser 1–200 y offset un entero no negativo");

  const conversationId = params.get("conversation_id")?.trim() || null;
  if (conversationId && !parseId(conversationId)) return jsonError("conversation_id inválido");
  const q = params.get("q")?.trim() || null;
  const sender = params.get("sender")?.trim() || null;
  if (q && q.length > 200) return jsonError("q no puede exceder 200 caracteres");
  if (sender && sender.length > 128) return jsonError("sender no puede exceder 128 caracteres");

  const after = parseTimestamp(params.get("after"));
  const before = parseTimestamp(params.get("before"));
  if (after === undefined || before === undefined) {
    return jsonError("after y before deben ser fechas ISO 8601 válidas");
  }
  if (after && before && after >= before) return jsonError("after debe ser anterior a before");

  const where = [
    "c.is_group = true",
    "m.direction = 'inbound'",
    "mm.media_kind = 'image'",
    "mm.state = 'stored'",
    "mm.sha256 IS NOT NULL",
  ];
  const values: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    values.push(value);
    where.push(clause.replaceAll("$N", `$${values.length}`));
  };
  if (conversationId) add("c.id = $N::uuid", conversationId);
  if (q) add("(m.body_text ILIKE '%' || $N || '%' OR mm.file_name ILIKE '%' || $N || '%')", q);
  if (sender) add("(m.sender_id = $N OR m.sender_display_name ILIKE '%' || $N || '%')", sender);
  if (after) add("COALESCE(m.sent_at, m.received_at) >= $N::timestamptz", after);
  if (before) add("COALESCE(m.sent_at, m.received_at) < $N::timestamptz", before);
  const filter = where.join(" AND ");

  try {
    const countPromise = pool.query(
      `SELECT count(*)::int AS total
         FROM whatsapp_capture.message_media mm
         JOIN whatsapp_capture.messages m ON m.id = mm.message_id
         JOIN whatsapp_capture.conversations c ON c.id = m.conversation_id
        WHERE ${filter}`,
      values
    );
    const pageValues = [...values, page.limit, page.offset];
    const photosPromise = pool.query(
      `SELECT mm.id AS media_id, btrim(mm.sha256::text) AS sha256,
              mm.file_name, mm.content_type, mm.size_bytes,
              m.id AS message_id, m.body_text AS caption,
              m.sender_id, m.sender_display_name,
              COALESCE(m.sent_at, m.received_at) AS sent_at,
              c.id AS conversation_id, c.display_name AS conversation_name,
              '/api/agent/whatsapp/photos/' || btrim(mm.sha256::text) AS download_path
         FROM whatsapp_capture.message_media mm
         JOIN whatsapp_capture.messages m ON m.id = mm.message_id
         JOIN whatsapp_capture.conversations c ON c.id = m.conversation_id
        WHERE ${filter}
        ORDER BY COALESCE(m.sent_at, m.received_at) DESC, mm.ordinal
        LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
      pageValues
    );
    const [count, photos] = await Promise.all([countPromise, photosPromise]);
    return jsonOk({ photos: photos.rows, total: count.rows[0]?.total ?? 0, ...page });
  } catch {
    return jsonError("No se pudieron consultar las fotografías de WhatsApp", 500);
  }
}
