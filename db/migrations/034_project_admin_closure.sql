CREATE TABLE IF NOT EXISTS project_admin_closure (
  project_id         uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  cobro              boolean NOT NULL DEFAULT false,
  facturacion        boolean NOT NULL DEFAULT false,
  evidencias         boolean NOT NULL DEFAULT false,
  finiquito          boolean NOT NULL DEFAULT false,
  complemento_fiscal boolean NOT NULL DEFAULT false,
  note               text,
  updated_by         uuid REFERENCES users(id),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE project_admin_closure IS
  'Checklist administrativo del cierre de proyecto (cobros, facturación, evidencias, finiquito, complemento fiscal).';