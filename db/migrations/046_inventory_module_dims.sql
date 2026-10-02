-- Medidas del módulo en milímetros. La gran mayoría es 320 × 160.
ALTER TABLE inventory_lots
  ADD COLUMN IF NOT EXISTS width_mm numeric NOT NULL DEFAULT 320,
  ADD COLUMN IF NOT EXISTS height_mm numeric NOT NULL DEFAULT 160;

ALTER TABLE inventory_lots DROP CONSTRAINT IF EXISTS inventory_lots_dims_check;
ALTER TABLE inventory_lots
  ADD CONSTRAINT inventory_lots_dims_check CHECK (width_mm > 0 AND height_mm > 0);

COMMENT ON COLUMN inventory_lots.width_mm IS 'Ancho del módulo en mm. Equivale a m² = ancho × alto / 1e6.';
COMMENT ON COLUMN inventory_lots.height_mm IS 'Alto del módulo en mm.';
