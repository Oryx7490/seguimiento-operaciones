-- 085_whatsapp_participants_section.sql
-- Sección RBAC para la gestión de contactos/participantes de WhatsApp (V77).
INSERT INTO role_permissions (role_id, section_key, can_view, can_create, can_update, can_delete, can_export)
SELECT r.id,
       'admin.whatsapp_participantes',
       true,
       r.code IN ('admin', 'coordinator'),
       r.code IN ('admin', 'coordinator'),
       r.code = 'admin',
       false
FROM roles r
ON CONFLICT (role_id, section_key) DO NOTHING;
