-- 064_whatsapp_media_manage.sql
-- Campos administrables por contenido de media (foto): nota/descripción humana,
-- favorito y archivado. La identidad es el SHA-256 del binario (aplica a reenvíos).

ALTER TABLE whatsapp_capture.media_objects
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS note_updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_whatsapp_media_favorite
  ON whatsapp_capture.media_objects (is_favorite) WHERE is_favorite;
CREATE INDEX IF NOT EXISTS idx_whatsapp_media_archived
  ON whatsapp_capture.media_objects (is_archived);

COMMENT ON COLUMN whatsapp_capture.media_objects.note IS
  'Nota/descripción humana de la foto (editable desde el visor).';
COMMENT ON COLUMN whatsapp_capture.media_objects.is_favorite IS
  'Marcada como favorita para acceso rápido.';
COMMENT ON COLUMN whatsapp_capture.media_objects.is_archived IS
  'Archivada: se oculta de la galería por defecto.';
