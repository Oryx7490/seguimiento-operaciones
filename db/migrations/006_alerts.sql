-- 006_alerts.sql
-- Fase 5: alertas configurables, plantillas de mensajes y registro de envíos.
-- Los umbrales viven en app_settings (no en el código), según el diseño.

-- ------------------------------------------------------- configuración editable
CREATE TABLE app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE app_settings IS 'Parámetros operativos editables (umbrales de alerta, destinatarios, canales).';

-- ------------------------------------------------------- plantillas de mensajes
CREATE TABLE notification_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  channel     notification_channel NOT NULL,
  subject     text,
  body        text NOT NULL,
  description text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, channel)
);
COMMENT ON TABLE notification_templates IS 'Cuerpo del mensaje por regla y canal. Variables {{code}}, {{title}}, {{name}}, {{days}}, {{hours}}, {{percent}}, {{date}}, {{link}}.';

-- ------------------------------------------------------- registro de envíos
CREATE TABLE notification_deliveries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id     uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel             notification_channel NOT NULL,
  provider            text,
  provider_message_id text,
  status              notification_status NOT NULL DEFAULT 'pending',
  error_message       text,
  attempted_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notification_deliveries_notification
  ON notification_deliveries(notification_id, attempted_at DESC);

-- ------------------------------------------------------- anti-duplicados
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedup_key text;
CREATE INDEX idx_notifications_dedup
  ON notifications(dedup_key, created_at DESC)
  WHERE dedup_key IS NOT NULL;

-- ------------------------------------------------------- umbrales por defecto
INSERT INTO app_settings (key, value, description) VALUES
  ('alert_ticket_unassigned_hours',            '4'::jsonb,  'Horas sin responsable antes de alertar un ticket.'),
  ('alert_ticket_no_update_days',              '3'::jsonb,  'Días sin actualización antes de alertar un ticket.'),
  ('alert_project_blocked_no_next_action_hours','24'::jsonb,'Horas de un proyecto bloqueado sin próxima acción.'),
  ('alert_activity_overdue_enabled',           'true'::jsonb,'Alertar actividades planeadas vencidas.'),
  ('alert_installation_no_delivery_sheet_days','2'::jsonb,  'Días con instalación terminada sin hoja de entrega.'),
  ('alert_ticket_resolved_unvalidated_days',   '2'::jsonb,  'Días de un ticket resuelto sin validación.'),
  ('alert_next_action_overdue_enabled',        'true'::jsonb,'Alertar próximas acciones con fecha vencida.'),
  ('alert_hours_over_planned_percent',         '20'::jsonb, 'Porcentaje de horas reales sobre planeadas que dispara alerta.'),
  ('alert_cooldown_hours',                     '24'::jsonb, 'Horas de enfriamiento para no repetir la misma alerta.'),
  ('alert_channels',                           '["system","email"]'::jsonb, 'Canales activos para envío de alertas.'),
  ('alert_recipient_roles',                    '["coordinator","admin"]'::jsonb, 'Roles que reciben las alertas.')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------- plantillas por defecto
