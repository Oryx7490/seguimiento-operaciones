-- Identidades estables para remitentes de WhatsApp, incluidas personas externas
-- y exintegrantes. Los alias conservan los números y nombres con su vigencia.

CREATE OR REPLACE FUNCTION whatsapp_capture.normalize_identity(kind text, raw_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN kind = 'display_name'
      THEN lower(regexp_replace(trim(raw_value), '[[:space:]]+', ' ', 'g'))
    WHEN lower(trim(raw_value)) ~ '^[+]?[0-9][0-9[:space:]().-]*$'
      OR lower(trim(raw_value)) ~ '^[0-9]+@(s\.whatsapp\.net|c\.us)$'
      THEN regexp_replace(raw_value, '[^0-9]', '', 'g')
    WHEN lower(trim(raw_value)) ~ '^[^@]+@(s\.whatsapp\.net|c\.us)$'
      THEN lower(split_part(trim(raw_value), '@', 1))
    ELSE lower(regexp_replace(trim(raw_value), '[[:space:]]+', '', 'g'))
  END
$$;

CREATE TABLE whatsapp_capture.participants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name    text NOT NULL,
  company_status  text NOT NULL DEFAULT 'unclassified'
                    CHECK (company_status IN ('current', 'former', 'external', 'unclassified')),
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  technician_id   uuid REFERENCES technicians(id) ON DELETE SET NULL,
  notes           text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_whatsapp_participants_user
  ON whatsapp_capture.participants (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_whatsapp_participants_technician
  ON whatsapp_capture.participants (technician_id) WHERE technician_id IS NOT NULL;
CREATE INDEX idx_whatsapp_participants_name
  ON whatsapp_capture.participants (lower(display_name));

CREATE TABLE whatsapp_capture.participant_aliases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id    uuid NOT NULL REFERENCES whatsapp_capture.participants(id) ON DELETE RESTRICT,
  identifier_type   text NOT NULL CHECK (identifier_type IN ('phone', 'whatsapp_id', 'display_name')),
  identifier_value  text NOT NULL CHECK (length(trim(identifier_value)) > 0),
  normalized_value  text GENERATED ALWAYS AS
                      (whatsapp_capture.normalize_identity(identifier_type, identifier_value)) STORED,
  category          text NOT NULL DEFAULT 'identity'
                      CHECK (category IN ('primary', 'permanent_secondary', 'temporary', 'previous', 'identity')),
  label             text,
  valid_from        timestamptz,
  valid_to          timestamptz,
  is_verified       boolean NOT NULL DEFAULT false,
  source            text NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual', 'capture', 'legacy', 'import')),
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_alias_valid_range CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from),
  CONSTRAINT whatsapp_alias_category_matches_type CHECK (
    (identifier_type = 'display_name' AND category = 'identity') OR
    (identifier_type = 'whatsapp_id' AND category = 'identity') OR
    (identifier_type = 'phone' AND category IN ('primary', 'permanent_secondary', 'temporary', 'previous'))
  )
);

CREATE UNIQUE INDEX idx_whatsapp_alias_current_identifier
  ON whatsapp_capture.participant_aliases (identifier_type, normalized_value)
  WHERE valid_to IS NULL AND identifier_type IN ('phone', 'whatsapp_id');
CREATE UNIQUE INDEX idx_whatsapp_alias_current_primary_phone
  ON whatsapp_capture.participant_aliases (participant_id)
  WHERE identifier_type = 'phone' AND category = 'primary' AND valid_to IS NULL;
CREATE INDEX idx_whatsapp_alias_lookup
  ON whatsapp_capture.participant_aliases (identifier_type, normalized_value, valid_from, valid_to);
CREATE INDEX idx_whatsapp_alias_participant
  ON whatsapp_capture.participant_aliases (participant_id, identifier_type);

ALTER TABLE whatsapp_capture.messages
  ADD COLUMN participant_id uuid REFERENCES whatsapp_capture.participants(id) ON DELETE SET NULL;
CREATE INDEX idx_whatsapp_messages_participant_time
  ON whatsapp_capture.messages (participant_id, sent_at DESC)
  WHERE participant_id IS NOT NULL;

