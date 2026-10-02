ALTER TABLE screen_controllers
  ADD COLUMN IF NOT EXISTS installed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN screen_controllers.installed IS
  'El controlador de esta pantalla ya está instalado.';
