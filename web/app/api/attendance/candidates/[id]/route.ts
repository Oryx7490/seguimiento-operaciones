import { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId, getCurrentUserId } from "@/app/lib/api";
import { asNumber, getSettings } from "@/app/lib/notifications";
import { computeOvertime, computeSegmentsHours, hoursBetween, parseTime } from "@/app/lib/overtime";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function recomputeOvertime(client: PoolClient, from: string, to: string, dailyStd: number, weeklyStd: number) {
  const { rows } = await client.query<{ id: string; technician_id: string; date: string; hours: string | null }>(
    `SELECT id, technician_id, to_char(date, 'YYYY-MM-DD') AS date, hours
       FROM attendance_entries
      WHERE technician_id IS NOT NULL
        AND date >= ($1::date - INTERVAL '7 days')
        AND date <= ($2::date + INTERVAL '7 days')
      ORDER BY technician_id, date`,
    [from, to]
  );
  const byTech = new Map<string, { ids: string[]; entries: { date: string; hours: number | null }[] }>();
  for (const r of rows) {
    const list = byTech.get(r.technician_id) ?? { ids: [], entries: [] };
    list.ids.push(r.id);
    list.entries.push({ date: r.date, hours: r.hours === null ? null : Number(r.hours) });
    byTech.set(r.technician_id, list);
  }
  for (const { ids, entries } of byTech.values()) {
    const ot = computeOvertime(entries, dailyStd, weeklyStd);
    for (let i = 0; i < ids.length; i++) {
      await client.query(`UPDATE attendance_entries SET overtime = $2 WHERE id = $1`, [ids[i], ot.get(entries[i].date) ?? 0]);
    }
  }
}

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
      `SELECT id, technician_id, sender_id, event_type, to_char(event_date,'YYYY-MM-DD') AS event_date,
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
    const overrideNote = manualOverride
      ? `Imagen: ${imageTimes.join("–") || "—"}${candidate.image_date ? ` (${candidate.image_date})` : ""} · Manual: ${manualTimeList.join("–") || "—"} (${eventDate})`
      : null;

    const techRes = await client.query(`SELECT display_name FROM technicians WHERE id = $1`, [technicianId]);
    if (techRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return jsonError("Técnico no encontrado", 404);
    }
    const personName = techRes.rows[0].display_name;

    await client.query(
      `INSERT INTO attendance_segments (technician_id, date, started_at, ended_at, hours, source, candidate_id)
       VALUES ($1, $2, $3, $4, $5, 'whatsapp', $6)`,
      [technicianId, eventDate, started, ended, hours, id]
    );

    // Agrega el día a partir de los segmentos (empareja entradas y salidas sueltas).
    const segs = await client.query(
      `SELECT to_char(started_at,'HH24:MI:SS') AS started_at, to_char(ended_at,'HH24:MI:SS') AS ended_at
         FROM attendance_segments WHERE technician_id = $1 AND date = $2`,
      [technicianId, eventDate]
    );
    const startsOnly = segs.rows.map((r: { started_at: string | null }) => r.started_at).filter(Boolean).sort();
    const endsOnly = segs.rows.map((r: { ended_at: string | null }) => r.ended_at).filter(Boolean).sort();
    const dayAgg = {
      check_in: startsOnly.length > 0 ? startsOnly[0] : null,
      check_out: endsOnly.length > 0 ? endsOnly[endsOnly.length - 1] : null,
      hours: computeSegmentsHours(segs.rows),
    };

    await client.query(
      `INSERT INTO attendance_entries (technician_id, person_name, date, check_in, check_out, hours)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (technician_id, date) DO UPDATE
         SET person_name = EXCLUDED.person_name, check_in = EXCLUDED.check_in,
             check_out = EXCLUDED.check_out, hours = EXCLUDED.hours`,
      [technicianId, personName, eventDate, dayAgg.check_in, dayAgg.check_out, dayAgg.hours]
    );

    const settings = await getSettings();
    const dailyStd = asNumber(settings.overtime_daily_hours, 8);
    const weeklyStd = asNumber(settings.overtime_weekly_hours, 40);
    await recomputeOvertime(client, eventDate, eventDate, dailyStd, weeklyStd);

    await client.query(
      `UPDATE attendance_candidates
          SET status = 'registered', technician_id = $2, event_date = $3, event_type = $4,
              event_time = COALESCE($5, event_time), shift_in = COALESCE($6, shift_in), shift_out = COALESCE($7, shift_out),
              reviewed_by = $8, reviewed_at = now(),
              manual_override = $9, override_note = $10,
              ambiguity = CASE WHEN $9 THEN (ambiguity || '["discrepancia_hora"]'::jsonb) ELSE ambiguity END
        WHERE id = $1`,
      [id, technicianId, eventDate, eventType, eventTime, shiftIn, shiftOut, reviewer, manualOverride, overrideNote]
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
