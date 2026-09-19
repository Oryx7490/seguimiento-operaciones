-- 012_activity_end_date.sql
-- Duración de actividades: fecha fin opcional para abarcar varios días
-- (la tarjeta se muestra en cada día del rango [date, end_date]).

ALTER TABLE activities ADD COLUMN IF NOT EXISTS end_date date;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activities_end_date_check') THEN
    ALTER TABLE activities
      ADD CONSTRAINT activities_end_date_check
      CHECK (end_date IS NULL OR end_date >= date);
  END IF;
END $$;

COMMENT ON COLUMN activities.end_date
  IS 'Fecha fin opcional: la actividad abarca [date, end_date]. NULL = un solo día.';
