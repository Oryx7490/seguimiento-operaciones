-- Un catálogo con baja lógica no puede prohibir el mismo nombre para siempre.
--
-- idx_screen_catalog_client_name era único sobre (client_id, lower(name)) sin
-- filtro: al desactivar una pantalla (DELETE = active=false, como en
-- controller_catalog) el nombre quedaba bloqueado para esa cuenta y no se
-- podía volver a crear. La unicidad solo tiene sentido entre las activas.

DROP INDEX IF EXISTS idx_screen_catalog_client_name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_screen_catalog_active_name
  ON screen_catalog (client_id, lower(name))
  WHERE active;

COMMENT ON INDEX idx_screen_catalog_active_name IS
  'Nombre único entre las pantallas activas de una cuenta. Las inactivas pueden repetirlo para conservar el histórico.';