ALTER TABLE project_screens
  ADD COLUMN IF NOT EXISTS installed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

COMMENT ON COLUMN project_screens.installed IS 'La pantalla ya se instaló.';
COMMENT ON COLUMN project_screens.cancelled IS 'La instalación de esta pantalla se canceló.';
COMMENT ON COLUMN project_screens.cancel_reason IS 'Motivo o comentarios de la cancelación.';