-- Importa identidades ya verificadas y números registrados en la ficha de técnicos.
INSERT INTO whatsapp_capture.participants (display_name, company_status, user_id, technician_id)
SELECT t.display_name,
       CASE WHEN t.active AND u.active THEN 'current' ELSE 'former' END,
       t.user_id,
       t.id
  FROM technicians t
  JOIN users u ON u.id = t.user_id
ON CONFLICT DO NOTHING;

INSERT INTO whatsapp_capture.participants (display_name, company_status, user_id)
SELECT u.name,
       CASE WHEN u.active THEN 'current' ELSE 'former' END,
       u.id
  FROM users u
 WHERE u.role IN ('admin', 'coordinator')
   AND NOT u.is_agent
   AND NOT EXISTS (
     SELECT 1 FROM whatsapp_capture.participants p WHERE p.user_id = u.id
   )
ON CONFLICT DO NOTHING;

INSERT INTO whatsapp_capture.participant_aliases
  (participant_id, identifier_type, identifier_value, category, label, is_verified, source)
SELECT p.id, 'phone', t.phone, 'primary', 'Teléfono registrado en RGB-Gantt', false, 'legacy'
  FROM technicians t
  JOIN whatsapp_capture.participants p ON p.technician_id = t.id
 WHERE nullif(trim(t.phone), '') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO whatsapp_capture.participant_aliases
  (participant_id, identifier_type, identifier_value, category, label, is_verified, source)
SELECT p.id, 'whatsapp_id', tc.sender_id, 'identity', 'Remitente verificado previamente', tc.verified, 'legacy'
  FROM whatsapp_capture.technician_contacts tc
  JOIN whatsapp_capture.participants p ON p.technician_id = tc.technician_id
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION whatsapp_capture.resolve_participant(
  sender_value text,
  display_value text,
  message_time timestamptz
) RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  matched_id uuid;
  match_count integer;
  normalized_sender text;
  normalized_name text;
BEGIN
  normalized_sender := whatsapp_capture.normalize_identity('whatsapp_id', sender_value);
  IF normalized_sender IS NOT NULL AND normalized_sender <> '' THEN
    SELECT min(a.participant_id::text)::uuid, count(DISTINCT a.participant_id)::integer
      INTO matched_id, match_count
      FROM whatsapp_capture.participant_aliases a
     WHERE a.is_verified
       AND a.identifier_type IN ('phone', 'whatsapp_id')
       AND a.normalized_value = normalized_sender
       AND (a.valid_from IS NULL OR a.valid_from <= message_time)
       AND (a.valid_to IS NULL OR message_time < a.valid_to);
    IF match_count = 1 THEN RETURN matched_id; END IF;
    IF match_count > 1 THEN RETURN NULL; END IF;
  END IF;

  normalized_name := whatsapp_capture.normalize_identity('display_name', display_value);
  IF normalized_name IS NULL OR normalized_name = '' THEN RETURN NULL; END IF;
  SELECT min(a.participant_id::text)::uuid, count(DISTINCT a.participant_id)::integer
    INTO matched_id, match_count
    FROM whatsapp_capture.participant_aliases a
   WHERE a.is_verified
     AND a.identifier_type = 'display_name'
     AND a.normalized_value = normalized_name
     AND (a.valid_from IS NULL OR a.valid_from <= message_time)
     AND (a.valid_to IS NULL OR message_time < a.valid_to);
  IF match_count = 1 THEN RETURN matched_id; END IF;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION whatsapp_capture.assign_message_participant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR
     NEW.sender_id IS DISTINCT FROM OLD.sender_id OR
     NEW.sender_display_name IS DISTINCT FROM OLD.sender_display_name OR
     NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
    NEW.participant_id := whatsapp_capture.resolve_participant(
      NEW.sender_id,
      NEW.sender_display_name,
      coalesce(NEW.sent_at, NEW.received_at, now())
    );
  ELSIF NEW.participant_id IS NULL THEN
    NEW.participant_id := whatsapp_capture.resolve_participant(
      NEW.sender_id,
      NEW.sender_display_name,
      coalesce(NEW.sent_at, NEW.received_at, now())
    );
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER whatsapp_assign_message_participant
  BEFORE INSERT OR UPDATE OF sender_id, sender_display_name, sent_at, participant_id
  ON whatsapp_capture.messages
  FOR EACH ROW EXECUTE FUNCTION whatsapp_capture.assign_message_participant();

