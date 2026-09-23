-- Refuerza la regla de negocio: todo ticket interno pertenece al cliente RGB.
UPDATE tickets
SET client_id = (
  SELECT id FROM clients WHERE lower(trim(name)) = 'rgb' ORDER BY created_at LIMIT 1
)
WHERE ticket_type = 'internal'
  AND client_id IS DISTINCT FROM (
    SELECT id FROM clients WHERE lower(trim(name)) = 'rgb' ORDER BY created_at LIMIT 1
  );
