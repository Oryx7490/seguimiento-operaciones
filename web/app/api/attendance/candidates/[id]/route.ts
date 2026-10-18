import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId, getCurrentUserId } from "@/app/lib/api";
import { asNumber, getSettings } from "@/app/lib/notifications";
import { hoursBetween, hoursBetweenDays, parseTime } from "@/app/lib/overtime";
import { daysBetween, recomputeDay, recomputeOvertime } from "@/app/lib/attendance";
import { learnFacesForSha } from "@/app/lib/faces";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: {
    action?: string;
    technician_id?: string;
    event_type?: string;
    event_date?: string;
    event_time?: string | null;
    shift_in?: string | null;
    shift_out?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }
  const action = body.action;
  if (action !== "approve" && action !== "reject") return jsonError("action inválida (approve o reject)");

  const reviewer = await getCurrentUserId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, technician_id, sender_id, sha256, event_type, to_char(event_date,'YYYY-MM-DD') AS event_date,
              to_char(event_time,'HH24:MI:SS') AS event_time,
              to_char(shift_in,'HH24:MI:SS') AS shift_in,
              to_char(shift_out,'HH24:MI:SS') AS shift_out,
              to_char(image_time,'HH24:MI:SS') AS image_time,
              to_char(image_date,'YYYY-MM-DD') AS image_date
         FROM attendance_candidates WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("Candidato no encontrado", 404);
    }
    const candidate = rows[0];

    if (action === "reject") {
      await client.query(
        `UPDATE attendance_candidates SET status = 'rejected', reviewed_by = $2, reviewed_at = now() WHERE id = $1`,
        [id, reviewer]
      );
      await client.query("COMMIT");
      return jsonOk({ id, status: "rejected" });
    }

    // approve
    const technicianId = body.technician_id ? parseId(body.technician_id) : candidate.technician_id;
    if (!technicianId) {
      await client.query("ROLLBACK");
      return jsonError("Falta el técnico (technician_id)");
    }
    const eventDate = body.event_date || candidate.event_date;
    if (!eventDate || !DATE_RE.test(eventDate)) {
      await client.query("ROLLBACK");
      return jsonError("Fecha inválida");
    }

    const eventType = body.event_type ?? candidate.event_type;
    const eventTime = body.event_time !== undefined ? parseTime(body.event_time ?? null) : candidate.event_time;
    // Si el revisor manda las horas de entrada/salida (aunque vengan vacías), se respetan tal cual.
    const manualTimes = body.shift_in !== undefined || body.shift_out !== undefined;
    const shiftIn = body.shift_in !== undefined ? parseTime(body.shift_in ?? null) : candidate.shift_in;
    const shiftOut = body.shift_out !== undefined ? parseTime(body.shift_out ?? null) : candidate.shift_out;

    const started = manualTimes ? shiftIn : shiftIn || (eventType === "entrada" ? eventTime : null);
    const ended = manualTimes ? shiftOut : shiftOut || (eventType === "salida" ? eventTime : null);
    if (!started && !ended) {
      await client.query("ROLLBACK");
      return jsonError("El candidato no tiene hora de entrada ni de salida");
    }
    const hours = hoursBetween(started, ended);

    // Discrepancia: solo si la imagen traía hora/fecha y lo capturado difiere.
    // Se comparan los conjuntos de horas (funciona aunque no se sepa entrada/salida).
    const norm = (t: string | null) => (t ? t.slice(0, 8) : null);
    const imageTimes = [candidate.shift_in, candidate.shift_out, candidate.image_time]
      .filter(Boolean)
      .map((t) => norm(t as string))
      .sort();
    const manualTimeList = [started, ended]
      .filter(Boolean)
      .map((t) => norm(t as string))
      .sort();
    const imageHasTime = imageTimes.length > 0;
    const imageHasDate = candidate.image_date != null;
    const timeDiffers = imageHasTime && imageTimes.join("|") !== manualTimeList.join("|");
    const dateDiffers = imageHasDate && eventDate !== candidate.image_date;
    const manualOverride = timeDiffers || dateDiffers;
    const dmy = (s: string | null | undefined) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "");
    const overrideNote = manualOverride
      ? `Imagen: ${imageTimes.join("–") || "—"}${candidate.image_date ? ` (${dmy(candidate.image_date)})` : ""} · Manual: ${manualTimeList.join("–") || "—"} (${dmy(eventDate)})`
      : null;

    const techRes = await client.query(`SELECT display_name FROM technicians WHERE id = $1`, [technicianId]);
    if (techRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return jsonError("Técnico no encontrado", 404);
    }
    const personName = techRes.rows[0].display_name;

    // Aprende los rostros de la foto para este técnico (alimenta el entrenamiento diario).
    await learnFacesForSha(client, candidate.sha256, technicianId, reviewer);

    // Empareja jornadas que cruzan medianoche: si es una salida, cierra el tramo
    // abierto (entrada sin salida) del técnico en el mismo día o los 2 días previos.
    let segmentId: string | null = null;
    let segmentDate = eventDate;
    let dayAgg = null as Awaited<ReturnType<typeof recomputeDay>>;

    if (!started && ended) {
      const open = await client.query(
        `SELECT id, to_char(date,'YYYY-MM-DD') AS date, to_char(started_at,'HH24:MI:SS') AS started_at
           FROM attendance_segments
          WHERE technician_id = $1 AND started_at IS NOT NULL AND ended_at IS NULL
            AND date BETWEEN ($2::date - 5) AND $2::date
          ORDER BY date DESC, started_at DESC LIMIT 1`,
        [technicianId, eventDate]
      );
      if (open.rowCount) {
        const seg = open.rows[0];
        const offsetDays = daysBetween(seg.date, eventDate);
        const overnight = offsetDays >= 1;
        const segHours = hoursBetweenDays(seg.started_at, ended, offsetDays);
        await client.query(
          `UPDATE attendance_segments SET ended_at = $2, hours = $3, overnight = $4, exit_offset_days = $5 WHERE id = $1`,
          [seg.id, ended, segHours, overnight, offsetDays]
        );
        segmentId = seg.id;
        segmentDate = seg.date;
        dayAgg = await recomputeDay(client, technicianId, seg.date, true);
        if (seg.date !== eventDate) await recomputeDay(client, technicianId, eventDate, false);
      }
    }

    if (!segmentId) {
      const ins = await client.query(
        `INSERT INTO attendance_segments (technician_id, date, started_at, ended_at, hours, overnight, source, candidate_id)
         VALUES ($1, $2, $3, $4, $5, false, 'whatsapp', $6) RETURNING id`,
        [technicianId, eventDate, started, ended, hours, id]
      );
      segmentId = ins.rows[0].id;
      segmentDate = eventDate;
      dayAgg = await recomputeDay(client, technicianId, eventDate, true);
    }

    const settings = await getSettings();
    const dailyStd = asNumber(settings.overtime_daily_hours, 9);
    const weeklyStd = asNumber(settings.overtime_weekly_hours, 45);
    await recomputeOvertime(client, segmentDate, eventDate, dailyStd, weeklyStd);

    await client.query(
      `UPDATE attendance_candidates
          SET status = 'registered', technician_id = $2, event_date = $3, event_type = $4,
              event_time = COALESCE($5, event_time), shift_in = COALESCE($6, shift_in), shift_out = COALESCE($7, shift_out),
              reviewed_by = $8, reviewed_at = now(),
              manual_override = $9, override_note = $10, segment_id = $11,
              ambiguity = CASE WHEN $9 THEN (ambiguity || '["discrepancia_hora"]'::jsonb) ELSE ambiguity END
        WHERE id = $1`,
      [id, technicianId, eventDate, eventType, eventTime, shiftIn, shiftOut, reviewer, manualOverride, overrideNote, segmentId]
    );

    // Aprende el mapeo remitente -> técnico para futuras fotos.
    if (candidate.sender_id) {
      await client.query(
        `INSERT INTO whatsapp_capture.technician_contacts (sender_id, technician_id, verified, verified_at)
         VALUES ($1, $2, true, now())
         ON CONFLICT (sender_id) DO UPDATE
           SET technician_id = EXCLUDED.technician_id, verified = true, verified_at = now(), updated_at = now()`,
        [candidate.sender_id, technicianId]
      );
    }

    await client.query("COMMIT");
    return jsonOk({ id, status: "registered", technician_id: technicianId, date: eventDate, ...dayAgg });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo aplicar el candidato", 500, String(err));
  } finally {
    client.release();
  }
}

/** Guarda las notas del revisor sobre el candidato. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: { notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }
  if (body.notes !== undefined && body.notes !== null && typeof body.notes !== "string") {
    return jsonError("notes inválido");
  }
  const notes = typeof body.notes === "string" ? body.notes.trim() : null;
  if (notes && notes.length > 2000) return jsonError("notes demasiado largas (máx 2000)");

  try {
    const { rows } = await pool.query(
      `UPDATE attendance_candidates SET notes = $2 WHERE id = $1 RETURNING id, notes`,
      [id, notes && notes.length > 0 ? notes : null]
    );
    if (rows.length === 0) return jsonError("Candidato no encontrado", 404);
    return jsonOk({ candidate: rows[0] });
  } catch (err) {
    return jsonError("No se pudieron guardar las notas", 500, String(err));
  }
}
