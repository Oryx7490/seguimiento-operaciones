-- 059_project_screens_installed_at.sql
ALTER TABLE project_screens
  ADD COLUMN IF NOT EXISTS screen_installed_at timestamptz;

-- Backfill: si installed y sin fecha, usar actual_end_date fase Instalación o now
UPDATE project_screens ps
SET screen_installed_at = COALESCE(
  (SELECT ph.actual_end_date
     FROM project_phases ph
    WHERE ph.project_id = ps.project_id
      AND ph.name = 'Instalación'
      AND ph.actual_end_date IS NOT NULL
    ORDER BY ph.actual_end_date DESC
    LIMIT 1),
  now()
)
WHERE ps.installed = true
  AND ps.cancelled = false
  AND ps.screen_installed_at IS NULL;
