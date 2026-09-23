ALTER TABLE projects
  ADD COLUMN deletion_requested_at  timestamptz,
  ADD COLUMN deletion_requested_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN deletion_reason        text;

COMMENT ON COLUMN projects.deletion_requested_at IS 'Si no es NULL, el proyecto tiene una solicitud de eliminación pendiente de aprobación por admin.';
COMMENT ON COLUMN projects.deletion_reason       IS 'Motivo de la solicitud de eliminación.';