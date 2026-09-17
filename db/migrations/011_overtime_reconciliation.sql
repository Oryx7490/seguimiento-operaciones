-- 011_overtime_reconciliation.sql
-- Fase 10: importación de asistencia (persona, fecha, entrada/salida),
-- equivalencias de nombres y conciliación de horas extra por actividad/proyecto.

-- ------------------------------------------------------- lotes de importación
CREATE TABLE attendance_batches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename     text,
  period_start date,
  period_end   date,
  rows_total   integer NOT NULL DEFAULT 0,
  rows_matched integer NOT NULL DEFAULT 0,
  imported_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE attendance_batches IS 'Cada importación del archivo de asistencia (Excel/CSV).';

-- ------------------------------------------------------- asistencia por persona/día
CREATE TABLE attendance_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      uuid REFERENCES attendance_batches(id) ON DELETE SET NULL,
  technician_id uuid REFERENCES technicians(id) ON DELETE SET NULL,
  person_name   text NOT NULL,
  date          date NOT NULL,
  check_in      time,
  check_out     time,
  hours         numeric(6,2),
  overtime      numeric(6,2) NOT NULL DEFAULT 0,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (technician_id, date)
);
COMMENT ON TABLE attendance_entries IS 'Horas de entrada/salida por persona y día. technician_id NULL cuando el nombre no se pudo emparejar.';

CREATE INDEX idx_attendance_entries_date ON attendance_entries (date);
CREATE INDEX idx_attendance_entries_tech ON attendance_entries (technician_id);

-- ------------------------------------------------------- equivalencias de nombres
CREATE TABLE technician_aliases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias         text NOT NULL,
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX technician_aliases_alias_key ON technician_aliases (lower(alias));
COMMENT ON TABLE technician_aliases IS 'Nombres tal como aparecen en el archivo de asistencia; resuelven ambigüedades de empareje.';

-- ------------------------------------------------------- reparto de horas extra
CREATE TABLE overtime_allocations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  date          date NOT NULL,
  activity_id   uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  percent       numeric(5,2) NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
  hours         numeric(6,2) NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (technician_id, date, activity_id)
);
COMMENT ON TABLE overtime_allocations IS 'Porcentaje de las horas extra del día asignado a cada actividad; editable por el coordinador.';

-- ------------------------------------------------------- parámetros de jornada
INSERT INTO app_settings (key, value, description) VALUES
  ('overtime_daily_hours', '8'::jsonb,
   'Horas de jornada diaria a partir de las cuales se considera hora extra.'),
  ('overtime_weekly_hours', '40'::jsonb,
   'Horas de jornada semanal a partir de las cuales se considera hora extra.')
ON CONFLICT (key) DO NOTHING;
