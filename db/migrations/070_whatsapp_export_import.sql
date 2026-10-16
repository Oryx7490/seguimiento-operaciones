-- Importación auditable de respaldos exportados de WhatsApp.
-- Los índices trigram aceleran las búsquedas ILIKE que ya usa la API.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_whatsapp_messages_body_trgm
  ON whatsapp_capture.messages USING gin (body_text gin_trgm_ops)
  WHERE body_text IS NOT NULL;

CREATE INDEX idx_whatsapp_messages_sender_name_trgm
  ON whatsapp_capture.messages USING gin (sender_display_name gin_trgm_ops)
  WHERE sender_display_name IS NOT NULL;

CREATE TABLE whatsapp_capture.export_batches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     uuid NOT NULL REFERENCES whatsapp_capture.conversations(id) ON DELETE RESTRICT,
  source_filename     text NOT NULL,
  archive_sha256      char(64) NOT NULL,
  text_sha256         char(64) NOT NULL,
  timezone_name       text NOT NULL,
  date_format         text NOT NULL CHECK (date_format IN ('mdy', 'dmy')),
  status              text NOT NULL DEFAULT 'imported'
                        CHECK (status IN ('imported', 'partial')),
  total_messages      integer NOT NULL DEFAULT 0 CHECK (total_messages >= 0),
  inserted_messages   integer NOT NULL DEFAULT 0 CHECK (inserted_messages >= 0),
  matched_messages    integer NOT NULL DEFAULT 0 CHECK (matched_messages >= 0),
  unavailable_media   integer NOT NULL DEFAULT 0 CHECK (unavailable_media >= 0),
  stored_media        integer NOT NULL DEFAULT 0 CHECK (stored_media >= 0),
  report              jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at         timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  UNIQUE (conversation_id, archive_sha256)
);

CREATE TABLE whatsapp_capture.export_message_keys (
  conversation_id     uuid NOT NULL REFERENCES whatsapp_capture.conversations(id) ON DELETE RESTRICT,
  fingerprint         char(64) NOT NULL,
  occurrence_number   integer NOT NULL CHECK (occurrence_number > 0),
  message_id          uuid NOT NULL REFERENCES whatsapp_capture.messages(id) ON DELETE RESTRICT,
  first_batch_id      uuid NOT NULL REFERENCES whatsapp_capture.export_batches(id) ON DELETE RESTRICT,
  source_ordinal      integer NOT NULL CHECK (source_ordinal > 0),
  source_line         integer NOT NULL CHECK (source_line > 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, fingerprint, occurrence_number)
);

CREATE INDEX idx_whatsapp_export_message_keys_message
  ON whatsapp_capture.export_message_keys (message_id);

CREATE TABLE whatsapp_capture.export_batch_messages (
  batch_id            uuid NOT NULL REFERENCES whatsapp_capture.export_batches(id) ON DELETE RESTRICT,
  source_ordinal      integer NOT NULL CHECK (source_ordinal > 0),
  source_line         integer NOT NULL CHECK (source_line > 0),
  message_id          uuid NOT NULL REFERENCES whatsapp_capture.messages(id) ON DELETE RESTRICT,
  fingerprint         char(64) NOT NULL,
  occurrence_number   integer NOT NULL CHECK (occurrence_number > 0),
  disposition         text NOT NULL CHECK (disposition IN ('inserted', 'matched_live', 'overlap')),
  PRIMARY KEY (batch_id, source_ordinal)
);

CREATE INDEX idx_whatsapp_export_batch_messages_message
  ON whatsapp_capture.export_batch_messages (message_id);

CREATE TABLE whatsapp_capture.export_batch_attachments (
  batch_id            uuid NOT NULL,
  source_ordinal      integer NOT NULL CHECK (source_ordinal > 0),
  attachment_ordinal  smallint NOT NULL CHECK (attachment_ordinal >= 0),
  message_id          uuid NOT NULL REFERENCES whatsapp_capture.messages(id) ON DELETE RESTRICT,
  message_media_id    uuid REFERENCES whatsapp_capture.message_media(id) ON DELETE RESTRICT,
  source_entry        text,
  media_kind          whatsapp_capture.media_kind NOT NULL,
  sha256              char(64) REFERENCES whatsapp_capture.media_objects(sha256) ON DELETE RESTRICT,
  state               text NOT NULL CHECK (state IN ('stored', 'unavailable', 'orphan', 'ambiguous', 'failed')),
  detail              text,
  PRIMARY KEY (batch_id, source_ordinal, attachment_ordinal),
  FOREIGN KEY (batch_id, source_ordinal)
    REFERENCES whatsapp_capture.export_batch_messages(batch_id, source_ordinal) ON DELETE RESTRICT
);

CREATE INDEX idx_whatsapp_export_batch_attachments_state
  ON whatsapp_capture.export_batch_attachments (batch_id, state);

CREATE TABLE whatsapp_capture.export_batch_files (
  batch_id            uuid NOT NULL REFERENCES whatsapp_capture.export_batches(id) ON DELETE RESTRICT,
  source_entry        text NOT NULL,
  media_kind          whatsapp_capture.media_kind NOT NULL,
  sha256              char(64) REFERENCES whatsapp_capture.media_objects(sha256) ON DELETE RESTRICT,
  size_bytes          bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  state               text NOT NULL CHECK (state IN ('stored', 'orphan', 'ambiguous', 'failed')),
  detail              text,
  PRIMARY KEY (batch_id, source_entry)
);

CREATE INDEX idx_whatsapp_export_batch_files_state
  ON whatsapp_capture.export_batch_files (batch_id, state);

COMMENT ON TABLE whatsapp_capture.export_batches IS
  'Auditoría por archivo ZIP; los SHA-256 diferencian respaldos y permiten reintentar importaciones parciales.';
COMMENT ON TABLE whatsapp_capture.export_message_keys IS
  'Identidad estable de mensajes exportados para deduplicar respaldos solapados sin depender del ID de WhatsApp.';
COMMENT ON TABLE whatsapp_capture.export_batch_messages IS
  'Relación de cada renglón de un respaldo con el mensaje conciliado o insertado en PostgreSQL.';
COMMENT ON TABLE whatsapp_capture.export_batch_attachments IS
  'Inventario de adjuntos por renglón; unavailable indica que el texto menciona el medio pero el ZIP no contiene sus bytes.';
COMMENT ON TABLE whatsapp_capture.export_batch_files IS
  'Inventario de archivos multimedia del ZIP, incluidos los que no se pudieron vincular con seguridad a un mensaje.';

GRANT SELECT, INSERT, UPDATE ON whatsapp_capture.export_batches TO whatsapp_capture_writer;
GRANT SELECT, INSERT, UPDATE ON whatsapp_capture.export_message_keys TO whatsapp_capture_writer;
GRANT SELECT, INSERT, UPDATE ON whatsapp_capture.export_batch_messages TO whatsapp_capture_writer;
GRANT SELECT, INSERT, UPDATE ON whatsapp_capture.export_batch_attachments TO whatsapp_capture_writer;
GRANT SELECT, INSERT, UPDATE ON whatsapp_capture.export_batch_files TO whatsapp_capture_writer;
