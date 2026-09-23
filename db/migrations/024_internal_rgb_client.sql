-- Los tickets internos pertenecen operativamente a RGB.
-- Se crea el cliente base si todavía no existe y se vinculan los tickets
-- internos históricos que aún no tenían cliente.
INSERT INTO clients (name, active)
SELECT 'RGB', true
WHERE NOT EXISTS (
  SELECT 1 FROM clients WHERE lower(trim(name)) = 'rgb'
);

UPDATE tickets
SET client_id = (
  SELECT id FROM clients WHERE lower(trim(name)) = 'rgb' ORDER BY created_at LIMIT 1
)
WHERE ticket_type = 'internal'
  AND client_id IS NULL;
