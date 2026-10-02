ALTER TABLE inventory_lots
  ADD COLUMN expected_arrival date;

COMMENT ON COLUMN inventory_lots.expected_arrival IS
  'Fecha estimada de llegada de los módulos (para lotes en estado ordered o in_transit). Se usa en las proyecciones del inventario.';