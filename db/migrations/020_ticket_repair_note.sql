ALTER TABLE tickets
  ADD COLUMN repair_note text;

COMMENT ON COLUMN tickets.repair_note IS 'Nota de lo que se reparó (para cierre del ticket)';