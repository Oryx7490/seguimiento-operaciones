-- 002_seed.sql
-- Catálogos iniciales y usuario administrador de arranque.

INSERT INTO priorities (name, sort_order) VALUES
  ('Urgente', 1),
  ('Alta',    2),
  ('Media',   3),
  ('Baja',    4);

INSERT INTO phase_catalog (name, sort_order) VALUES
  ('Planeación',   1),
  ('Armado',       2),
  ('Instalación',  3),
  ('Cierre',       4);

INSERT INTO internal_activity_types (name, requires_approval, sort_order) VALUES
  ('Vacaciones',               true,  1),
  ('Enfermedad',               true,  2),
  ('Permiso',                  true,  3),
  ('Capacitación',             false, 4),
  ('Bodega o preparación',     false, 5),
  ('Traslado',                 false, 6),
  ('Reunión',                  false, 7),
  ('Actividad administrativa', false, 8);

INSERT INTO ticket_channels (name) VALUES
  ('Teléfono'),
  ('Correo'),
  ('WhatsApp'),
  ('Personal'),
  ('Sitio web'),
  ('Interno');

-- Administrador de arranque. password_hash se asigna al configurar el inicio de sesión (Fase 1).
INSERT INTO users (name, email, role)
VALUES ('Administrador', 'admin@seguimiento.local', 'admin')
ON CONFLICT (email) DO NOTHING;