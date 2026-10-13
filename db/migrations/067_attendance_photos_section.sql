-- 067_attendance_photos_section.sql
-- Sección RBAC para la bandeja de revisión de asistencia derivada de fotos (V51).
INSERT INTO role_permissions (role_id, section_key, can_view, can_create, can_update, can_delete, can_export)
SELECT r.id,
       'admin.asistencia_fotos',
       true,
       r.code IN ('admin', 'coordinator'),
       r.code IN ('admin', 'coordinator'),
       false,
       false
FROM roles r
ON CONFLICT (role_id, section_key) DO NOTHING;
