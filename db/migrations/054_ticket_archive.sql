-- Archivar tickets cerrados.
-- El archivo es blando: se puede desarchivar en cualquier momento y no afecta
-- a Gantt, pendientes ni dashboard (que ya excluyen cerrados).

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tickets_archived_at
  ON tickets (archived_at)
  WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN tickets.archived_at IS
  'Si no es NULL, el ticket (se espera que esté cerrado) se oculta de la sección Tickets. Permite desarchivarlo.';
COMMENT ON INDEX idx_tickets_archived_at IS
  'Índice parcial para listar/contar tickets archivados sin tocar el resto.';