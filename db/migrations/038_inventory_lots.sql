CREATE TABLE IF NOT EXISTS inventory_lots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_brand text NOT NULL,
  lot_number         text NOT NULL,
  module_count       integer NOT NULL CHECK (module_count > 0),
  location           text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_lots_brand_lot
  ON inventory_lots (LOWER(manufacturer_brand), LOWER(lot_number));

CREATE INDEX IF NOT EXISTS idx_inventory_lots_location ON inventory_lots (location);

CREATE TRIGGER trg_inventory_lots_updated
  BEFORE UPDATE ON inventory_lots FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE inventory_lots IS
  'Inventario inicial de módulos LED importado/formulado: marca + lote + cantidad (+ ubicación). Se compara contra project_closure_module_lots para detectar faltantes y sobrantes.';