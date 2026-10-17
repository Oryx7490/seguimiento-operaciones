-- 080_attendance_candidate_message_date.sql
-- Si la imagen no traía fecha legible, se usa la fecha en que se envió la foto al grupo.
-- Backfill de candidatos existentes sin fecha.
UPDATE attendance_candidates c
   SET event_date = sub.message_date,
       ambiguity = CASE
         WHEN c.ambiguity ? 'fecha_del_mensaje' THEN c.ambiguity
         ELSE c.ambiguity || '["fecha_del_mensaje"]'::jsonb
       END
  FROM (
    SELECT DISTINCT ON (c2.id) c2.id,
           (COALESCE(m.sent_at, m.received_at) AT TIME ZONE 'America/Mexico_City')::date AS message_date
      FROM attendance_candidates c2
      JOIN whatsapp_capture.message_media mm ON mm.sha256 = c2.sha256
      JOIN whatsapp_capture.messages m ON m.id = mm.message_id
     WHERE c2.event_date IS NULL
     ORDER BY c2.id, m.received_at DESC
  ) sub
 WHERE c.id = sub.id AND sub.message_date IS NOT NULL;
