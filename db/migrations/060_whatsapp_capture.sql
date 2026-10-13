-- 060_whatsapp_capture.sql
-- Ingesta idempotente de mensajes y archivos recibidos/enviados por WhatsApp.
-- Los binarios viven en MinIO; PostgreSQL conserva metadatos, hashes y relaciones.

CREATE SCHEMA whatsapp_capture;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'whatsapp_capture_writer') THEN
    EXECUTE 'CREATE ROLE whatsapp_capture_writer NOLOGIN';
  END IF;
END;
$$;

CREATE TYPE whatsapp_capture.message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE whatsapp_capture.media_kind AS ENUM ('image', 'video', 'audio', 'document', 'sticker', 'other');
CREATE TYPE whatsapp_capture.media_state AS ENUM ('pending', 'stored', 'failed', 'unavailable');
CREATE TYPE whatsapp_capture.link_source AS ENUM ('human', 'rule', 'model');
CREATE TYPE whatsapp_capture.link_status AS ENUM ('suggested', 'confirmed', 'rejected');
CREATE TYPE whatsapp_capture.analysis_state AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TABLE whatsapp_capture.conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL,
  remote_chat_id  text NOT NULL,
  display_name    text,
  is_group        boolean NOT NULL DEFAULT false,
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, remote_chat_id)
);

CREATE TABLE whatsapp_capture.messages (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id          uuid NOT NULL REFERENCES whatsapp_capture.conversations(id) ON DELETE RESTRICT,
  external_message_id      text NOT NULL,
  direction                whatsapp_capture.message_direction NOT NULL,
  sender_id                text,
  sender_display_name      text,
  recipient_id             text,
  body_text                text,
  message_kind             text NOT NULL DEFAULT 'text',
  sent_at                  timestamptz,
  received_at              timestamptz NOT NULL DEFAULT now(),
  reply_to_external_id     text,
  provider_event_id        text,
  delivery_status          text,
  provider_metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, external_message_id, direction)
);

CREATE TABLE whatsapp_capture.media_objects (
  sha256          char(64) PRIMARY KEY,
  bucket          text NOT NULL,
  object_key      text NOT NULL UNIQUE,
  content_type    text,
  size_bytes      bigint NOT NULL CHECK (size_bytes >= 0),
  state           whatsapp_capture.media_state NOT NULL DEFAULT 'pending',
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  stored_at       timestamptz,
  CONSTRAINT media_objects_sha256_format CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT media_objects_stored_has_timestamp CHECK (state <> 'stored' OR stored_at IS NOT NULL)
);

CREATE TABLE whatsapp_capture.message_media (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      uuid NOT NULL REFERENCES whatsapp_capture.messages(id) ON DELETE RESTRICT,
  ordinal         smallint NOT NULL CHECK (ordinal >= 0),
  file_name       text,
  media_kind      whatsapp_capture.media_kind NOT NULL DEFAULT 'other',
  content_type    text,
  size_bytes      bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  sha256          char(64) REFERENCES whatsapp_capture.media_objects(sha256) ON DELETE RESTRICT,
  state           whatsapp_capture.media_state NOT NULL DEFAULT 'pending',
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, ordinal),
  UNIQUE (message_id, id),
  CONSTRAINT message_media_stored_has_object CHECK (state <> 'stored' OR sha256 IS NOT NULL)
);

CREATE TABLE whatsapp_capture.media_analyses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256          char(64) NOT NULL REFERENCES whatsapp_capture.media_objects(sha256) ON DELETE RESTRICT,
  analysis_type   text NOT NULL,
  provider        text NOT NULL,
  model           text NOT NULL,
  model_version   text,
  state           whatsapp_capture.analysis_state NOT NULL DEFAULT 'pending',
  result          jsonb,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz
);

CREATE TABLE whatsapp_capture.technician_contacts (
  sender_id       text PRIMARY KEY,
  technician_id   uuid NOT NULL REFERENCES technicians(id) ON DELETE RESTRICT,
  verified        boolean NOT NULL DEFAULT false,
  verified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE whatsapp_capture.message_entity_links (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id          uuid NOT NULL REFERENCES whatsapp_capture.messages(id) ON DELETE RESTRICT,
  message_media_id    uuid,
  project_id          uuid REFERENCES projects(id) ON DELETE RESTRICT,
  ticket_id           uuid REFERENCES tickets(id) ON DELETE RESTRICT,
  activity_id         uuid REFERENCES activities(id) ON DELETE RESTRICT,
  technician_id       uuid REFERENCES technicians(id) ON DELETE RESTRICT,
  source              whatsapp_capture.link_source NOT NULL,
  status              whatsapp_capture.link_status NOT NULL DEFAULT 'suggested',
  confidence          numeric(5,4) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  rationale           text,
  reviewed_by         uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_entity_link_exactly_one_target CHECK (
    (project_id IS NOT NULL)::int +
    (ticket_id IS NOT NULL)::int +
    (activity_id IS NOT NULL)::int +
    (technician_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT message_entity_link_media_belongs_to_message
    FOREIGN KEY (message_id, message_media_id)
    REFERENCES whatsapp_capture.message_media(message_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_whatsapp_messages_conversation_time
  ON whatsapp_capture.messages (conversation_id, sent_at DESC, received_at DESC);
CREATE INDEX idx_whatsapp_messages_sender_time
  ON whatsapp_capture.messages (sender_id, sent_at DESC);
CREATE INDEX idx_whatsapp_message_media_sha256
  ON whatsapp_capture.message_media (sha256);
CREATE INDEX idx_whatsapp_media_analyses_lookup
  ON whatsapp_capture.media_analyses (sha256, analysis_type, created_at DESC);
CREATE INDEX idx_whatsapp_entity_links_project
  ON whatsapp_capture.message_entity_links (project_id, status) WHERE project_id IS NOT NULL;
CREATE INDEX idx_whatsapp_entity_links_ticket
  ON whatsapp_capture.message_entity_links (ticket_id, status) WHERE ticket_id IS NOT NULL;
CREATE INDEX idx_whatsapp_entity_links_activity
  ON whatsapp_capture.message_entity_links (activity_id, status) WHERE activity_id IS NOT NULL;
CREATE INDEX idx_whatsapp_entity_links_technician
  ON whatsapp_capture.message_entity_links (technician_id, status) WHERE technician_id IS NOT NULL;

COMMENT ON SCHEMA whatsapp_capture IS
  'Mensajes de WhatsApp, referencias a archivos deduplicados por SHA-256 y análisis/enlaces operativos.';
COMMENT ON TABLE whatsapp_capture.media_objects IS
  'Un registro y un objeto MinIO por contenido binario; el hash SHA-256 es la identidad global del archivo.';
COMMENT ON TABLE whatsapp_capture.message_media IS
  'Relación entre cada envío de un archivo y el objeto binario deduplicado en MinIO.';
COMMENT ON TABLE whatsapp_capture.media_analyses IS
  'Resultados versionados de OCR y reconocimiento; no sobrescriben los mensajes ni archivos fuente.';
COMMENT ON TABLE whatsapp_capture.message_entity_links IS
  'Enlaces sugeridos o confirmados entre mensajes/archivos y proyectos, tickets, actividades o técnicos.';

GRANT USAGE ON SCHEMA whatsapp_capture TO whatsapp_capture_writer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA whatsapp_capture TO whatsapp_capture_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA whatsapp_capture
  GRANT SELECT, INSERT, UPDATE ON TABLES TO whatsapp_capture_writer;
