-- 009_technician_profiles.sql
-- Catálogo de habilidades (especialidades), perfil ampliado del técnico y
-- expediente confidencial (INE, pasaporte, CURP, ...) visible solo para el admin.

-- ---------------------------------------------------------------- catálogo
CREATE TABLE specialties (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX specialties_name_lower_key ON specialties (lower(name));
CREATE TRIGGER trg_specialties_updated BEFORE UPDATE ON specialties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- habilidad por técnico: 'approved' (en su perfil) o 'pending' (propuesta por aprobar)
CREATE TABLE technician_specialties (
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  specialty_id  uuid NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  PRIMARY KEY (technician_id, specialty_id)
);
COMMENT ON TABLE technician_specialties IS 'Habilidades del técnico. status=pending cuando el técnico propuso una habilidad nueva y el admin aún no la aprueba.';

-- Migrar el arreglo de texto libre existente al catálogo normalizado.
INSERT INTO specialties (name)
SELECT DISTINCT trim(s)
  FROM technicians t
  CROSS JOIN LATERAL unnest(t.specialties) AS s
 WHERE trim(s) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO technician_specialties (technician_id, specialty_id, status)
SELECT DISTINCT t.id, sp.id, 'approved'
  FROM technicians t
  CROSS JOIN LATERAL unnest(t.specialties) AS s
  JOIN specialties sp ON lower(sp.name) = lower(trim(s))
 WHERE trim(s) <> ''
ON CONFLICT DO NOTHING;

ALTER TABLE technicians DROP COLUMN specialties;

-- ---------------------------------------------------------------- perfil
ALTER TABLE technicians
  ADD COLUMN IF NOT EXISTS nss                     text,
  ADD COLUMN IF NOT EXISTS curp                    text,
  ADD COLUMN IF NOT EXISTS address                 text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS admin_notes             text;

-- ---------------------------------------------------------------- expediente
CREATE TABLE technician_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  doc_type      text NOT NULL CHECK (doc_type IN ('ine', 'passport', 'curp', 'proof_address', 'contract', 'nss', 'other')),
  file_name     text NOT NULL,
  storage_key   text NOT NULL,
  mime_type     text,
  size_bytes    bigint,
  notes         text,
  uploaded_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX technician_documents_tech_idx ON technician_documents (technician_id);
COMMENT ON TABLE technician_documents IS 'Expediente confidencial del técnico: solo el administrador sube y consulta estos documentos (INE, pasaporte, CURP, etc.).';
