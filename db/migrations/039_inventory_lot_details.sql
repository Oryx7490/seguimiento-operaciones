ALTER TABLE inventory_lots
  ADD COLUMN pitch_mm     numeric,
  ADD COLUMN module_type  text,
  ADD COLUMN led_type     text,
  ADD COLUMN observations text,
  ADD COLUMN ic_serial_1  text,
  ADD COLUMN ic_serial_2  text,
  ADD COLUMN ic_serial_3  text;

COMMENT ON COLUMN inventory_lots.pitch_mm IS 'Paso (pitch) del módulo en mm.';
COMMENT ON COLUMN inventory_lots.ic_serial_1 IS 'Número de serie del 1er integrado de control del módulo.';