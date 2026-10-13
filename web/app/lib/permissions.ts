import pool from "@/app/lib/db";

export interface UserRole {
  id: string;
  code: string;
  name: string;
  is_system: boolean;
}

export interface RolePermission {
  role_id: string;
  section_key: string;
  can_view: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_export: boolean;
}

export async function getUserRoles(userId: string): Promise<UserRole[]> {
  const { rows } = await pool.query(
    `SELECT r.id, r.code, r.name, r.is_system
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
      ORDER BY r.name`,
    [userId]
  );
  return rows as UserRole[];
}

export async function getUserPermissions(userId: string): Promise<RolePermission[]> {
  const { rows } = await pool.query(
    `SELECT rp.role_id, rp.section_key, rp.can_view, rp.can_create, rp.can_update, rp.can_delete, rp.can_export
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = $1`,
    [userId]
  );
  return rows as RolePermission[];
}

export function hasView(permissions: RolePermission[], sectionKey: string): boolean {
  return permissions.some((p) => p.section_key === sectionKey && p.can_view);
}

export function canCreate(permissions: RolePermission[], sectionKey: string): boolean {
  return permissions.some((p) => p.section_key === sectionKey && p.can_create);
}

export function canUpdate(permissions: RolePermission[], sectionKey: string): boolean {
  return permissions.some((p) => p.section_key === sectionKey && p.can_update);
}

export function canDelete(permissions: RolePermission[], sectionKey: string): boolean {
  return permissions.some((p) => p.section_key === sectionKey && p.can_delete);
}

export function canExport(permissions: RolePermission[], sectionKey: string): boolean {
  return permissions.some((p) => p.section_key === sectionKey && p.can_export);
}
