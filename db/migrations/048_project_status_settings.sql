CREATE TABLE IF NOT EXISTS project_status_settings (
  status       project_status PRIMARY KEY,
  label        text NOT NULL CHECK (length(trim(label)) > 0),
  color        text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order   integer NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE project_status_settings IS
  'Etiqueta visible y color configurable para cada estado técnico de proyecto.';

INSERT INTO project_status_settings (status, label, color, sort_order) VALUES
  ('new',                   'Nuevo',                    '#71717A', 10),
  ('planning',              'Planeación',               '#3B82F6', 20),
  ('waiting_authorization', 'Esperando autorización',   '#8B5CF6', 30),
  ('waiting_materials',     'Esperando materiales',     '#D946EF', 40),
  ('assembly',              'Armado',                   '#6366F1', 50),
  ('ready_install',         'Listo para instalar',      '#06B6D4', 60),
  ('installation',          'Instalación',              '#EC4899', 70),
  ('pending_docs',          'Pendiente de documentos',  '#F59E0B', 80),
  ('closed',                'Cerrado',                  '#10B981', 90),
  ('cancelled',             'Cancelado',                '#EF4444', 100)
ON CONFLICT (status) DO NOTHING;
