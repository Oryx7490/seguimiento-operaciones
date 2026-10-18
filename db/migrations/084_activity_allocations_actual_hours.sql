-- V74: conservar horas efectivamente asignadas; migrar los porcentajes existentes.
ALTER TABLE activity_time_allocations
  ADD COLUMN hours numeric(6,2) NOT NULL DEFAULT 0 CHECK (hours >= 0);

UPDATE activity_time_allocations ata
   SET hours = CASE
     WHEN ae.check_in IS NOT NULL AND ae.check_out IS NOT NULL AND COALESCE(ae.hours,0) > 0
       THEN round(ae.hours * ata.percent / 100, 2)
     ELSE 0
   END
  FROM attendance_entries ae
 WHERE ae.technician_id = ata.technician_id AND ae.date = ata.date;

ALTER TABLE activity_time_allocations
  DROP COLUMN percent,
  ALTER COLUMN hours DROP DEFAULT;

COMMENT ON COLUMN activity_time_allocations.hours IS
  'Horas reales distribuidas entre actividades desde una jornada completa; en horas decimales con dos posiciones.';
