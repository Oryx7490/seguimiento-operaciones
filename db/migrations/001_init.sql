-- 001_init.sql
-- Esquema inicial de seguimiento-operaciones (v0.1)
-- Decisiones integradas:
--   * Actividad multi-proyecto (excepcional) -> activity_projects
--   * Fases libres con catálogo sugerido -> phase_catalog + project_phases.name
--   * Tickets internos (agua/energía/internet) -> tickets.ticket_type, client_id/location_id opcionales
--   * Cierre con finiquito + complemento fiscal + firma digital -> project_closures
--   * Horas planeadas en activities, horas reales en time_entries + ajustes

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------- enums
CREATE TYPE user_role            AS ENUM ('technician', 'coordinator', 'admin');
CREATE TYPE ticket_type          AS ENUM ('external', 'internal');
CREATE TYPE project_status       AS ENUM ('new', 'planning', 'waiting_authorization', 'waiting_materials', 'assembly', 'ready_install', 'installation', 'pending_docs', 'closed', 'cancelled');
CREATE TYPE project_health       AS ENUM ('on_time', 'at_risk', 'blocked', 'no_update');
CREATE TYPE project_phase_status AS ENUM ('not_started', 'in_progress', 'completed', 'blocked');
CREATE TYPE ticket_status        AS ENUM ('new', 'to_review', 'unassigned', 'scheduled', 'in_progress', 'waiting_client', 'waiting_material', 'waiting_access', 'resolved_pending_validation', 'closed', 'cancelled');
CREATE TYPE activity_status      AS ENUM ('planned', 'in_progress', 'completed', 'cancelled');
CREATE TYPE attachment_type      AS ENUM ('delivery_sheet', 'photo', 'quote', 'evidence', 'digital_signature', 'finiquito', 'fiscal_complement', 'other');
CREATE TYPE notification_channel AS ENUM ('system', 'email', 'whatsapp');
CREATE TYPE notification_status  AS ENUM ('pending', 'sending', 'sent', 'delivered', 'read', 'failed');
CREATE TYPE entity_type          AS ENUM ('project', 'ticket', 'activity');

-- ---------------------------------------------------------------- secuencias de códigos
CREATE SEQUENCE project_code_seq START 1;
CREATE SEQUENCE ticket_code_seq  START 1;

-- ---------------------------------------------------------------- catálogos
CREATE TABLE phase_catalog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE phase_catalog IS 'Catálogo de fases sugeridas al crear proyecto (editable por proyecto).';

