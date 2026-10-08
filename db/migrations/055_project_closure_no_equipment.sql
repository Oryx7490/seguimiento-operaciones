ALTER TABLE project_closure_controllers
  ADD COLUMN IF NOT EXISTS no_equipment boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN project_closure_controllers.no_equipment IS
  'True si la pantalla no utiliza un controlador propio o comparte un controlador ya considerado en otra pantalla.';

ALTER TABLE project_closure_controllers
  ADD CONSTRAINT project_closure_controllers_no_equipment_check
  CHECK (no_equipment = false OR controller_id IS NULL);

COMMENT ON CONSTRAINT project_closure_controllers_no_equipment_check ON project_closure_controllers IS
  'Una fila "sin equipo" no debe referenciar un controlador del catálogo.';