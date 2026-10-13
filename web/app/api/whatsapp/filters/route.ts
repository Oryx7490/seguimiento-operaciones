import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET() {
  try {
    const [senders, tags, conversations, stats] = await Promise.all([
      pool.query(
        `SELECT m.sender_id AS id, max(m.sender_display_name) AS name, count(*)::int AS count
           FROM whatsapp_capture.message_media mm
           JOIN whatsapp_capture.messages m ON m.id = mm.message_id
          WHERE mm.state = 'stored' AND mm.sha256 IS NOT NULL AND m.sender_id IS NOT NULL
          GROUP BY m.sender_id
          ORDER BY count DESC, name`
      ),
      pool.query(
        `SELECT min(t.tag) AS tag, lower(t.tag) AS key, count(*)::int AS count
           FROM whatsapp_capture.media_tags t
          GROUP BY lower(t.tag)
          ORDER BY count DESC, lower(t.tag)`
      ),
      pool.query(
        `SELECT c.id, c.display_name AS name, count(*)::int AS count
           FROM whatsapp_capture.message_media mm
           JOIN whatsapp_capture.messages m ON m.id = mm.message_id
           JOIN whatsapp_capture.conversations c ON c.id = m.conversation_id
          WHERE mm.state = 'stored' AND mm.sha256 IS NOT NULL
          GROUP BY c.id, c.display_name
          ORDER BY count DESC`
      ),
      pool.query(
        `SELECT count(*)::int AS total,
                min(COALESCE(m.sent_at, m.received_at)) AS earliest,
                max(COALESCE(m.sent_at, m.received_at)) AS latest
           FROM whatsapp_capture.message_media mm
           JOIN whatsapp_capture.messages m ON m.id = mm.message_id
          WHERE mm.state = 'stored' AND mm.sha256 IS NOT NULL`
      ),
    ]);

    return jsonOk({
      senders: senders.rows,
      tags: tags.rows,
      conversations: conversations.rows,
      stats: stats.rows[0] ?? { total: 0, earliest: null, latest: null },
    });
  } catch (err) {
    return jsonError("No se pudieron leer los filtros", 500, String(err));
  }
}
