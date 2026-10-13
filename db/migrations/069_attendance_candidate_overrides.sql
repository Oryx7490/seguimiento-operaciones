-- 069_attendance_candidate_overrides.sql
-- Captura manual de fecha/hora en la bandeja de asistencia (V56): se conserva el
-- valor leído de la imagen y se marca cuando el revisor lo corrige (discrepancia).

ALTER TABLE attendance_candidates
  ADD COLUMN IF NOT EXISTS image_time time,
  ADD COLUMN IF NOT EXISTS image_date date,
  ADD COLUMN IF NOT EXISTS manual_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_note text;

-- Backfill: el valor actual proviene del OCR.
UPDATE attendance_candidates
   SET image_time = COALESCE(event_time, shift_in),
       image_date = event_date
 WHERE image_time IS NULL;

COMMENT ON COLUMN attendance_candidates.image_time IS 'Hora leída de la imagen (OCR), antes de cualquier corrección manual.';
COMMENT ON COLUMN attendance_candidates.manual_override IS 'El revisor corrigió fecha/hora respecto a lo leído en la imagen.';
