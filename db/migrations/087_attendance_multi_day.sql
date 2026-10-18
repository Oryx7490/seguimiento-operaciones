-- 087_attendance_multi_day.sql
-- Jornadas de varios días (V81): cuántos días después de la entrada ocurrió la salida.
ALTER TABLE attendance_segments ADD COLUMN IF NOT EXISTS exit_offset_days integer NOT NULL DEFAULT 0;
ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS exit_offset_days integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN attendance_segments.exit_offset_days IS 'Días entre la fecha de entrada y la de salida (0 = mismo día, 1 = siguiente, N = varios).';
COMMENT ON COLUMN attendance_entries.exit_offset_days IS 'Días entre la fecha de entrada y la de salida (0 = mismo día).';
