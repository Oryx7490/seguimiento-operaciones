import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId, getCurrentUserId } from "@/app/lib/api";
import { asNumber, getSettings } from "@/app/lib/notifications";
import { recomputeDay, recomputeOvertime } from "@/app/lib/attendance";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHOTO_TYPES = new Set(["entrada", "salida"]);

/** Entradas de asistencia de un técnico en un rango, con las fotos que las respaldan. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const technicianId = sp.get("technician_id")?.trim() || null;
  const date = sp.get("date")?.trim() || null;
  const from = sp.get("from")?.trim() || null;
  const to = sp.get("to")?.trim() || null;

  if (!technicianId || !parseId(technicianId)) return jsonError("technician_id inválido");
  if (date && !DATE_RE.test(date)) return jsonError("date inválida");
  if (from && !DATE_RE.test(from)) return jsonError("from inválido");
  if (to && !DATE_RE.test(to)) return jsonError("to inválido");

  try {
    const tech = await pool.query(`SELECT id, display_name FROM technicians WHERE id = $1`, [technicianId]);
    if (tech.rowCount === 0) return jsonError("Técnico no encontrado", 404);

    const where: string[] = ["e.technician_id = $1"];
    const vals: unknown[] = [technicianId];
    if (date) {
      vals.push(date);
      where.push(`e.date = $${vals.length}::date`);
    } else if (from) {
      vals.push(from);
      where.push(`e.date >= $${vals.length}::date`);
    }
    if (to) {
      vals.push(to);
      where.push(`e.date <= $${vals.length}::date`);
    }

    const { rows } = await pool.query(
      `SELECT e.id,
              to_char(e.date, 'YYYY-MM-DD') AS date,
              to_char(e.check_in, 'HH24:MI') AS check_in,
              to_char(e.check_out, 'HH24:MI') AS check_out,
              e.hours, e.overtime, e.overnight, e.exit_offset_days, e.person_name, e.manual,
              COALESCE((
                SELECT json_agg(json_build_object(
                         'id', c.id,
                         'sha256', c.sha256,
                         'event_type', c.event_type,
                         'event_time', to_char(c.event_time, 'HH24:MI'),
                         'image_time', to_char(c.image_time, 'HH24:MI'),
                         'image_date', to_char(c.image_date, 'YYYY-MM-DD'),
                         'shift_in', to_char(c.shift_in, 'HH24:MI'),
                         'shift_out', to_char(c.shift_out, 'HH24:MI'),
                         'event_date', to_char(c.event_date, 'YYYY-MM-DD'),
                         'sender', c.sender_display_name,
                         'location', c.location,
                         'app', c.app,
                         'code', c.code,
                         'confidence', c.confidence,
                         'manual_override', c.manual_override,
                         'caption', (SELECT m.body_text FROM whatsapp_capture.message_media mm
                                       JOIN whatsapp_capture.messages m ON m.id = mm.message_id
                                      WHERE mm.id = c.message_media_id)
                       ) ORDER BY c.event_date NULLS LAST, c.created_at)
                  FROM attendance_segments s
                  JOIN attendance_candidates c ON c.id = s.candidate_id OR c.segment_id = s.id
                 WHERE s.technician_id = e.technician_id AND s.date = e.date
              ), '[]'::json) AS photos
         FROM attendance_entries e
        WHERE ${where.join(" AND ")}
        ORDER BY e.date DESC`,
      vals
    );

    if (rows.length > 0) {
      const reviewLinks = await pool.query(
        `SELECT p.attendance_entry_id,
                c.id, c.sha256, p.photo_type AS event_type, c.event_type AS original_event_type,
                to_char(c.event_time, 'HH24:MI') AS event_time,
                to_char(c.image_time, 'HH24:MI') AS image_time,
                to_char(c.image_date, 'YYYY-MM-DD') AS image_date,
                to_char(c.shift_in, 'HH24:MI') AS shift_in,
                to_char(c.shift_out, 'HH24:MI') AS shift_out,
                to_char(c.event_date, 'YYYY-MM-DD') AS event_date,
                c.sender_display_name AS sender, c.location, c.app, c.code, c.confidence,
                c.manual_override, true AS linked_by_review,
                (SELECT m.body_text FROM whatsapp_capture.message_media mm
                   JOIN whatsapp_capture.messages m ON m.id = mm.message_id
                  WHERE mm.id = c.message_media_id) AS caption
           FROM attendance_entry_photos p
           JOIN attendance_candidates c ON c.id = p.candidate_id
          WHERE p.attendance_entry_id = ANY($1::uuid[])
          ORDER BY p.created_at`,
        [rows.map((row) => row.id)]
      );
      const byEntry = new Map<string, Record<string, unknown>[]>();
      for (const link of reviewLinks.rows) {
        const list = byEntry.get(link.attendance_entry_id) ?? [];
        list.push(link);
        byEntry.set(link.attendance_entry_id, list);
      }
      for (const row of rows) {
        const linked = byEntry.get(row.id) ?? [];
        const existing = Array.isArray(row.photos) ? row.photos : [];
        const keys = new Set(existing.map((photo: { id?: string; event_type?: string | null }) => `${photo.id}:${photo.event_type}`));
        row.photos = [...existing, ...linked.filter((photo) => !keys.has(`${photo.id}:${photo.event_type}`))];
      }
    }

    let nearbyPhotos: Record<string, unknown>[] = [];
    if (date) {
      const nearby = await pool.query(
        `SELECT c.id, c.sha256, c.event_type,
                to_char(c.event_time, 'HH24:MI') AS event_time,
                to_char(c.image_time, 'HH24:MI') AS image_time,
                to_char(c.image_date, 'YYYY-MM-DD') AS image_date,
                to_char(c.shift_in, 'HH24:MI') AS shift_in,
                to_char(c.shift_out, 'HH24:MI') AS shift_out,
                to_char(c.event_date, 'YYYY-MM-DD') AS event_date,
                to_char(COALESCE(c.event_date, (c.created_at AT TIME ZONE 'America/Mexico_City')::date), 'YYYY-MM-DD') AS reference_date,
                (COALESCE(c.event_date, (c.created_at AT TIME ZONE 'America/Mexico_City')::date) - $2::date)::integer AS day_offset,
                c.sender_display_name AS sender, c.location, c.status,
                mo.state AS media_state,
                (SELECT m.body_text FROM whatsapp_capture.message_media mm
                   JOIN whatsapp_capture.messages m ON m.id = mm.message_id
                  WHERE mm.id = c.message_media_id) AS caption
           FROM attendance_candidates c
           JOIN whatsapp_capture.media_objects mo ON mo.sha256 = c.sha256
          WHERE (c.technician_id = $1
                 OR c.sender_id IN (SELECT sender_id FROM whatsapp_capture.technician_contacts WHERE technician_id = $1))
            AND COALESCE(c.event_date, (c.created_at AT TIME ZONE 'America/Mexico_City')::date) BETWEEN $2::date - 2 AND $2::date + 2
            AND mo.state = 'stored'
          ORDER BY abs(COALESCE(c.event_date, (c.created_at AT TIME ZONE 'America/Mexico_City')::date) - $2::date),
                   COALESCE(c.event_date, (c.created_at AT TIME ZONE 'America/Mexico_City')::date), c.created_at DESC
          LIMIT 100`,
        [technicianId, date]
      );
      nearbyPhotos = nearby.rows;
    }

    let navigation: { previous_date: string | null; next_date: string | null } | null = null;
    if (date) {
      const neighbors = await pool.query(
        `SELECT
           (SELECT to_char(max(date), 'YYYY-MM-DD') FROM attendance_entries WHERE technician_id = $1 AND date < $2::date) AS previous_date,
           (SELECT to_char(min(date), 'YYYY-MM-DD') FROM attendance_entries WHERE technician_id = $1 AND date > $2::date) AS next_date`,
        [technicianId, date]
      );
      navigation = neighbors.rows[0];
    }

    return jsonOk({
      technician: { id: tech.rows[0].id, display_name: tech.rows[0].display_name },
      entries: rows,
      navigation,
      nearby_photos: nearbyPhotos,
    });
  } catch (err) {
    return jsonError("No se pudo leer la verificación", 500, String(err));
  }
}

/** Vincula una foto existente como evidencia de entrada o salida del registro. */
export async function POST(request: NextRequest) {
  let body: { technician_id?: string; date?: string; candidate_id?: string; photo_type?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }
  const technicianId = body.technician_id ? parseId(body.technician_id) : null;
  const candidateId = body.candidate_id ? parseId(body.candidate_id) : null;
  const date = body.date ?? "";
  const photoType = body.photo_type ?? "";
  if (!technicianId) return jsonError("technician_id inválido");
  if (!candidateId) return jsonError("candidate_id inválido");
  if (!DATE_RE.test(date)) return jsonError("date inválida");
  if (!PHOTO_TYPES.has(photoType)) return jsonError("photo_type debe ser entrada o salida");

  const reviewerId = await getCurrentUserId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const entry = await client.query(
      `SELECT id FROM attendance_entries WHERE technician_id = $1 AND date = $2::date FOR UPDATE`,
      [technicianId, date]
    );
    if (entry.rowCount === 0) {
      await client.query("ROLLBACK");
      return jsonError("No hay un registro de asistencia para ese técnico y día", 404);
    }

    const candidate = await client.query(
      `SELECT c.id
         FROM attendance_candidates c
         JOIN whatsapp_capture.media_objects mo ON mo.sha256 = c.sha256
        WHERE c.id = $2
          AND (c.technician_id = $1
               OR c.sender_id IN (SELECT sender_id FROM whatsapp_capture.technician_contacts WHERE technician_id = $1))
          AND COALESCE(c.event_date, (c.created_at AT TIME ZONE 'America/Mexico_City')::date) BETWEEN $3::date - 2 AND $3::date + 2
          AND mo.state = 'stored'
        FOR UPDATE OF c`,
      [technicianId, candidateId, date]
    );
    if (candidate.rowCount === 0) {
      await client.query("ROLLBACK");
      return jsonError("La foto no está disponible o no corresponde a este técnico dentro de los cinco días", 404);
    }

    await client.query(
      `INSERT INTO attendance_entry_photos (attendance_entry_id, candidate_id, photo_type, linked_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (attendance_entry_id, candidate_id, photo_type) DO NOTHING`,
      [entry.rows[0].id, candidateId, photoType, reviewerId]
    );
    await client.query("COMMIT");
    return jsonOk({ attendance_entry_id: entry.rows[0].id, candidate_id: candidateId, photo_type: photoType });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo vincular la foto", 500, String(err));
  } finally {
    client.release();
  }
}

