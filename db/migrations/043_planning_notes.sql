-- Comentarios opcionales de planeación de inventario, por pantalla y por controlador asignado.
ALTER TABLE project_screens
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE screen_controllers
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN project_screens.notes IS
  'Comentario opcional de planeación de inventario para esta pantalla.';

COMMENT ON COLUMN screen_controllers.notes IS
  'Comentario opcional de planeación para este controlador en la pantalla.';
