ALTER TABLE project_screens DROP CONSTRAINT screen_environment_check;

ALTER TABLE project_screens
  ADD CONSTRAINT screen_environment_check
  CHECK (environment IN ('exterior', 'interior', 'semi_exterior', 'interior_flexible'));

COMMENT ON COLUMN project_screens.environment IS
  'Ubicación de la pantalla: exterior, interior, semi_exterior o interior_flexible (null = sin especificar).';