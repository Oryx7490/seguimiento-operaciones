-- 081_attendance_candidate_message_date_cleanup.sql
-- Limpia la señal redundante "sin_fecha" cuando ya se resolvió con la fecha del mensaje.
UPDATE attendance_candidates
   SET ambiguity = ambiguity - 'sin_fecha'
 WHERE ambiguity ? 'fecha_del_mensaje' AND ambiguity ? 'sin_fecha';
