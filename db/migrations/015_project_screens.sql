CREATE TABLE IF NOT EXISTS project_screens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  screen_type text NOT NULL,
  quantity    integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  dimensions  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_screens_project ON project_screens (project_id);