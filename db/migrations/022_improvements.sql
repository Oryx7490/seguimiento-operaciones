CREATE TABLE IF NOT EXISTS improvements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text,
  category      text NOT NULL DEFAULT 'feature', -- 'feature' | 'bug' | 'ux' | 'other'
  priority      text NOT NULL DEFAULT 'medium',  -- 'low' | 'medium' | 'high' | 'critical'
  status        text NOT NULL DEFAULT 'open',    -- 'open' | 'in_progress' | 'done' | 'wontfix'
  reporter_name text,
  reporter_email text,
  assigned_to   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz,
  closed_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  resolution    text
);

CREATE INDEX IF NOT EXISTS idx_improvements_status ON improvements(status);
CREATE INDEX IF NOT EXISTS idx_improvements_category ON improvements(category);
CREATE INDEX IF NOT EXISTS idx_improvements_assigned ON improvements(assigned_to);

CREATE TRIGGER trg_improvements_updated
  BEFORE UPDATE ON improvements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();