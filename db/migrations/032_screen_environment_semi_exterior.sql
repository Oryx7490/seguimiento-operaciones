ALTER TABLE project_screens DROP CONSTRAINT screen_environment_check;

ALTER TABLE project_screens
  ADD CONSTRAINT screen_environment_check
  CHECK (environment IN ('exterior', 'interior', 'semi_exterior'));

COMMENT ON COLUMN project_screens.environment IS
  'Ubicación de la pantalla: exterior, interior o semi_exterior (null = sin especificar).';