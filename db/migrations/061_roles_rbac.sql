-- 061_roles_rbac.sql
-- RBAC por secciones: roles, permisos por rol, asignación multi-rol a usuarios
-- Mantiene compatibilidad hacia atrás con users.role (enum user_role existente)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role_code') THEN
    CREATE TYPE app_role_code AS ENUM (
      'admin',
      'coordinator',
      'technician',
      'vendedor',
      'tecnico_operativo',
      'director_proyecto',
      'finanzas',
      'logistica',
      'gerente'
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code app_role_code NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_create boolean NOT NULL DEFAULT false,
  can_update boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_export boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, section_key)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles (role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions (role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_section_key ON role_permissions (section_key);

CREATE OR REPLACE FUNCTION set_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roles_updated ON roles;
CREATE TRIGGER trg_roles_updated
  BEFORE UPDATE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION set_roles_updated_at();

DROP TRIGGER IF EXISTS trg_role_permissions_updated ON role_permissions;
CREATE TRIGGER trg_role_permissions_updated
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION set_roles_updated_at();

INSERT INTO roles (code, name, description, is_system) VALUES
  ('admin', 'Administrador', 'Acceso completo a configuración y operación', true),
  ('coordinator', 'Coordinador', 'Coordinación de proyectos y tickets', true),
  ('technician', 'Técnico', 'Operación técnica y agenda', true),
  ('vendedor', 'Vendedor', 'Ventas y seguimiento comercial', true),
  ('tecnico_operativo', 'Técnico Operativo', 'Soporte operativo en campo', true),
  ('director_proyecto', 'Director de Proyecto', 'Supervisión y control de proyectos', true),
  ('finanzas', 'Finanzas', 'Control financiero y reportes', true),
  ('logistica', 'Logística', 'Inventario, planeación y logística', true),
  ('gerente', 'Gerente', 'Visión gerencial y reportes', true)
ON CONFLICT (code) DO NOTHING;

-- Seed permisos por sección
INSERT INTO role_permissions (role_id, section_key, can_view, can_create, can_update, can_delete, can_export)
SELECT r.id, s.key, s.view, s.c, s.u, s.d, s.e
FROM roles r
CROSS JOIN LATERAL (VALUES
  ('inicio',true,false,false,false,false),
  ('agenda',true,true,true,false,false),
  ('gantt',true,true,true,false,false),
  ('gantt_tickets',true,true,true,false,false),
  ('proyectos',true,true,true,false,false),
  ('tickets',true,true,true,false,false),
  ('pendientes',true,true,true,false,false),
  ('notificaciones',true,false,false,false,false),
  ('tecnico_movil',true,true,true,false,false),
  ('ayuda',true,false,false,false,false),
  ('admin',true,false,false,false,false),
  ('admin.usuarios',true,true,true,true,false),
  ('admin.tecnicos',true,true,true,false,false),
  ('admin.clientes',true,true,true,false,false),
  ('admin.ubicaciones',true,true,true,false,false),
  ('admin.catalogos',true,true,true,false,false),
  ('admin.controladores',true,true,true,false,false),
  ('admin.catalogo_pantallas',true,true,true,false,false),
  ('admin.especialidades',true,true,true,false,false),
  ('admin.calendario',true,true,true,false,false),
  ('admin.revision_pantallas',true,true,false,false,false),
  ('admin.inventario',true,true,true,false,false),
  ('admin.planeacion',true,true,true,false,false),
  ('admin.cierre',true,true,true,false,false),
  ('admin.horas_extra',true,true,true,false,false),
  ('admin.notificaciones',true,true,true,false,false),
  ('bitacora',true,false,false,false,false),
  ('admin.agentes',true,true,true,true,false),
  ('admin.kpis_semanales',true,true,true,false,true),
  ('pantallas_pendientes',true,true,false,false,false),
  ('admin.roles',true,true,true,true,false)
) AS s(key, view, c, u, d, e)
ON CONFLICT (role_id, section_key) DO NOTHING;

-- Ajustes admin/coordinator/technician
UPDATE role_permissions rp SET can_view=true, can_create=true, can_update=true, can_delete=true, can_export=true
FROM roles r WHERE rp.role_id=r.id AND r.code='admin';

UPDATE role_permissions rp SET can_export = CASE WHEN rp.section_key IN ('admin.kpis_semanales') THEN true ELSE can_export END, can_delete=false
FROM roles r WHERE rp.role_id=r.id AND r.code='coordinator';

UPDATE role_permissions rp
SET can_create = CASE WHEN rp.section_key IN ('agenda','tecnico_movil','proyectos','tickets','pendientes','notificaciones','ayuda') THEN true ELSE false END,
    can_update = CASE WHEN rp.section_key IN ('agenda','tecnico_movil','proyectos','tickets','pendientes') THEN true ELSE false END,
    can_delete=false, can_export=false
FROM roles r WHERE rp.role_id=r.id AND r.code='technician';

UPDATE role_permissions rp
SET can_create = CASE WHEN rp.section_key IN ('agenda','tecnico_movil','tickets','pendientes','notificaciones','ayuda') THEN true ELSE false END,
    can_update = CASE WHEN rp.section_key IN ('agenda','tecnico_movil','tickets','pendientes') THEN true ELSE false END,
    can_delete=false, can_export=false
FROM roles r WHERE rp.role_id=r.id AND r.code='tecnico_operativo';

UPDATE role_permissions rp
SET can_create = CASE WHEN rp.section_key IN ('proyectos','gantt','tickets','pendientes','agenda') THEN true ELSE false END,
    can_update = CASE WHEN rp.section_key IN ('proyectos','gantt','tickets','pendientes','agenda') THEN true ELSE false END,
    can_delete=false, can_export = CASE WHEN rp.section_key='admin.kpis_semanales' THEN true ELSE false END
FROM roles r WHERE rp.role_id=r.id AND r.code='director_proyecto';

UPDATE role_permissions rp
SET can_create = CASE WHEN rp.section_key IN ('proyectos','tickets','pendientes','agenda','admin.clientes') THEN true ELSE false END,
    can_update = CASE WHEN rp.section_key IN ('proyectos','tickets','pendientes','agenda','admin.clientes') THEN true ELSE false END,
    can_delete=false, can_export=false
FROM roles r WHERE rp.role_id=r.id AND r.code='vendedor';

UPDATE role_permissions rp
SET can_create=false, can_update=false, can_delete=false,
    can_export = CASE WHEN rp.section_key IN ('admin.kpis_semanales','proyectos','tickets','admin.horas_extra') THEN true ELSE false END
FROM roles r WHERE rp.role_id=r.id AND r.code='finanzas';

UPDATE role_permissions rp
SET can_create = CASE WHEN rp.section_key IN ('admin.inventario','admin.planeacion','proyectos','tickets','pendientes','pantallas_pendientes') THEN true ELSE false END,
    can_update = CASE WHEN rp.section_key IN ('admin.inventario','admin.planeacion','proyectos','tickets','pendientes','pantallas_pendientes') THEN true ELSE false END,
    can_delete=false,
    can_export = CASE WHEN rp.section_key IN ('admin.inventario','pantallas_pendientes') THEN true ELSE false END
FROM roles r WHERE rp.role_id=r.id AND r.code='logistica';

UPDATE role_permissions rp
SET can_create=false, can_update=false, can_delete=false,
    can_export = CASE WHEN rp.section_key IN ('admin.kpis_semanales','bitacora','proyectos','tickets') THEN true ELSE false END
FROM roles r WHERE rp.role_id=r.id AND r.code='gerente';

-- Backfill user_roles desde users.role
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.code::text = u.role::text
WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role_id=r.id);

-- Restricciones de visibilidad por rol
UPDATE role_permissions rp SET can_view = (rp.section_key NOT IN ('admin.roles','admin.agentes')) FROM roles r WHERE rp.role_id=r.id AND r.code='coordinator';
UPDATE role_permissions rp SET can_view = (rp.section_key IN ('inicio', 'agenda', 'gantt', 'gantt_tickets', 'proyectos', 'tickets', 'pendientes', 'notificaciones', 'tecnico_movil', 'ayuda', 'pantallas_pendientes')) FROM roles r WHERE rp.role_id=r.id AND r.code='technician';
UPDATE role_permissions rp SET can_view = (rp.section_key IN ('inicio', 'agenda', 'gantt', 'gantt_tickets', 'tickets', 'pendientes', 'notificaciones', 'tecnico_movil', 'ayuda', 'pantallas_pendientes')) FROM roles r WHERE rp.role_id=r.id AND r.code='tecnico_operativo';
UPDATE role_permissions rp SET can_view = (rp.section_key IN ('inicio', 'agenda', 'gantt', 'gantt_tickets', 'proyectos', 'tickets', 'pendientes', 'notificaciones', 'ayuda', 'admin.kpis_semanales', 'admin', 'bitacora', 'pantallas_pendientes')) FROM roles r WHERE rp.role_id=r.id AND r.code='director_proyecto';
UPDATE role_permissions rp SET can_view = (rp.section_key IN ('inicio', 'agenda', 'proyectos', 'tickets', 'pendientes', 'notificaciones', 'ayuda', 'admin.clientes', 'admin')) FROM roles r WHERE rp.role_id=r.id AND r.code='vendedor';
UPDATE role_permissions rp SET can_view = (rp.section_key IN ('inicio', 'agenda', 'proyectos', 'tickets', 'notificaciones', 'ayuda', 'admin.kpis_semanales', 'admin.horas_extra', 'admin', 'bitacora')) FROM roles r WHERE rp.role_id=r.id AND r.code='finanzas';
UPDATE role_permissions rp SET can_view = (rp.section_key IN ('inicio', 'agenda', 'proyectos', 'tickets', 'pendientes', 'notificaciones', 'ayuda', 'pantallas_pendientes', 'admin.inventario', 'admin.planeacion', 'admin')) FROM roles r WHERE rp.role_id=r.id AND r.code='logistica';
UPDATE role_permissions rp SET can_view = (rp.section_key IN ('inicio', 'agenda', 'gantt', 'gantt_tickets', 'proyectos', 'tickets', 'pendientes', 'notificaciones', 'ayuda', 'admin.kpis_semanales', 'admin', 'bitacora')) FROM roles r WHERE rp.role_id=r.id AND r.code='gerente';