CREATE TABLE priorities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE internal_activity_types (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  requires_approval  boolean NOT NULL DEFAULT false,
  sort_order         int  NOT NULL DEFAULT 0,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE internal_activity_types IS 'Vacaciones, enfermedad, permiso, capacitación, bodega, traslado, reunión, administrativa.';

CREATE TABLE ticket_channels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- usuarios y técnicos
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text,
  role          user_role NOT NULL DEFAULT 'technician',
  timezone      text NOT NULL DEFAULT 'America/Mexico_City',
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE technicians (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  phone        text,
  specialties  text[] NOT NULL DEFAULT '{}',
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- clientes y ubicaciones
CREATE TABLE clients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE locations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid REFERENCES clients(id) ON DELETE SET NULL,
  name         text NOT NULL,
  address      text,
  city         text,
  site_contact text,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE locations IS 'client_id puede ser NULL para ubicaciones internas (bodega, planta).';

-- ---------------------------------------------------------------- proyectos
CREATE TABLE projects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text NOT NULL UNIQUE,
  name                text NOT NULL,
  client_id           uuid REFERENCES clients(id) ON DELETE SET NULL,
  location_id         uuid REFERENCES locations(id) ON DELETE SET NULL,
  priority_id         uuid REFERENCES priorities(id) ON DELETE SET NULL,
  coordinator_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  status              project_status  NOT NULL DEFAULT 'new',
  health_status       project_health  NOT NULL DEFAULT 'on_time',
  planned_start_date  date,
  planned_end_date    date,
  actual_start_date   date,
  actual_end_date     date,
  blocked_reason      text,
  next_action         text,
  next_action_date    date,
  last_activity_at    timestamptz NOT NULL DEFAULT now(),
  version             int NOT NULL DEFAULT 0,
  created_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE projects IS 'health_status es transversal: un proyecto en Armado puede estar Bloqueado.';

CREATE TABLE project_phases (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  catalog_phase_id     uuid REFERENCES phase_catalog(id) ON DELETE SET NULL,
  sort_order           int  NOT NULL DEFAULT 0,
  status               project_phase_status NOT NULL DEFAULT 'not_started',
  planned_start_date   date,
  planned_end_date     date,
  actual_start_date    date,
  actual_end_date      date,
  owner_id             uuid REFERENCES users(id) ON DELETE SET NULL,
  blocked_reason       text,
  next_action          text,
  next_action_date     date,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- tickets
CREATE TABLE tickets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text NOT NULL UNIQUE,
  title             text NOT NULL,
  description       text NOT NULL,
  client_id         uuid REFERENCES clients(id) ON DELETE SET NULL,
  location_id       uuid REFERENCES locations(id) ON DELETE SET NULL,
  ticket_type       ticket_type NOT NULL DEFAULT 'external',
  priority_id       uuid REFERENCES priorities(id) ON DELETE SET NULL,
  status            ticket_status NOT NULL DEFAULT 'new',
  coordinator_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  reported_by       text NOT NULL,
  channel_id        uuid REFERENCES ticket_channels(id) ON DELETE SET NULL,
  opened_at         timestamptz NOT NULL DEFAULT now(),
  first_response_at timestamptz,
  resolved_at       timestamptz,
  closed_at         timestamptz,
  waiting_reason    text,
  next_action       text,
  next_action_date  date,
  last_activity_at  timestamptz NOT NULL DEFAULT now(),
  version           int NOT NULL DEFAULT 0,
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_ticket_needs_client CHECK (ticket_type = 'internal' OR client_id IS NOT NULL)
);

-- ---------------------------------------------------------------- asignaciones
CREATE TABLE assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid REFERENCES projects(id) ON DELETE CASCADE,
  ticket_id      uuid REFERENCES tickets(id)  ON DELETE CASCADE,
  technician_id  uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  role           text,
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  unassigned_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignment_exactly_one_entity
    CHECK ((project_id IS NOT NULL)::int + (ticket_id IS NOT NULL)::int = 1)
);

-- ---------------------------------------------------------------- actividades
CREATE TABLE activities (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date                      date NOT NULL,
  description               text,
  status                    activity_status NOT NULL DEFAULT 'planned',
  planned_hours             numeric(5,2) NOT NULL DEFAULT 0 CHECK (planned_hours >= 0),
  ticket_id                 uuid REFERENCES tickets(id) ON DELETE SET NULL,
  internal_activity_type_id uuid REFERENCES internal_activity_types(id) ON DELETE SET NULL,
  created_by                uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  version                   int NOT NULL DEFAULT 0
);
COMMENT ON TABLE activities
  IS 'Una actividad se liga a >=1 proyecto (activity_projects), a un ticket o a un tipo interno. Se valida con trigger diferido.';

CREATE TABLE activity_projects (
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, project_id)
);

CREATE TABLE activity_technicians (
  activity_id   uuid NOT NULL REFERENCES activities(id)   ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES technicians(id)  ON DELETE CASCADE,
  role          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, technician_id)
);

-- ---------------------------------------------------------------- horas reales
CREATE TABLE time_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id     uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  technician_id   uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  date            date NOT NULL,
  started_at      timestamptz,
  ended_at        timestamptz,
  duration_hours  numeric(5,2),
  notes           text,
  source          text NOT NULL DEFAULT 'worked',
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  version         int NOT NULL DEFAULT 0,
  CONSTRAINT time_entry_valid_range CHECK (duration_hours IS NULL OR duration_hours >= 0)
);

