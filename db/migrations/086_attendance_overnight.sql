-- 086_attendance_overnight.sql
-- Jornadas que cruzan medianoche (V80): la salida puede ser el día siguiente a la entrada.
--   - overnight: la salida es posterior al día de la entrada.
--   - segment_id en el candidato: enlace al tramo que representa (permite editar la salida
--     que cerró una entrada del día anterior).
ALTER TABLE attendance_segments ADD COLUMN IF NOT EXISTS overnight boolean NOT NULL DEFAULT false;
ALTER TABLE attendance_entries ADD COLUMN IF NOT EXISTS overnight boolean NOT NULL DEFAULT false;
ALTER TABLE attendance_candidates ADD COLUMN IF NOT EXISTS segment_id uuid REFERENCES attendance_segments(id) ON DELETE SET NULL;

COMMENT ON COLUMN attendance_segments.overnight IS 'La salida ocurrió el día siguiente a la entrada.';
COMMENT ON COLUMN attendance_entries.overnight IS 'La salida es posterior al día de la entrada (jornada nocturna).';
