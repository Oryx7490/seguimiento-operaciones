import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET() {
  try {
    const [senders, tags, conversations, stats] = await Promise.all([
      pool.query(
        `SELECT COALESCE(m.sender_id, m.sender_display_name) AS id, max(m.sender_display_name) AS name, count(*)::int AS count
           FROM whatsapp_capture.message_media mm
           JOIN whatsapp_capture.messages m ON m.id = mm.message_id
          WHERE ((mm.state = 'stored' AND mm.sha256 IS NOT NULL) OR mm.state = 'unavailable')
            AND COALESCE(m.sender_id, m.sender_display_name) IS NOT NULL
          GROUP BY COALESCE(m.sender_id, m.sender_display_name)
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
          WHERE ((mm.state = 'stored' AND mm.sha256 IS NOT NULL) OR mm.state = 'unavailable')
          GROUP BY c.id, c.display_name
          ORDER BY count DESC`
      ),
      pool.query(
        `WITH ranked AS (
           SELECT mm.state, mm.sha256, mm.media_kind, COALESCE(m.sent_at, m.received_at) AS at,
                  ROW_NUMBER() OVER (
                    PARTITION BY CASE
                      WHEN mm.media_kind = 'image' AND mm.sha256 IS NOT NULL THEN 'image:' || mm.sha256::text
                      ELSE 'appearance:' || mm.id::text
                    END
                    ORDER BY COALESCE(m.sent_at, m.received_at) DESC, mm.ordinal DESC, mm.id DESC
                  ) AS appearance_rank
             FROM whatsapp_capture.message_media mm
             JOIN whatsapp_capture.messages m ON m.id = mm.message_id
            WHERE ((mm.state = 'stored' AND mm.sha256 IS NOT NULL) OR mm.state = 'unavailable')
         )
         SELECT count(*)::int AS total,
                count(*) FILTER (WHERE state = 'unavailable')::int AS unavailable,
                count(*) FILTER (WHERE state = 'stored' AND sha256 IS NOT NULL)::int AS stored,
                min(at) AS earliest,
                max(at) AS latest
           FROM ranked
          WHERE appearance_rank = 1`
      ),
    ]);

    return jsonOk({
      senders: senders.rows,
      tags: tags.rows,
      conversations: conversations.rows,
      stats: stats.rows[0] ?? { total: 0, unavailable: 0, stored: 0, earliest: null, latest: null },
    });
  } catch (err) {
    return jsonError("No se pudieron leer los filtros", 500, String(err));
  }
}
