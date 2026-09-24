ALTER TABLE project_screens
  ADD COLUMN environment text;

ALTER TABLE project_screens
  ADD CONSTRAINT screen_environment_check
  CHECK (environment IN ('exterior', 'interior'));

COMMENT ON COLUMN project_screens.environment IS
  'Ubicación de la pantalla: exterior o interior (null = sin especificar).';