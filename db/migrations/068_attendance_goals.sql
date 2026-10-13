-- 068_attendance_goals.sql
-- Metas semanales (V55): objetivos por métrica para el equipo y por técnico,
-- usados para el semáforo de cumplimiento en el resumen del equipo.

CREATE TABLE attendance_goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid REFERENCES technicians(id) ON DELETE CASCADE, -- NULL = meta del equipo
  scope_key     text GENERATED ALWAYS AS (COALESCE(technician_id::text, 'team')) STORED,
  metric        text NOT NULL CHECK (metric IN (
                  'hours_worked', 'overtime', 'm2_per_hour', 'm2_installed',
                  'screens_installed', 'tickets_closed')),
  target        numeric NOT NULL CHECK (target >= 0),
  direction     text NOT NULL DEFAULT 'at_least' CHECK (direction IN ('at_least', 'at_most')),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_key, metric)
);

CREATE INDEX idx_attendance_goals_tech ON attendance_goals (technician_id);

COMMENT ON TABLE attendance_goals IS
  'Metas semanales por métrica (equipo o técnico) para el semáforo de cumplimiento.';
