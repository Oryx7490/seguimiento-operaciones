-- 072_attendance_candidate_notes.sql
-- Notas por candidato de asistencia (V58): espacio libre para observaciones del revisor.
ALTER TABLE attendance_candidates ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN attendance_candidates.notes IS 'Notas del revisor sobre el candidato de asistencia.';
