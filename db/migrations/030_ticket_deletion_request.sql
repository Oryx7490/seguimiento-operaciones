ALTER TABLE tickets
  ADD COLUMN deletion_requested_at  timestamptz,
  ADD COLUMN deletion_requested_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN deletion_reason        text;

COMMENT ON COLUMN tickets.deletion_requested_at IS 'Si no es NULL, el ticket tiene una solicitud de eliminación pendiente de aprobación por admin.';
COMMENT ON COLUMN tickets.deletion_reason       IS 'Motivo de la solicitud de eliminación.';