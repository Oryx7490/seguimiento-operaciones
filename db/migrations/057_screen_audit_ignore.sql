CREATE TABLE IF NOT EXISTS screen_audit_ignores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id        uuid NOT NULL REFERENCES project_screens(id) ON DELETE CASCADE,
  issue_key        text NOT NULL,
  reason           text,
  ignored_by_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  ignored_by_name  text,
  ignored_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (screen_id, issue_key)
);
CREATE INDEX IF NOT EXISTS idx_screen_audit_ignores_screen ON screen_audit_ignores (screen_id);
COMMENT ON TABLE screen_audit_ignores IS 'Alertas de la auditoría de medidas de pantallas desactivadas por un usuario (con quien/cuándo).';
