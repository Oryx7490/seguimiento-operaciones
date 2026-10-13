-- 063_whatsapp_media_tags.sql
-- Visor de fotografías de WhatsApp (V48): etiquetas por contenido (deduplicadas por SHA-256)
-- y sección RBAC para la pantalla. Las etiquetas son por objeto binario, por lo que
-- aplican a todas las apariciones del mismo archivo (reenvíos incluidos).

CREATE TABLE whatsapp_capture.media_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256     char(64) NOT NULL REFERENCES whatsapp_capture.media_objects(sha256) ON DELETE CASCADE,
  tag        text NOT NULL CHECK (length(btrim(tag)) > 0),
  source     text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_whatsapp_media_tags_unique ON whatsapp_capture.media_tags (sha256, lower(tag));
CREATE INDEX idx_whatsapp_media_tags_tag ON whatsapp_capture.media_tags (lower(tag));

COMMENT ON TABLE whatsapp_capture.media_tags IS
  'Etiquetas de contenido por media (manuales o generadas por IA); la identidad es el SHA-256 del binario.';

-- Sección de navegación/permisos para el visor de fotografías.
INSERT INTO role_permissions (role_id, section_key, can_view, can_create, can_update, can_delete, can_export)
SELECT r.id,
       'whatsapp',
       true,
       r.code IN ('admin', 'coordinator'),
       r.code IN ('admin', 'coordinator'),
       r.code = 'admin',
       false
FROM roles r
ON CONFLICT (role_id, section_key) DO NOTHING;
