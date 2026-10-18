-- 091_attendance_absences.sql
-- Incidencias de asistencia por técnico/día (V89): falta justificada/injustificada,
-- incapacidad, asueto, permiso o vacaciones, cuando no hay registro de entrada/salida.
CREATE TABLE attendance_absences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  date          date NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('justificada', 'injustificada', 'incapacidad', 'asueto', 'permiso', 'vacaciones')),
  notes         text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (technician_id, date)
);
CREATE INDEX idx_attendance_absences_date ON attendance_absences (date);

COMMENT ON TABLE attendance_absences IS
  'Incidencias de asistencia (falta, incapacidad, asueto, permiso, vacaciones) por técnico/día.';