-- Los flujos antiguos de asistencia siguen escribiendo technician_contacts.
-- Sincronizamos esos mapeos verificados con los alias conservando el vínculo previo.
CREATE OR REPLACE FUNCTION whatsapp_capture.sync_technician_contact_alias()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_participant uuid;
  normalized_sender text;
  current_alias uuid;
BEGIN
  SELECT p.id INTO target_participant
    FROM whatsapp_capture.participants p
   WHERE p.technician_id = NEW.technician_id;
  IF target_participant IS NULL THEN RETURN NEW; END IF;

  normalized_sender := whatsapp_capture.normalize_identity('whatsapp_id', NEW.sender_id);
  SELECT a.id INTO current_alias
    FROM whatsapp_capture.participant_aliases a
   WHERE a.identifier_type IN ('phone', 'whatsapp_id')
     AND a.normalized_value = normalized_sender
     AND a.valid_to IS NULL
     AND a.participant_id <> target_participant
   LIMIT 1;
  IF current_alias IS NOT NULL THEN
    UPDATE whatsapp_capture.participant_aliases
       SET category = CASE WHEN identifier_type = 'phone' THEN 'previous' ELSE category END,
           valid_to = now(), updated_at = now()
     WHERE identifier_type IN ('phone', 'whatsapp_id')
       AND normalized_value = normalized_sender
       AND valid_to IS NULL
       AND participant_id <> target_participant;
  END IF;

  INSERT INTO whatsapp_capture.participant_aliases
    (participant_id, identifier_type, identifier_value, category, label, is_verified, source, valid_from)
  VALUES
    (target_participant, 'whatsapp_id', NEW.sender_id, 'identity', 'Confirmado desde asistencia', NEW.verified, 'legacy', NEW.verified_at)
  ON CONFLICT (identifier_type, normalized_value)
    WHERE valid_to IS NULL AND identifier_type IN ('phone', 'whatsapp_id')
  DO UPDATE SET is_verified = EXCLUDED.is_verified,
                label = EXCLUDED.label,
                updated_at = now()
  WHERE whatsapp_capture.participant_aliases.participant_id = EXCLUDED.participant_id;
  RETURN NEW;
END
$$;

CREATE TRIGGER whatsapp_sync_technician_contact
  AFTER INSERT OR UPDATE OF sender_id, technician_id, verified, verified_at
  ON whatsapp_capture.technician_contacts
  FOR EACH ROW EXECUTE FUNCTION whatsapp_capture.sync_technician_contact_alias();

-- Enlaza mensajes históricos solo cuando existe una coincidencia verificada y única.
UPDATE whatsapp_capture.messages m
   SET participant_id = whatsapp_capture.resolve_participant(
     m.sender_id, m.sender_display_name, coalesce(m.sent_at, m.received_at)
   )
 WHERE m.sender_id IS NOT NULL OR m.sender_display_name IS NOT NULL;

COMMENT ON TABLE whatsapp_capture.participants IS
  'Personas identificadas en WhatsApp; user_id y technician_id son opcionales para externos, exintegrantes o perfiles aún sin alta.';
COMMENT ON TABLE whatsapp_capture.participant_aliases IS
  'Números, identificadores de WhatsApp y nombres asociados con vigencia; los cambios de teléfono agregan alias y no borran el historial.';
COMMENT ON COLUMN whatsapp_capture.messages.participant_id IS
  'Identidad resuelta mediante alias verificados y fecha del mensaje; permanece NULL si la coincidencia no es segura.';

GRANT SELECT, INSERT, UPDATE ON whatsapp_capture.participants TO whatsapp_capture_writer;
GRANT SELECT, INSERT, UPDATE ON whatsapp_capture.participant_aliases TO whatsapp_capture_writer;
GRANT SELECT, UPDATE ON whatsapp_capture.messages TO whatsapp_capture_writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA whatsapp_capture TO whatsapp_capture_writer;
