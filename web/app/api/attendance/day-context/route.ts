import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Contexto para cerrar/verificar un día de un técnico: la entrada registrada,
 * las fotos de candidatos cercanos y los mensajes del remitente para estimar la hora.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const technicianId = sp.get("technician_id")?.trim() || null;
  const date = sp.get("date")?.trim() || null;
  if (!technicianId || !parseId(technicianId)) return jsonError("technician_id inválido");
  if (!date || !DATE_RE.test(date)) return jsonError("date inválida");

  try {
    const tech = await pool.query(`SELECT id, display_name FROM technicians WHERE id = $1`, [technicianId]);
    if (tech.rowCount === 0) return jsonError("Técnico no encontrado", 404);

    const [entry, candidates, messages] = await Promise.all([
      pool.query(
        `SELECT to_char(date, 'YYYY-MM-DD') AS date,
                to_char(check_in, 'HH24:MI') AS check_in,
                to_char(check_out, 'HH24:MI') AS check_out,
                hours, overtime, manual, overnight, exit_offset_days, person_name
           FROM attendance_entries WHERE technician_id = $1 AND date = $2::date`,
        [technicianId, date]
      ),
      pool.query(
        `SELECT c.sha256, to_char(c.event_date, 'YYYY-MM-DD') AS event_date,
                to_char(c.event_time, 'HH24:MI') AS event_time,
                to_char(c.shift_in, 'HH24:MI') AS shift_in,
                to_char(c.shift_out, 'HH24:MI') AS shift_out,
                c.event_type, c.status, c.sender_display_name,
                (SELECT m.body_text FROM whatsapp_capture.message_media mm
                   JOIN whatsapp_capture.messages m ON m.id = mm.message_id
                  WHERE mm.id = c.message_media_id) AS caption
           FROM attendance_candidates c
          WHERE (c.technician_id = $1
                 OR c.sender_id IN (SELECT sender_id FROM whatsapp_capture.technician_contacts WHERE technician_id = $1))
            AND COALESCE(c.event_date, (c.created_at AT TIME ZONE 'America/Mexico_City')::date) BETWEEN $2::date - 1 AND $2::date + 1
          ORDER BY COALESCE(c.event_date, (c.created_at AT TIME ZONE 'America/Mexico_City')::date), c.created_at`,
        [technicianId, date]
      ),
      pool.query(
        `SELECT to_char(COALESCE(m.sent_at, m.received_at) AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD') AS date,
                to_char(COALESCE(m.sent_at, m.received_at) AT TIME ZONE 'America/Mexico_City', 'HH24:MI') AS at,
                m.body_text
           FROM whatsapp_capture.messages m
          WHERE m.sender_id IN (SELECT sender_id FROM whatsapp_capture.technician_contacts WHERE technician_id = $1)
            AND (COALESCE(m.sent_at, m.received_at) AT TIME ZONE 'America/Mexico_City')::date BETWEEN $2::date - 1 AND $2::date + 1
          ORDER BY m.received_at`,
        [technicianId, date]
      ),
    ]);

    return jsonOk({
      technician: { id: tech.rows[0].id, display_name: tech.rows[0].display_name },
      entry: entry.rows[0] ?? null,
      candidates: candidates.rows,
      messages: messages.rows,
    });
  } catch (err) {
    return jsonError("No se pudo leer el contexto del día", 500, String(err));
  }
}
