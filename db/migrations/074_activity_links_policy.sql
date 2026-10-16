-- 074_activity_links_policy.sql
-- Permite que una actividad se ligue a una póliza de mantenimiento (V61).
CREATE OR REPLACE FUNCTION public.check_activity_links()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM activity_projects ap WHERE ap.activity_id = NEW.id)
     AND NEW.ticket_id IS NULL
     AND NEW.maintenance_policy_id IS NULL
     AND NEW.internal_activity_type_id IS NULL THEN
    RAISE EXCEPTION 'Actividad % sin relación: debe ligarse a un proyecto, un ticket, una póliza o un tipo interno', NEW.id;
  END IF;
  RETURN NEW;
END $function$;