/** Quita el vínculo de revisión; con action="remove" además descarta la foto como evidencia del día. */
export async function DELETE(request: NextRequest) {
  let body: { technician_id?: string; date?: string; candidate_id?: string; photo_type?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }
  const technicianId = body.technician_id ? parseId(body.technician_id) : null;
  const candidateId = body.candidate_id ? parseId(body.candidate_id) : null;
  const date = body.date ?? "";
  const photoType = body.photo_type ?? "";
  const action = body.action === "remove" ? "remove" : "unlink";
  if (!technicianId) return jsonError("technician_id inválido");
  if (!candidateId) return jsonError("candidate_id inválido");
  if (!DATE_RE.test(date)) return jsonError("date inválida");
  if (!PHOTO_TYPES.has(photoType)) return jsonError("photo_type debe ser entrada o salida");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Quita el vínculo de revisión si existe (no falla si no hay).
    await client.query(
      `DELETE FROM attendance_entry_photos p
        USING attendance_entries e
        WHERE p.attendance_entry_id = e.id
          AND e.technician_id = $1 AND e.date = $2::date
          AND p.candidate_id = $3 AND p.photo_type = $4`,
      [technicianId, date, candidateId, photoType]
    );

    if (action === "remove") {
      // Descarta la foto como evidencia del día (desengancha el candidato del tramo y lo rechaza).
      await client.query(
        `UPDATE attendance_segments SET candidate_id = NULL
          WHERE technician_id = $1 AND date = $2::date AND candidate_id = $3`,
        [technicianId, date, candidateId]
      );
      const reviewer = await getCurrentUserId();
      await client.query(
        `UPDATE attendance_candidates
            SET segment_id = NULL, status = 'rejected', reviewed_by = $2, reviewed_at = now()
          WHERE id = $1`,
        [candidateId, reviewer]
      );
      await recomputeDay(client, technicianId, date, false);
      const settings = await getSettings();
      await recomputeOvertime(client, date, date, asNumber(settings.overtime_daily_hours, 9), asNumber(settings.overtime_weekly_hours, 45));
      await client.query("COMMIT");
      return jsonOk({ removed: true, discarded: true, candidate_id: candidateId, photo_type: photoType });
    }

    await client.query("COMMIT");
    return jsonOk({ removed: true, candidate_id: candidateId, photo_type: photoType });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo quitar la foto", 500, String(err));
  } finally {
    client.release();
  }
}
