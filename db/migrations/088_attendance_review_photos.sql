-- Evidencia escogida desde la segunda validación diaria W84.
-- Se mantiene separada del candidato original y de sus datos de OCR/captura.
CREATE TABLE attendance_entry_photos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_entry_id uuid NOT NULL REFERENCES attendance_entries(id) ON DELETE CASCADE,
  candidate_id        uuid NOT NULL REFERENCES attendance_candidates(id) ON DELETE CASCADE,
  photo_type          text NOT NULL CHECK (photo_type IN ('entrada', 'salida')),
  linked_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attendance_entry_id, candidate_id, photo_type)
);

CREATE INDEX idx_attendance_entry_photos_entry
  ON attendance_entry_photos (attendance_entry_id, photo_type, created_at);

COMMENT ON TABLE attendance_entry_photos IS
  'Fotos vinculadas manualmente como evidencia de entrada/salida durante la segunda validación W84; no altera la captura original.';
