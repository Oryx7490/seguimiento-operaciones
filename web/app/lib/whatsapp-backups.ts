import { getCurrentUser, jsonError } from "@/app/lib/api";

export async function requireWhatsappBackupManager() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: jsonError("Se requiere una sesión", 401) };
  if (user.role !== "admin" && user.role !== "coordinator") {
    return { user, response: jsonError("Se requiere rol de administración o coordinación", 403) };
  }
  return { user, response: null };
}
