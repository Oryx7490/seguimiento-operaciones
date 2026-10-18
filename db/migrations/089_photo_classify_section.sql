-- 089_photo_classify_section.sql
-- Sección RBAC para clasificar fotos del día por actividad/proyecto/ticket (V84).
INSERT INTO role_permissions (role_id, section_key, can_view, can_create, can_update, can_delete, can_export)
SELECT r.id,
       'admin.clasificar_fotos',
       true,
       r.code IN ('admin', 'coordinator'),
       r.code IN ('admin', 'coordinator'),
       false,
       false
FROM roles r
ON CONFLICT (role_id, section_key) DO NOTHING;
