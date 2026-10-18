-- 082_attendance_manual.sql
-- Marca los registros de asistencia capturados/ajustados a mano (V72).
ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN attendance_entries.manual IS
  'El registro (entrada/salida) se colocó o ajustó manualmente al no encontrar evidencia.';
