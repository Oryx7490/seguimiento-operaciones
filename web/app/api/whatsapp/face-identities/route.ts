import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT fi.id, fi.display_name, fi.technician_id, fi.user_id, fi.face_count, fi.updated_at,
              (SELECT count(*)::int FROM whatsapp_capture.face_assignments fa WHERE fa.identity_id = fi.id) AS assignments,
              (SELECT count(*)::int FROM whatsapp_capture.face_assignments fa WHERE fa.identity_id = fi.id AND fa.source = 'manual') AS confirmed_examples,
              (SELECT count(*)::int FROM whatsapp_capture.face_assignments fa WHERE fa.identity_id = fi.id AND fa.source = 'model') AS model_suggestions
         FROM whatsapp_capture.face_identities fi
        ORDER BY fi.face_count DESC, fi.display_name`
    );
    return jsonOk({ identities: rows });
  } catch (err) {
    return jsonError("No se pudieron leer las identidades", 500, String(err));
  }
}