INSERT INTO notification_templates (code, channel, subject, body, description) VALUES
  ('ticket_unassigned', 'system', NULL, 'El ticket {{code}} ({{title}}) sigue sin responsable desde hace {{hours}} h.', 'Ticket nuevo sin responsable'),
  ('ticket_unassigned', 'email', 'Ticket sin responsable: {{code}}', 'El ticket {{code}} ({{title}}) sigue sin responsable desde hace {{hours}} h.\n\nVer: {{link}}', 'Ticket nuevo sin responsable'),
  ('ticket_unassigned', 'whatsapp', NULL, '⚠ Ticket {{code}} sin responsable hace {{hours}} h: {{title}}', 'Ticket nuevo sin responsable'),

  ('ticket_no_update', 'system', NULL, 'El ticket {{code}} ({{title}}) lleva {{days}} días sin actualización.', 'Ticket sin actualización'),
  ('ticket_no_update', 'email', 'Ticket sin actualización: {{code}}', 'El ticket {{code}} ({{title}}) lleva {{days}} días sin actualización.\n\nVer: {{link}}', 'Ticket sin actualización'),
  ('ticket_no_update', 'whatsapp', NULL, '⚠ Ticket {{code}} sin cambios hace {{days}} días: {{title}}', 'Ticket sin actualización'),

  ('project_blocked_no_next_action', 'system', NULL, 'El proyecto {{code}} ({{name}}) está bloqueado y no tiene próxima acción.', 'Proyecto bloqueado sin próxima acción'),
  ('project_blocked_no_next_action', 'email', 'Proyecto bloqueado sin próxima acción: {{code}}', 'El proyecto {{code}} ({{name}}) está bloqueado y no tiene próxima acción definida.\n\nVer: {{link}}', 'Proyecto bloqueado sin próxima acción'),
  ('project_blocked_no_next_action', 'whatsapp', NULL, '⛔ Proyecto {{code}} bloqueado sin próxima acción: {{name}}', 'Proyecto bloqueado sin próxima acción'),

  ('activity_overdue', 'system', NULL, 'La actividad del {{date}} ({{title}}) está vencida.', 'Actividad vencida'),
  ('activity_overdue', 'email', 'Actividad vencida del {{date}}', 'La actividad "{{title}}" del {{date}} sigue planeada y ya venció.\n\nVer: {{link}}', 'Actividad vencida'),
  ('activity_overdue', 'whatsapp', NULL, '📅 Actividad vencida ({{date}}): {{title}}', 'Actividad vencida'),

  ('installation_no_delivery_sheet', 'system', NULL, 'El proyecto {{code}} ({{name}}) tiene la instalación terminada y no tiene hoja de entrega.', 'Instalación terminada sin hoja firmada'),
  ('installation_no_delivery_sheet', 'email', 'Proyecto sin hoja de entrega: {{code}}', 'El proyecto {{code}} ({{name}}) tiene la instalación terminada y no tiene hoja de entrega firmada.\n\nVer: {{link}}', 'Instalación terminada sin hoja firmada'),
  ('installation_no_delivery_sheet', 'whatsapp', NULL, '📄 Proyecto {{code}} sin hoja de entrega: {{name}}', 'Instalación terminada sin hoja firmada'),

  ('ticket_resolved_unvalidated', 'system', NULL, 'El ticket {{code}} ({{title}}) está resuelto y lleva {{days}} días sin validación.', 'Ticket resuelto sin validación'),
  ('ticket_resolved_unvalidated', 'email', 'Ticket resuelto sin validación: {{code}}', 'El ticket {{code}} ({{title}}) está resuelto y lleva {{days}} días sin validación.\n\nVer: {{link}}', 'Ticket resuelto sin validación'),
  ('ticket_resolved_unvalidated', 'whatsapp', NULL, '✅ Ticket {{code}} resuelto hace {{days}} días sin validar: {{title}}', 'Ticket resuelto sin validación'),

  ('next_action_overdue', 'system', NULL, 'La próxima acción de {{code}} ({{title}}) venció el {{date}}.', 'Próxima acción vencida'),
  ('next_action_overdue', 'email', 'Próxima acción vencida: {{code}}', 'La próxima acción de {{code}} ({{title}}) venció el {{date}}.\n\nVer: {{link}}', 'Próxima acción vencida'),
  ('next_action_overdue', 'whatsapp', NULL, '⏰ Próxima acción vencida ({{date}}) de {{code}}: {{title}}', 'Próxima acción vencida'),

  ('hours_over_planned', 'system', NULL, 'El proyecto {{code}} ({{name}}) supera las horas planeadas en {{percent}}%.', 'Horas reales sobre planeadas'),
  ('hours_over_planned', 'email', 'Proyecto sobre horas planeadas: {{code}}', 'El proyecto {{code}} ({{name}}) acumula {{hours}} h reales contra {{planned_hours}} h planeadas (+{{percent}}%).\n\nVer: {{link}}', 'Horas reales sobre planeadas'),
  ('hours_over_planned', 'whatsapp', NULL, '⌛ Proyecto {{code}} con +{{percent}}% de horas: {{name}}', 'Horas reales sobre planeadas')
ON CONFLICT (code, channel) DO NOTHING;
