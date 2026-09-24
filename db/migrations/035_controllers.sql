-- Catálogo de controladores (equipos de pantalla): Novastar y otros.
CREATE TABLE IF NOT EXISTS controller_catalog (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  brand      text,
  ownership  text NOT NULL DEFAULT 'propio'
             CHECK (ownership IN ('propio', 'cliente', 'tercero')),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE controller_catalog IS
  'Catálogo de controladores de pantalla (Novastar y otras marcas), con la procedencia: propio, del cliente o de terceros.';

-- Equipos considerados en la cotización, por pantalla del proyecto.
CREATE TABLE IF NOT EXISTS screen_controllers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id     uuid NOT NULL REFERENCES project_screens(id) ON DELETE CASCADE,
  controller_id uuid NOT NULL REFERENCES controller_catalog(id),
  quantity      integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (screen_id, controller_id)
);

COMMENT ON TABLE screen_controllers IS
  'Controladores considerados desde la cotización para cada pantalla de un proyecto.';

-- Equipos definitivos utilizados en la instalación, con números de serie, por pantalla.
CREATE TABLE IF NOT EXISTS project_closure_controllers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  screen_id       uuid REFERENCES project_screens(id) ON DELETE SET NULL,
  controller_id   uuid REFERENCES controller_catalog(id) ON DELETE SET NULL,
  controller_name text NOT NULL,
  quantity        integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  serial_numbers  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE project_closure_controllers IS
  'Equipos definitivos utilizados en la implementación final, con números de serie. Pueden diferir de la cotización.';

-- Equipos de uso habitual como punto de partida del catálogo.
INSERT INTO controller_catalog (name, brand, ownership) VALUES
  ('MCTRL300',  'Novastar',  'propio'),
  ('MCTRL4K',   'Novastar',  'propio'),
  ('MCTRL4K-II','Novastar',  'propio'),
  ('VX400s',    'Novastar',  'propio'),
  ('VX600s',    'Novastar',  'propio'),
  ('H2',        'Novastar',  'propio'),
  ('X6',        'Colorlight','propio'),
  ('X12',       'Colorlight','propio'),
  ('Tessera S4','Brompton',  'propio')
ON CONFLICT DO NOTHING;