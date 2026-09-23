CREATE TABLE IF NOT EXISTS ticket_closures (
  ticket_id        uuid PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
  repair_note      text,
  billing_authorized boolean NOT NULL DEFAULT false,
  billable         boolean NOT NULL DEFAULT true,
  warranty         boolean NOT NULL DEFAULT false,
  charge_amount    numeric(12,2),
  charge_description text,
  authorized_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  authorized_at    timestamptz,
  invoice_generated boolean NOT NULL DEFAULT false,
  invoice_id       text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ticket_closures IS 'Cierre de ticket con autorización de facturación. warranty=true implica billable=false.';

CREATE TRIGGER trg_ticket_closures_updated
  BEFORE UPDATE ON ticket_closures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();