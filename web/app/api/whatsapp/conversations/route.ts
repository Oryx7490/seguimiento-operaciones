import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.account_id, c.remote_chat_id, c.display_name, c.is_group, c.last_message_at,
              count(DISTINCT m.id)::int AS message_count,
              count(DISTINCT mm.sha256)::int AS media_count,
              max(COALESCE(m.sent_at, m.received_at)) AS last_at
         FROM whatsapp_capture.conversations c
         LEFT JOIN whatsapp_capture.messages m ON m.conversation_id = c.id
         LEFT JOIN whatsapp_capture.message_media mm ON mm.message_id = m.id AND mm.sha256 IS NOT NULL
        GROUP BY c.id
        ORDER BY last_at DESC NULLS LAST`
    );
    return jsonOk({ conversations: rows });
  } catch (err) {
    return jsonError("No se pudieron leer las conversaciones", 500, String(err));
  }
}
