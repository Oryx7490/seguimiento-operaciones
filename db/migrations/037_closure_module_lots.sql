CREATE TABLE IF NOT EXISTS project_closure_module_lots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  screen_id          uuid REFERENCES project_screens(id) ON DELETE SET NULL,
  manufacturer_brand text NOT NULL,
  lot_number         text NOT NULL,
  module_count       integer CHECK (module_count IS NULL OR module_count > 0),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_closure_module_lots_project ON project_closure_module_lots (project_id);

COMMENT ON TABLE project_closure_module_lots IS
  'Lotes de módulos LED y marca del fabricante registrados en el cierre, por pantalla o global (screen_id NULL = general).';