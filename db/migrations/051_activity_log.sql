-- Bitácora general de la aplicación y presencia de usuarios.
--
-- status_history solo registra transiciones de estado. Aquí queda toda acción
-- relevante (crear, editar, eliminar, asignar, comentar, subir evidencia,
-- cerrar, inventariar) con el usuario que la ejecutó, para poder auditar quién
-- hizo qué y cuándo.

CREATE TABLE IF NOT EXISTS activity_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id   uuid,
  entity_label text,
  action      text NOT NULL,
  summary     text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,
  ticket_id   uuid REFERENCES tickets(id) ON DELETE SET NULL,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name  text,
  actor_role  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE activity_log IS
  'Bitácora de acciones: entity_type (project, ticket, activity, screen, assignment, comment, attachment, inventory, planning, user), action (create, update, status_change, delete, restore, assign, unassign, comment, upload, login, presence) y summary legible en español.';
COMMENT ON COLUMN activity_log.entity_id IS
  'Entidad afectada. Sin llave foránea intencional: la bitácora conserva la referencia aunque la entidad se elimine.';
COMMENT ON COLUMN activity_log.entity_label IS
  'Código o nombre de la entidad al momento del movimiento (TK-014, PROY-003, lote, etc.) para leer la bitácora sin resolver joins.';
COMMENT ON COLUMN activity_log.actor_id IS
  'Usuario que ejecutó la acción. ON DELETE SET NULL: si se borra el usuario, el registro se conserva con actor_name.';
COMMENT ON COLUMN activity_log.details IS
  'Campos modificados o contexto adicional en jsonb. Nunca guarda datos sensibles.';

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON activity_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_project ON activity_log (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_ticket ON activity_log (ticket_id, created_at DESC);

-- Presencia: un renglón por usuario con su último latido. Sirve para el
-- contador de usuarios concurrentes y para saber quién está operando ahora.
CREATE TABLE IF NOT EXISTS user_presence (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE user_presence IS
  'Último latido por usuario. Un usuario se considera en línea si last_seen_at es posterior a now() - 5 minutos.';

CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON user_presence (last_seen_at DESC);
