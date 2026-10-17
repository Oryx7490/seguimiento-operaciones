-- 077_whatsapp_policy_document_links.sql
-- Permite asociar documentos de WhatsApp y su revisión con pólizas de mantenimiento.

ALTER TABLE whatsapp_capture.message_entity_links
  ADD COLUMN maintenance_policy_id uuid REFERENCES maintenance_policies(id) ON DELETE RESTRICT;

ALTER TABLE whatsapp_capture.message_entity_links
  DROP CONSTRAINT message_entity_link_exactly_one_target;

ALTER TABLE whatsapp_capture.message_entity_links
  ADD CONSTRAINT message_entity_link_exactly_one_target CHECK (
    (project_id IS NOT NULL)::int +
    (ticket_id IS NOT NULL)::int +
    (activity_id IS NOT NULL)::int +
    (technician_id IS NOT NULL)::int +
    (maintenance_policy_id IS NOT NULL)::int = 1
  );

CREATE INDEX idx_whatsapp_entity_links_policy
  ON whatsapp_capture.message_entity_links (maintenance_policy_id, status)
  WHERE maintenance_policy_id IS NOT NULL;

ALTER TABLE whatsapp_capture.expense_photo_reviews
  ADD COLUMN reviewed_ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_maintenance_policy_id uuid REFERENCES maintenance_policies(id) ON DELETE SET NULL;

ALTER TABLE whatsapp_capture.expense_photo_reviews
  ADD CONSTRAINT expense_photo_reviews_at_most_one_destination CHECK (
    (reviewed_project_id IS NOT NULL)::int +
    (reviewed_ticket_id IS NOT NULL)::int +
    (reviewed_maintenance_policy_id IS NOT NULL)::int <= 1
  );

COMMENT ON COLUMN whatsapp_capture.message_entity_links.maintenance_policy_id IS
  'Póliza de mantenimiento asociada a una fotografía o documento de WhatsApp.';
COMMENT ON COLUMN whatsapp_capture.expense_photo_reviews.reviewed_ticket_id IS
  'Ticket asociado por revisión humana al documento fotografiado.';
COMMENT ON COLUMN whatsapp_capture.expense_photo_reviews.reviewed_maintenance_policy_id IS
  'Póliza de mantenimiento asociada por revisión humana al documento fotografiado.';

CREATE INDEX idx_expense_photo_reviews_ticket
  ON whatsapp_capture.expense_photo_reviews (reviewed_ticket_id)
  WHERE reviewed_ticket_id IS NOT NULL;
CREATE INDEX idx_expense_photo_reviews_policy
  ON whatsapp_capture.expense_photo_reviews (reviewed_maintenance_policy_id)
  WHERE reviewed_maintenance_policy_id IS NOT NULL;
