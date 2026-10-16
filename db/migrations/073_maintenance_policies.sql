-- 073_maintenance_policies.sql
-- Pólizas de mantenimiento (V61): contratos de servicio recurrente por cliente,
-- y su vínculo con actividades (nuevo tipo "Póliza de mantenimiento").

CREATE TABLE maintenance_policies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  location_id  uuid REFERENCES locations(id) ON DELETE SET NULL,
  name         text NOT NULL,
  policy_type  text NOT NULL CHECK (policy_type IN ('content_changes', 'corrective_preventive')),
  description  text,
  start_date   date,
  end_date     date,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_policies_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_maintenance_policies_client ON maintenance_policies (client_id);
CREATE INDEX idx_maintenance_policies_status ON maintenance_policies (status);

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS maintenance_policy_id uuid REFERENCES maintenance_policies(id) ON DELETE SET NULL;
CREATE INDEX idx_activities_policy ON activities (maintenance_policy_id) WHERE maintenance_policy_id IS NOT NULL;

COMMENT ON TABLE maintenance_policies IS
  'Pólizas de mantenimiento por cliente (cambios de contenido o mantenimiento correctivo/preventivo).';
COMMENT ON COLUMN activities.maintenance_policy_id IS
  'Póliza de mantenimiento que atiende la actividad (tipo de actividad "póliza").';

-- Sección de navegación/permisos para el catálogo de pólizas.
INSERT INTO role_permissions (role_id, section_key, can_view, can_create, can_update, can_delete, can_export)
SELECT r.id,
       'admin.polizas',
       true,
       r.code IN ('admin', 'coordinator'),
       r.code IN ('admin', 'coordinator'),
       r.code = 'admin',
       false
FROM roles r
ON CONFLICT (role_id, section_key) DO NOTHING;
