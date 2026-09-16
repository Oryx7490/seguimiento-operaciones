import pool from "@/app/lib/db";
import { getCurrentUserId, jsonError, jsonOk } from "@/app/lib/api";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return jsonError("No hay usuario actual", 404);
  try {
    const [list, unread] = await Promise.all([
      pool.query(
        `SELECT n.id, n.channel, n.title, n.body, n.template, n.entity_type, n.entity_id,
                n.status, n.read_at, n.created_at
           FROM notifications n
          WHERE n.recipient_id = $1 AND n.channel = 'system'
          ORDER BY (n.read_at IS NULL) DESC, n.created_at DESC
          LIMIT 100`,
        [userId]
      ),
      pool.query(
        `SELECT count(*)::int AS unread
           FROM notifications
          WHERE recipient_id = $1 AND channel = 'system' AND read_at IS NULL`,
        [userId]
      ),
    ]);
    return jsonOk({ notifications: list.rows, unread: unread.rows[0].unread });
  } catch (err) {
    return jsonError("No se pudieron leer las notificaciones", 500, String(err));
  }
}
