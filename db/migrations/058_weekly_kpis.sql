-- 058_weekly_kpis.sql
-- KPIs semanales con cierre cada domingo

CREATE TABLE IF NOT EXISTS weekly_kpi_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL,
  week_number int NOT NULL,        -- ISO week o semana calculada (1-53)
  week_ending date NOT NULL,       -- domingo de cierre
  starts_at timestamptz NOT NULL,  -- inicio semana (lunes 00:00 CDMX)
  ends_at timestamptz NOT NULL,    -- fin semana (domingo 23:59:59 CDMX)
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at timestamptz,
  closed_by_id uuid REFERENCES users(id),
  closed_by_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, week_number)
);

CREATE TABLE IF NOT EXISTS weekly_kpi_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES weekly_kpi_periods(id) ON DELETE CASCADE,
  key text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  unit text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, key)
);

CREATE INDEX IF NOT EXISTS idx_weekly_kpi_periods_week_ending ON weekly_kpi_periods(week_ending DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_kpi_periods_status ON weekly_kpi_periods(status);
CREATE INDEX IF NOT EXISTS idx_weekly_kpi_metrics_period_id ON weekly_kpi_metrics(period_id);
