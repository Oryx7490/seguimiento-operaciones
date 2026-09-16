import pool from "@/app/lib/db";
import { jsonError, jsonOk } from "@/app/lib/api";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.channel, d.provider, d.provider_message_id, d.status,
              d.error_message, d.attempted_at,
              n.template, n.title, n.entity_type, n.entity_id,
              u.name AS recipient_name, u.email AS recipient_email
         FROM notification_deliveries d
         JOIN notifications n ON n.id = d.notification_id
         JOIN users u ON u.id = n.recipient_id
        ORDER BY d.attempted_at DESC
        LIMIT 100`
    );
    return jsonOk({ deliveries: rows });
  } catch (err) {
    return jsonError("No se pudo leer el registro de envíos", 500, String(err));
  }
}
