-- 013_client_contacts.sql
-- Varias personas de contacto por cliente (con puesto) y comentarios de cliente.

-- ------------------------------------------------------- contactos del cliente
CREATE TABLE IF NOT EXISTS client_contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(btrim(name)) > 0),
  position     text,
  email        text,
  phone        text,
  active       boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE client_contacts
  IS 'Personas de contacto del cliente (puestos o responsables por proyecto).';

CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON client_contacts(client_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_client_contacts_updated') THEN
    CREATE TRIGGER trg_client_contacts_updated
      BEFORE UPDATE ON client_contacts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ------------------------------------------------------- comentarios de cliente
ALTER TABLE comments ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_comments_client ON comments(client_id) WHERE client_id IS NOT NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comment_exactly_one_entity') THEN
    ALTER TABLE comments DROP CONSTRAINT comment_exactly_one_entity;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comment_exactly_one_entity') THEN
    ALTER TABLE comments ADD CONSTRAINT comment_exactly_one_entity CHECK (
      ((project_id IS NOT NULL)::integer + (ticket_id IS NOT NULL)::integer + (client_id IS NOT NULL)::integer) = 1
    );
  END IF;
END $$;
