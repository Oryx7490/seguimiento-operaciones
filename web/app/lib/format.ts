export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}sem`;
}

export function projectStatusLabel(status: string): string {
  const map: Record<string, string> = {
    new: "Nuevo",
    planning: "Planeación",
    waiting_authorization: "Esperando autorización",
    waiting_materials: "Esperando materiales",
    assembly: "Armado",
    ready_install: "Listo para instalar",
    installation: "Instalación",
    pending_docs: "Pendiente de documentos",
    closed: "Cerrado",
    cancelled: "Cancelado",
  };
  return map[status] ?? status;
}

export function ticketStatusLabel(status: string): string {
  const map: Record<string, string> = {
    new: "Nuevo",
    to_review: "Por revisar",
    unassigned: "Sin asignar",
    scheduled: "Programado",
    in_progress: "En progreso",
    waiting_client: "Esperando cliente",
    waiting_material: "Esperando material",
    waiting_access: "Esperando acceso",
    resolved_pending_validation: "Resuelto / Pendiente validación",
    closed: "Cerrado",
    cancelled: "Cancelado",
  };
  return map[status] ?? status;
}

export function healthStatusLabel(status: string): string {
  const map: Record<string, string> = {
    on_time: "A tiempo",
    at_risk: "En riesgo",
    blocked: "Bloqueado",
    no_update: "Sin actualización",
  };
  return map[status] ?? status;
}

export function phaseStatusLabel(status: string): string {
  const map: Record<string, string> = {
    planned: "Planeado",
    not_started: "No iniciado",
    in_progress: "En progreso",
    completed: "Completado",
    blocked: "Bloqueado",
    not_applicable: "No aplica",
  };
  return map[status] ?? status;
}
