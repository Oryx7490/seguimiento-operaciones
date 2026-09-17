-- 010_non_working_days.sql
-- Fase 8: calendario laboral (días no laborables) y umbral de media jornada.
-- Los días oficiales precargados corresponden al art. 74 de la Ley Federal del
-- Trabajo para 2026 (DOF / STPS). Los discrecionales los captura el admin.

CREATE TABLE non_working_days (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day        date NOT NULL UNIQUE,
  name       text NOT NULL,
  kind       text NOT NULL DEFAULT 'discretionary' CHECK (kind IN ('official', 'discretionary')),
  active     boolean NOT NULL DEFAULT true,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE non_working_days
  IS 'Días no laborables globales. kind=official (descanso obligatorio LFT) o discretionary (decisión de la empresa).';

-- Días de descanso obligatorio 2026 (LFT art. 74).
INSERT INTO non_working_days (day, name, kind, notes) VALUES
  ('2026-01-01', 'Año Nuevo', 'official', 'LFT art. 74'),
  ('2026-02-02', 'Día de la Constitución (primer lunes de febrero)', 'official', 'LFT art. 74'),
  ('2026-03-16', 'Natalicio de Benito Juárez (tercer lunes de marzo)', 'official', 'LFT art. 74'),
  ('2026-05-01', 'Día del Trabajo', 'official', 'LFT art. 74'),
  ('2026-09-16', 'Día de la Independencia', 'official', 'LFT art. 74'),
  ('2026-11-16', 'Día de la Revolución (tercer lunes de noviembre)', 'official', 'LFT art. 74'),
  ('2026-12-25', 'Navidad', 'official', 'LFT art. 74')
ON CONFLICT (day) DO NOTHING;

-- Horas a partir de las cuales un día cuenta como jornada completa.
-- Por debajo de ese umbral (y mayor que cero) se considera media jornada.
INSERT INTO app_settings (key, value, description)
VALUES ('half_day_hours', '5'::jsonb,
        'Horas de jornada a partir de las cuales un día cuenta como completo (por debajo, media jornada).')
ON CONFLICT (key) DO NOTHING;
