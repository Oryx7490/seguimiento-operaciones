// Construye candidatos de asistencia a partir del OCR de las fotos (V51).
// Identifica al técnico por: contacto de WhatsApp -> alias -> nombre -> rostro.
// Marca ambigüedades para revisión humana; no escribe en asistencia.

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normTime(t) {
  if (!t) return null;
  const [h, m] = String(t).split(":");
  const hh = Number(h);
  if (Number.isNaN(hh)) return null;
  return `${String(hh).padStart(2, "0")}:${String(Number(m ?? 0)).padStart(2, "0")}:00`;
}

export async function runAttendanceCandidates({ pool, batchSize = 50, log = console }) {
  const { rows } = await pool.query(
    `SELECT a.sha256, a.result
       FROM whatsapp_capture.media_analyses a
      WHERE a.analysis_type = 'ocr' AND a.state = 'completed'
        AND a.result->'parsed' IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM attendance_candidates c WHERE c.sha256 = a.sha256)
      ORDER BY a.created_at ASC
      LIMIT $1`,
    [batchSize]
  );
  if (rows.length === 0) return { processed: 0 };

  const roster = await pool.query(`SELECT id, display_name FROM technicians WHERE active = true`);
  const aliases = await pool.query(`SELECT alias, technician_id FROM technician_aliases`);
  const contacts = await pool.query(`SELECT sender_id, technician_id FROM whatsapp_capture.technician_contacts`);
  const rosterByNorm = new Map(roster.rows.map((t) => [normalizeName(t.display_name), t.id]));
  const aliasByNorm = new Map(aliases.rows.map((a) => [normalizeName(a.alias), a.technician_id]));
  const contactById = new Map(contacts.rows.map((c) => [c.sender_id, c.technician_id]));

  let processed = 0;
  for (const { sha256, result } of rows) {
    try {
      await buildCandidate(pool, sha256, result, { rosterByNorm, aliasByNorm, contactById });
      processed++;
    } catch (err) {
      log.error(`[attendance] error en ${sha256.slice(0, 10)}: ${err.message}`);
    }
  }
  return { processed };
}

async function buildCandidate(pool, sha256, result, maps) {
  const parsed = result.parsed ?? {};

  const appRes = await pool.query(
    `SELECT mm.id AS message_media_id, m.id AS message_id, m.conversation_id, m.sender_id, m.sender_display_name
       FROM whatsapp_capture.message_media mm
       JOIN whatsapp_capture.messages m ON m.id = mm.message_id
      WHERE mm.sha256 = $1
      ORDER BY m.received_at DESC LIMIT 1`,
    [sha256]
  );
  const app = appRes.rows[0] ?? {};

  const faceRes = await pool.query(
    `SELECT DISTINCT fi.technician_id
       FROM whatsapp_capture.faces f
       JOIN whatsapp_capture.face_assignments fa ON fa.face_id = f.id
       JOIN whatsapp_capture.face_identities fi ON fi.id = fa.identity_id
      WHERE f.sha256 = $1 AND fi.technician_id IS NOT NULL`,
    [sha256]
  );

  // Resolución de técnico con todas las señales.
  const found = new Map(); // technician_id -> source
  const senderName = app.sender_display_name ?? "";
  if (app.sender_id && maps.contactById.has(app.sender_id)) {
    found.set(maps.contactById.get(app.sender_id), "contact");
  }
  const normSender = normalizeName(senderName);
  if (normSender && maps.aliasByNorm.has(normSender)) found.set(maps.aliasByNorm.get(normSender), "alias");
  if (normSender && maps.rosterByNorm.has(normSender)) found.set(maps.rosterByNorm.get(normSender), "name");
  for (const f of faceRes.rows) found.set(f.technician_id, "face");

  const technicianIds = [...found.keys()];
  const matchStatus = technicianIds.length === 1 ? "matched" : technicianIds.length > 1 ? "ambiguous" : "unknown";
  const matchSource = technicianIds.length >= 1 ? found.get(technicianIds[0]) : null;

  const ambiguity = [];
  if (technicianIds.length === 0) ambiguity.push("tecnico_desconocido");
  if (technicianIds.length > 1) ambiguity.push("varios_tecnicos");
  if (!parsed.date) ambiguity.push("sin_fecha");
  if (!parsed.time && !(parsed.shift_in && parsed.shift_out)) ambiguity.push("sin_hora");
  if (!parsed.type) ambiguity.push("tipo_desconocido");
  if (parsed.time && parsed.shift_in && normTime(parsed.time) !== normTime(parsed.shift_in)) {
    ambiguity.push("hora_vs_jornada");
  }

  let confidence = 0.4;
  if (technicianIds.length === 1) confidence += 0.25;
  if (parsed.date) confidence += 0.15;
  if (parsed.time || (parsed.shift_in && parsed.shift_out)) confidence += 0.2;

  await pool.query(
    `INSERT INTO attendance_candidates
       (sha256, message_id, message_media_id, conversation_id, sender_id, sender_display_name,
        technician_id, match_status, match_source, event_type, event_date, event_time,
        shift_in, shift_out, worked_hours, location, app, code, confidence, ambiguity,
        image_time, image_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22)
     ON CONFLICT (sha256) DO NOTHING`,
    [
      sha256,
      app.message_id ?? null,
      app.message_media_id ?? null,
      app.conversation_id ?? null,
      app.sender_id ?? null,
      app.sender_display_name ?? null,
      technicianIds.length === 1 ? technicianIds[0] : null,
      matchStatus,
      matchSource,
      parsed.type ?? null,
      parsed.date ?? null,
      normTime(parsed.time),
      normTime(parsed.shift_in),
      normTime(parsed.shift_out),
      parsed.worked_hours ?? null,
      parsed.location ?? null,
      parsed.app ?? null,
      parsed.code ?? null,
      Math.min(1, confidence),
      JSON.stringify(ambiguity),
      normTime(parsed.time),
      parsed.date ?? null,
    ]
  );
}
