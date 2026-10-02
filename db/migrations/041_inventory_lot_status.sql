ALTER TABLE inventory_lots
  ADD COLUMN status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'ordered', 'in_transit'));

COMMENT ON COLUMN inventory_lots.status IS
  'Disponibilidad física del lote: available = físicamente disponible, ordered = ya se ordenó, in_transit = viene en trayecto de envío.';