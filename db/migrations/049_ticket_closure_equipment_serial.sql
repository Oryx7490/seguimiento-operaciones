ALTER TABLE ticket_closures
  ADD COLUMN IF NOT EXISTS equipment_serial_number text;

COMMENT ON COLUMN ticket_closures.equipment_serial_number IS
  'Número de serie del equipo o pantalla reparada durante el servicio.';