CREATE TABLE hour_adjustments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id      uuid NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  previous_duration  numeric(5,2),
  new_duration       numeric(5,2),
  reason             text NOT NULL,
  changed_by         uuid NOT NULL REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE hour_adjustments
  IS 'Correcciones de horas: nunca se sobrescribe el histórico sin dejar registro de motivo y autor.';

-- ---------------------------------------------------------------- comentarios e historial
CREATE TABLE comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  ticket_id    uuid REFERENCES tickets(id)  ON DELETE CASCADE,
  activity_id  uuid REFERENCES activities(id) ON DELETE SET NULL,
  author_id    uuid NOT NULL REFERENCES users(id),
  body         text NOT NULL CHECK (length(btrim(body)) > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comment_exactly_one_entity
    CHECK ((project_id IS NOT NULL)::int + (ticket_id IS NOT NULL)::int = 1),
  CONSTRAINT comment_activity_belongs_to_entity CHECK (activity_id IS NULL OR project_id IS NOT NULL OR ticket_id IS NOT NULL)
);

CREATE TABLE status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type entity_type NOT NULL,
  entity_id   uuid NOT NULL,
  from_status text,
  to_status   text NOT NULL,
  changed_by  uuid NOT NULL REFERENCES users(id),
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- adjuntos y cierre
CREATE TABLE attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  ticket_id       uuid REFERENCES tickets(id)  ON DELETE CASCADE,
  activity_id     uuid REFERENCES activities(id) ON DELETE SET NULL,
  file_name       text NOT NULL,
  storage_key     text NOT NULL,
  mime_type       text,
  size_bytes      bigint,
  attachment_type attachment_type NOT NULL DEFAULT 'other',
  uploaded_by     uuid NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachment_exactly_one_entity
    CHECK ((project_id IS NOT NULL)::int + (ticket_id IS NOT NULL)::int = 1)
);
COMMENT ON TABLE attachments IS 'attachment_type incluye delivery_sheet, digital_signature, finiquito y fiscal_complement para el cierre.';

CREATE TABLE project_closures (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                        uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  installation_done                 boolean NOT NULL DEFAULT false,
  mandatory_activities_completed    boolean NOT NULL DEFAULT false,
  hours_justified                   boolean NOT NULL DEFAULT false,
  delivery_sheet_attachment_id      uuid REFERENCES attachments(id) ON DELETE SET NULL,
  receiver_name                     text,
  reception_date                    date,
  finiquito_attachment_id           uuid REFERENCES attachments(id) ON DELETE SET NULL,
  finiquito_confirmed_at            timestamptz,
  fiscal_complement_attachment_id   uuid REFERENCES attachments(id) ON DELETE SET NULL,
  fiscal_complement_confirmed_at    timestamptz,
  digital_signature_attachment_id   uuid REFERENCES attachments(id) ON DELETE SET NULL,
  final_note                        text,
  closed_by                         uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_at                         timestamptz,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE project_closures
  IS 'Checklist de cierre: sección operativa (instalación, actividades, horas, hoja firmada) y sección financiera (finiquito + complemento fiscal). closed_at se escribe al confirmar la firma digital.';

-- ---------------------------------------------------------------- notificaciones
CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type   entity_type,
  entity_id     uuid,
  channel       notification_channel NOT NULL DEFAULT 'system',
  title         text,
  body          text,
  template      text,
  payload       jsonb,
  scheduled_at  timestamptz,
  sent_at       timestamptz,
  status        notification_status NOT NULL DEFAULT 'pending',
  read_at       timestamptz,
  error_message text,
  attempts      int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- histórico importado
CREATE TABLE external_time_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system  text NOT NULL,
  external_id    text NOT NULL,
  technician_id  uuid REFERENCES technicians(id) ON DELETE SET NULL,
  date           date NOT NULL,
  hours          numeric(5,2) NOT NULL CHECK (hours >= 0),
  raw_payload    jsonb,
  imported_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system, external_id)
);
COMMENT ON TABLE external_time_entries
  IS 'Registro histórico importado (hojas existentes). Las horas importadas no se modifican; las correcciones van a hour_adjustments.';

