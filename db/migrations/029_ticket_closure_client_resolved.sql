ALTER TABLE ticket_closures
  ADD COLUMN client_resolved boolean NOT NULL DEFAULT false;

-- Exclusividad del tipo de servicio en el cierre:
-- client_resolved no puede combinarse con warranty ni billable;
-- warranty no puede combinarse con billable.
ALTER TABLE ticket_closures
  ADD CONSTRAINT ticket_closure_service_type CHECK (
    (NOT client_resolved OR (NOT warranty AND NOT billable))
    AND NOT (warranty AND billable)
  );

COMMENT ON COLUMN ticket_closures.client_resolved IS 'Ticket resuelto por el cliente; ya no se requiere visita (sin cargo).';