-- 083_activity_time_allocations.sql
-- Distribución de las horas trabajadas de un técnico entre las actividades del día (V74).
-- El porcentaje se aplica a las horas de asistencia del día; la suma por actividad
-- se refleja como horas hombre del proyecto/ticket.

CREATE TABLE activity_time_allocations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  date          date NOT NULL,
  activity_id   uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  percent       numeric(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (technician_id, date, activity_id)
);
CREATE INDEX idx_activity_time_allocations_tech_date ON activity_time_allocations (technician_id, date);
CREATE INDEX idx_activity_time_allocations_activity ON activity_time_allocations (activity_id);

COMMENT ON TABLE activity_time_allocations IS
  'Porcentaje de la jornada de un técnico asignado a cada actividad; las horas se calculan sobre la asistencia del día.';

-- Sección de navegación/permisos.
INSERT INTO role_permissions (role_id, section_key, can_view, can_create, can_update, can_delete, can_export)
SELECT r.id,
       'admin.distribuir_horas',
       true,
       r.code IN ('admin', 'coordinator'),
       r.code IN ('admin', 'coordinator'),
       r.code = 'admin',
       false
FROM roles r
ON CONFLICT (role_id, section_key) DO NOTHING;