-- ---------------------------------------------------------------- funciones y triggers
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION touch_entity(p_type entity_type, p_id uuid) RETURNS void AS $$
BEGIN
  IF p_type = 'project' THEN
    UPDATE projects SET last_activity_at = now() WHERE id = p_id;
  ELSIF p_type = 'ticket' THEN
    UPDATE tickets SET last_activity_at = now() WHERE id = p_id;
  END IF;
END $$ LANGUAGE plpgsql;

-- updated_at en todas las tablas con la columna
CREATE TRIGGER trg_users_updated        BEFORE UPDATE ON users          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_technicians_updated  BEFORE UPDATE ON technicians    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_clients_updated      BEFORE UPDATE ON clients        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_locations_updated    BEFORE UPDATE ON locations      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_projects_updated     BEFORE UPDATE ON projects       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_project_phases_upd   BEFORE UPDATE ON project_phases FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tickets_updated      BEFORE UPDATE ON tickets        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_activities_updated   BEFORE UPDATE ON activities     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_time_entries_updated BEFORE UPDATE ON time_entries   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_comments_updated     BEFORE UPDATE ON comments       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_closures_updated     BEFORE UPDATE ON project_closures FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- cualquier edición de proyecto/ticket cuenta como último movimiento
CREATE OR REPLACE FUNCTION touch_on_update() RETURNS trigger AS $$
BEGIN
  NEW.updated_at     = now();
  NEW.last_activity_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_projects_movement  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION touch_on_update();
CREATE TRIGGER trg_tickets_movement   BEFORE UPDATE ON tickets  FOR EACH ROW EXECUTE FUNCTION touch_on_update();

-- actividad debe quedar ligada a >=1 proyecto, o a ticket, o a tipo interno
CREATE OR REPLACE FUNCTION check_activity_links() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM activity_projects ap WHERE ap.activity_id = NEW.id)
     AND NEW.ticket_id IS NULL AND NEW.internal_activity_type_id IS NULL THEN
    RAISE EXCEPTION 'Actividad % sin relación: debe ligarse a un proyecto, un ticket o un tipo interno', NEW.id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_activity_links
AFTER INSERT OR UPDATE ON activities
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_activity_links();

-- al tocar activity_projects asegúrate de que la actividad siga ligada
CREATE OR REPLACE FUNCTION check_activity_links_junction() RETURNS trigger AS $$
DECLARE
  aid uuid := COALESCE(NEW.activity_id, OLD.activity_id);
  total int;
