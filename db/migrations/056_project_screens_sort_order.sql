-- Orden manual de pantallas a instalar (V4): permite reordenar gráficamente la lista.
ALTER TABLE project_screens ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Backfill: conserva el orden actual (created_at) por proyecto.
WITH ranked AS (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at) - 1) AS rn
  FROM project_screens
)
UPDATE project_screens ps SET sort_order = r.rn FROM ranked r WHERE r.id = ps.id;

CREATE INDEX IF NOT EXISTS idx_project_screens_sort ON project_screens(project_id, sort_order);
