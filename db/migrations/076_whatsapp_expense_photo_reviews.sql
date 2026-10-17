-- 076_whatsapp_expense_photo_reviews.sql
-- Revisión humana de documentos de gasto detectados en fotos de WhatsApp.
-- Guarda propuestas y correcciones como evidencia operativa; no es un asiento contable.

CREATE TABLE whatsapp_capture.expense_photo_reviews (
  sha256                 char(64) PRIMARY KEY REFERENCES whatsapp_capture.media_objects(sha256) ON DELETE RESTRICT,
  latest_analysis_id     uuid REFERENCES whatsapp_capture.media_analyses(id) ON DELETE SET NULL,
  suggested_project_id   uuid REFERENCES projects(id) ON DELETE SET NULL,
  model_suggestion        jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_status           text NOT NULL DEFAULT 'pending'
                          CHECK (review_status IN ('pending', 'confirmed', 'corrected', 'rejected')),
  reviewed_is_expense     boolean,
  reviewed_category       text,
  reviewed_project_id     uuid REFERENCES projects(id) ON DELETE SET NULL,
  reviewed_vendor         text,
  reviewed_expense_date   date,
  reviewed_total          numeric(14,2) CHECK (reviewed_total IS NULL OR reviewed_total >= 0),
  reviewed_tax            numeric(14,2) CHECK (reviewed_tax IS NULL OR reviewed_tax >= 0),
  reviewed_currency       text NOT NULL DEFAULT 'MXN' CHECK (reviewed_currency ~ '^[A-Z]{3}$'),
  reviewed_description    text,
  reviewed_text           text,
  review_note             text,
  reviewed_by             uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_photo_reviews_status_updated
  ON whatsapp_capture.expense_photo_reviews (review_status, updated_at DESC);
CREATE INDEX idx_expense_photo_reviews_project
  ON whatsapp_capture.expense_photo_reviews (reviewed_project_id, reviewed_expense_date DESC)
  WHERE reviewed_project_id IS NOT NULL;

CREATE TABLE whatsapp_capture.expense_photo_review_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256     char(64) NOT NULL REFERENCES whatsapp_capture.expense_photo_reviews(sha256) ON DELETE CASCADE,
  author_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  body       text NOT NULL CHECK (length(btrim(body)) > 0 AND length(body) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_photo_review_comments_sha_time
  ON whatsapp_capture.expense_photo_review_comments (sha256, created_at);

COMMENT ON TABLE whatsapp_capture.expense_photo_reviews IS
  'Propuesta de clasificación/extracción por IA y revisión humana de evidencia de gasto; no representa un asiento contable.';
COMMENT ON TABLE whatsapp_capture.expense_photo_review_comments IS
  'Notas de revisión y discusión humana sobre la interpretación de una foto de gasto.';

GRANT SELECT, INSERT, UPDATE ON whatsapp_capture.expense_photo_reviews TO whatsapp_capture_writer;
GRANT SELECT, INSERT ON whatsapp_capture.expense_photo_review_comments TO whatsapp_capture_writer;

-- Bandeja disponible para administración, coordinación, finanzas, gerencia y dirección de proyecto.
INSERT INTO role_permissions (role_id, section_key, can_view, can_create, can_update, can_delete, can_export)
SELECT r.id,
       'admin.gastos_fotos',
       true,
       r.code IN ('admin', 'coordinator', 'finanzas', 'gerente', 'director_proyecto'),
       r.code IN ('admin', 'coordinator', 'finanzas', 'gerente', 'director_proyecto'),
       false,
       r.code IN ('admin', 'coordinator', 'finanzas', 'gerente')
  FROM roles r
 WHERE r.code IN ('admin', 'coordinator', 'finanzas', 'gerente', 'director_proyecto')
ON CONFLICT (role_id, section_key) DO UPDATE
   SET can_view = EXCLUDED.can_view,
       can_create = EXCLUDED.can_create,
       can_update = EXCLUDED.can_update,
       can_delete = EXCLUDED.can_delete,
       can_export = EXCLUDED.can_export;