BEGIN
  SELECT count(*) INTO total FROM activities a WHERE a.id = aid;
  IF total = 0 THEN RETURN COALESCE(NEW, OLD); END IF;
  IF NOT EXISTS (SELECT 1 FROM activity_projects ap WHERE ap.activity_id = aid)
     AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.id = aid AND (a.ticket_id IS NOT NULL OR a.internal_activity_type_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Actividad % queda sin proyecto, ticket ni tipo interno', aid;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_activity_projects_links
AFTER INSERT OR DELETE ON activity_projects
FOR EACH ROW EXECUTE FUNCTION check_activity_links_junction();

-- last_activity_at a partir de comentarios, adjuntos, historial y actividades
CREATE OR REPLACE FUNCTION touch_from_comment() RETURNS trigger AS $$
BEGIN
  IF NEW.project_id IS NOT NULL THEN PERFORM touch_entity('project', NEW.project_id); END IF;
  IF NEW.ticket_id  IS NOT NULL THEN PERFORM touch_entity('ticket',  NEW.ticket_id);  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_comments_touch AFTER INSERT OR UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION touch_from_comment();

CREATE OR REPLACE FUNCTION touch_from_attachment() RETURNS trigger AS $$
BEGIN
  IF NEW.project_id IS NOT NULL THEN PERFORM touch_entity('project', NEW.project_id); END IF;
  IF NEW.ticket_id  IS NOT NULL THEN PERFORM touch_entity('ticket',  NEW.ticket_id);  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_attachments_touch AFTER INSERT OR UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION touch_from_attachment();

CREATE OR REPLACE FUNCTION touch_from_status_history() RETURNS trigger AS $$
BEGIN
  PERFORM touch_entity(NEW.entity_type, NEW.entity_id);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_status_history_touch AFTER INSERT ON status_history FOR EACH ROW EXECUTE FUNCTION touch_from_status_history();

CREATE OR REPLACE FUNCTION touch_from_activity() RETURNS trigger AS $$
DECLARE p uuid;
BEGIN
  IF NEW.ticket_id IS NOT NULL THEN PERFORM touch_entity('ticket', NEW.ticket_id); END IF;
  FOR p IN SELECT project_id FROM activity_projects WHERE activity_id = NEW.id LOOP
    PERFORM touch_entity('project', p);
  END LOOP;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION touch_from_activity_junction() RETURNS trigger AS $$
DECLARE
  pid uuid := COALESCE(NEW.project_id, OLD.project_id);
BEGIN
  PERFORM touch_entity('project', pid);
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_activity_projects_touch AFTER INSERT OR DELETE ON activity_projects FOR EACH ROW EXECUTE FUNCTION touch_from_activity_junction();

CREATE TRIGGER trg_activities_touch AFTER INSERT OR UPDATE ON activities FOR EACH ROW EXECUTE FUNCTION touch_from_activity();

-- ---------------------------------------------------------------- índices
CREATE INDEX idx_projects_status        ON projects(status);
CREATE INDEX idx_projects_health        ON projects(health_status);
CREATE INDEX idx_projects_coordinator   ON projects(coordinator_id);
CREATE INDEX idx_projects_client        ON projects(client_id);
CREATE INDEX idx_projects_name_trgm     ON projects USING gin (name gin_trgm_ops);

CREATE INDEX idx_phases_project         ON project_phases(project_id, sort_order);

CREATE INDEX idx_tickets_status         ON tickets(status);
CREATE INDEX idx_tickets_client         ON tickets(client_id);
CREATE INDEX idx_tickets_coordinator    ON tickets(coordinator_id);
CREATE INDEX idx_tickets_type           ON tickets(ticket_type);
CREATE INDEX idx_tickets_last_activity  ON tickets(last_activity_at);
CREATE INDEX idx_tickets_title_trgm     ON tickets USING gin (title gin_trgm_ops);

CREATE INDEX idx_assignments_tech       ON assignments(technician_id, assigned_at)
  WHERE unassigned_at IS NULL;
CREATE INDEX idx_assignments_project    ON assignments(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_assignments_ticket     ON assignments(ticket_id)  WHERE ticket_id  IS NOT NULL;

CREATE INDEX idx_activities_date        ON activities(date);
CREATE INDEX idx_activities_status      ON activities(status);
CREATE INDEX idx_activities_ticket      ON activities(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX idx_activity_tech_activity ON activity_technicians(activity_id);

CREATE INDEX idx_time_entries_activity  ON time_entries(activity_id);
CREATE INDEX idx_time_entries_tech_date ON time_entries(technician_id, date);

CREATE INDEX idx_comments_project       ON comments(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_comments_ticket        ON comments(ticket_id)  WHERE ticket_id  IS NOT NULL;

CREATE INDEX idx_status_history_entity  ON status_history(entity_type, entity_id, created_at);

CREATE INDEX idx_attachments_project    ON attachments(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_attachments_ticket     ON attachments(ticket_id)  WHERE ticket_id  IS NOT NULL;

CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, read_at);
CREATE INDEX idx_notifications_pending   ON notifications(status, scheduled_at)
  WHERE status IN ('pending', 'sending') AND channel IN ('email', 'whatsapp');

CREATE INDEX idx_external_time_unique ON external_time_entries(source_system, external_id);