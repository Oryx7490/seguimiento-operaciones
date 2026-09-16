import pool from "@/app/lib/db";
import { getCurrentUserId, jsonError, jsonOk } from "@/app/lib/api";

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return jsonError("No hay usuario actual", 404);
  try {
    const { rowCount } = await pool.query(
      `UPDATE notifications
          SET read_at = now(), status = 'read'
        WHERE recipient_id = $1 AND channel = 'system' AND read_at IS NULL`,
      [userId]
    );
    return jsonOk({ marked: rowCount });
  } catch (err) {
    return jsonError("No se pudieron marcar como leídas", 500, String(err));
  }
}
