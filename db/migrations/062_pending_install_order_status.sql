-- Pantallas por instalarse (V47): orden manual global + indicador de color.
--   install_sort      -> orden manual de la lista global de pendientes (independiente del
--                        sort_order por proyecto de la migración 056).
--   assembly_status   -> estado de ensamblado para la planeación de instalación:
--                        'to_assemble' (amarillo: por armar), 'ready' (verde: lista para instalar),
--                        NULL (blanco: sin marca).
ALTER TABLE project_screens
  ADD COLUMN IF NOT EXISTS install_sort integer,
  ADD COLUMN IF NOT EXISTS assembly_status text;

ALTER TABLE project_screens
  ADD CONSTRAINT project_screens_assembly_status_check
  CHECK (assembly_status IS NULL OR assembly_status IN ('to_assemble', 'ready'));

-- Backfill: conserva el orden actual de la lista global (código de proyecto, tipo).
WITH ranked AS (
  SELECT ps.id, (ROW_NUMBER() OVER (ORDER BY pr.code, ps.screen_type, ps.id) - 1) AS rn
  FROM project_screens ps
  JOIN projects pr ON pr.id = ps.project_id
  WHERE ps.cancelled = false AND ps.installed = false
)
UPDATE project_screens ps SET install_sort = r.rn FROM ranked r WHERE r.id = ps.id;

CREATE INDEX IF NOT EXISTS idx_project_screens_install_sort ON project_screens(install_sort);
