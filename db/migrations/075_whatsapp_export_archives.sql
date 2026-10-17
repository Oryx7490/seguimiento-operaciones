-- Respaldo temporal de exportaciones ZIP de WhatsApp.
-- Un objeto por SHA-256; cada carga queda auditada por usuario y conversación.

CREATE TABLE whatsapp_capture.export_archives (
  archive_sha256      char(64) PRIMARY KEY CHECK (archive_sha256 ~ '^[0-9a-f]{64}$'),
  bucket              text NOT NULL,
  object_key          text NOT NULL UNIQUE,
  source_filename     text NOT NULL,
  size_bytes          bigint NOT NULL CHECK (size_bytes > 0),
  state               text NOT NULL DEFAULT 'stored' CHECK (state IN ('stored', 'deleted')),
  deletion_eligible   boolean NOT NULL DEFAULT true,
  retention_until     timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE TABLE whatsapp_capture.export_archive_uploads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_sha256      char(64) NOT NULL REFERENCES whatsapp_capture.export_archives(archive_sha256) ON DELETE RESTRICT,
  conversation_id     uuid NOT NULL REFERENCES whatsapp_capture.conversations(id) ON DELETE RESTRICT,
  uploaded_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  source_filename     text NOT NULL,
  size_bytes          bigint NOT NULL CHECK (size_bytes > 0),
  status              text NOT NULL DEFAULT 'uploaded'
                        CHECK (status IN ('uploaded', 'importing', 'imported', 'partial', 'already_imported', 'failed')),
  import_result       jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message       text,
  uploaded_at         timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

CREATE INDEX idx_whatsapp_export_archive_uploads_sha_time
  ON whatsapp_capture.export_archive_uploads (archive_sha256, uploaded_at DESC);
CREATE INDEX idx_whatsapp_export_archive_uploads_conversation_time
  ON whatsapp_capture.export_archive_uploads (conversation_id, uploaded_at DESC);
CREATE INDEX idx_whatsapp_export_archives_retention
  ON whatsapp_capture.export_archives (retention_until)
  WHERE state = 'stored' AND deletion_eligible;

COMMENT ON TABLE whatsapp_capture.export_archives IS
  'ZIP físicos de respaldos de WhatsApp en MinIO, deduplicados por SHA-256 y elegibles para borrado temprano.';
COMMENT ON TABLE whatsapp_capture.export_archive_uploads IS
  'Auditoría de cada colaborador que entrega un respaldo y del resultado de su importación.';

