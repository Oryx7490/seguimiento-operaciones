-- Catálogo de pantallas por cuenta (cliente) y vínculo opcional desde la pantalla del proyecto.
--
-- Hoy project_screens.screen_type es texto libre y sus medidas se capturan una por
-- una en cada proyecto, así que el mismo tipo de pantalla ("AVE Lácteos",
-- "Cenefa Recta") se repite sin que nada lo gobierne y sin forma de saber de qué
-- cuenta es cada diseño. Aquí se define una pantalla una sola vez por cuenta
-- (Diafi, Mundo E o la que se agregue después) y cada pantalla de proyecto puede
-- referirse a ella.
--
-- Patrón calcado de controller_catalog: el catálogo guarda la definición, la
-- pantalla del proyecto conserva su propia medida (no se sobrescribe al
-- vincular) y el borrado del catálogo deja la referencia en NULL para no perder
-- el histórico del proyecto.

CREATE TABLE IF NOT EXISTS screen_catalog (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name         text NOT NULL,
  width_m      numeric,
  height_m     numeric,
  is_irregular boolean NOT NULL DEFAULT false,
  area_m2      numeric,
  pitch_mm     numeric,
  environment  text,
  voltage      text,
  notes        text,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE screen_catalog IS
  'Pantallas definidas por cuenta (cliente). Se relacionan con project_screens.screen_catalog_id.';
COMMENT ON COLUMN screen_catalog.name IS
  'Nombre de la pantalla dentro de la cuenta, por ejemplo "AVE Lácteos". Único por cuenta, sin distinguir mayúsculas.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_screen_catalog_client_name
  ON screen_catalog (client_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_screen_catalog_client_active
  ON screen_catalog (client_id, active);

ALTER TABLE project_screens
  ADD COLUMN IF NOT EXISTS screen_catalog_id uuid REFERENCES screen_catalog(id) ON DELETE SET NULL;

COMMENT ON COLUMN project_screens.screen_catalog_id IS
  'Pantalla del catálogo de la cuenta del proyecto. NULL si la pantalla es propia del proyecto.';

CREATE INDEX IF NOT EXISTS idx_project_screens_catalog
  ON project_screens (screen_catalog_id);