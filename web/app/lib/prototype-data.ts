export type ActivityKind = "project" | "ticket" | "internal";
export type ActivityStatus = "planned" | "in_progress" | "completed";

export interface Technician {
  id: string;
  name: string;
  short: string;
}

export interface Activity {
  id: string;
  code: string;
  kind: ActivityKind;
  name: string;
  client: string;
  location: string;
  technicianId: string;
  weekday: number; // 1=lunes ... 7=domingo
  plannedHours: number;
  workedHours: number;
  status: ActivityStatus;
  blocked: boolean;
  overdue: boolean;
  progress: number; // 0-100
}

export const TECHNICIANS: Technician[] = [
  { id: "t1", name: "Cristian Tena", short: "CT" },
  { id: "t2", name: "Alberto Ríos", short: "AR" },
  { id: "t3", name: "María López", short: "ML" },
  { id: "t4", name: "Jorge Vega", short: "JV" },
  { id: "t5", name: "Sofía Núñez", short: "SN" },
];

export const ACTIVITIES: Activity[] = [
  { id: "a1", code: "PR-014", kind: "project", name: "Pantalla Chedraui Mérida", client: "Chedraui", location: "Mérida", technicianId: "t1", weekday: 1, plannedHours: 4, workedHours: 4, status: "completed", blocked: false, overdue: false, progress: 100 },
  { id: "a2", code: "TK-132", kind: "ticket", name: "Led sin encender", client: "Seguros Monterrey", location: "Monterrey", technicianId: "t1", weekday: 2, plannedHours: 6, workedHours: 3, status: "in_progress", blocked: true, overdue: false, progress: 50 },
  { id: "a3", code: "PR-018", kind: "project", name: "Publicidad Centro Santa Fe", client: "Centro Santa Fe", location: "CDMX", technicianId: "t2", weekday: 1, plannedHours: 8, workedHours: 8, status: "completed", blocked: false, overdue: false, progress: 100 },
  { id: "a4", code: "TK-128", kind: "ticket", name: "Reparación módulos", client: "Elektra Norte", location: "Monterrey", technicianId: "t2", weekday: 3, plannedHours: 5, workedHours: 0, status: "planned", blocked: false, overdue: false, progress: 0 },
  { id: "a5", code: "PR-021", kind: "project", name: "Video wall Aeropuerto GDL", client: "GAP", location: "Guadalajara", technicianId: "t3", weekday: 2, plannedHours: 8, workedHours: 8, status: "completed", blocked: false, overdue: false, progress: 100 },
  { id: "a6", code: "PR-021", kind: "project", name: "Video wall Aeropuerto GDL", client: "GAP", location: "Guadalajara", technicianId: "t3", weekday: 3, plannedHours: 8, workedHours: 8, status: "completed", blocked: false, overdue: false, progress: 100 },
  { id: "a7", code: "TK-135", kind: "ticket", name: "Perímetro quemado", client: "Liverpool Puebla", location: "Puebla", technicianId: "t3", weekday: 5, plannedHours: 6, workedHours: 0, status: "planned", blocked: false, overdue: true, progress: 0 },
  { id: "a8", code: "PR-016", kind: "project", name: "Cronometraje Estadio Universitario", client: "UANL", location: "Monterrey", technicianId: "t4", weekday: 1, plannedHours: 8, workedHours: 2, status: "in_progress", blocked: true, overdue: false, progress: 30 },
  { id: "a9", code: "INT", kind: "internal", name: "Bodega y preparación", client: "Interno", location: "Bodega CDMX", technicianId: "t4", weekday: 4, plannedHours: 4, workedHours: 4, status: "completed", blocked: false, overdue: false, progress: 100 },
  { id: "a10", code: "INT", kind: "internal", name: "Traslado a Puebla", client: "Interno", location: "Ruta 57", technicianId: "t5", weekday: 4, plannedHours: 3, workedHours: 3.5, status: "completed", blocked: false, overdue: false, progress: 100 },
  { id: "a11", code: "TK-130", kind: "ticket", name: "No hay señal controlador", client: "Farmacias del Ahorro", location: "Veracruz", technicianId: "t5", weekday: 5, plannedHours: 5, workedHours: 5, status: "completed", blocked: false, overdue: false, progress: 100 },
  { id: "a12", code: "INT", kind: "internal", name: "Vacaciones", client: "Interno", location: "—", technicianId: "t1", weekday: 3, plannedHours: 8, workedHours: 0, status: "planned", blocked: false, overdue: false, progress: 0 },
  { id: "a13", code: "PR-022", kind: "project", name: "Vallas Centros Comerciales", client: "El Palacio", location: "Querétaro", technicianId: "t1", weekday: 4, plannedHours: 8, workedHours: 0, status: "planned", blocked: false, overdue: false, progress: 0 },
  { id: "a14", code: "INT", kind: "internal", name: "Capacitación controladores", client: "Interno", location: "Sala", technicianId: "t2", weekday: 4, plannedHours: 4, workedHours: 4, status: "completed", blocked: false, overdue: false, progress: 100 },
  { id: "a15", code: "TK-121", kind: "ticket", name: "Fuente de poder dañada", client: "Coppel Torreón", location: "Torreón", technicianId: "t5", weekday: 2, plannedHours: 4, workedHours: 0, status: "planned", blocked: false, overdue: true, progress: 0 },
];

export const WEEKDAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const WEEKDAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function mondayOfWeek(reference: Date): Date {
  const d = new Date(reference);
  const day = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function formatShortDate(d: Date): string {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(d);
}

export function isToday(d: Date): boolean {
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export const STATUS_META: Record<ActivityStatus, { label: string; card: string; dot: string }> = {
  planned: { label: "Planificada", card: "border-zinc-200 bg-white", dot: "bg-zinc-400" },
  in_progress: { label: "En proceso", card: "border-amber-300 bg-amber-50", dot: "bg-amber-500" },
  completed: { label: "Completada", card: "border-emerald-300 bg-emerald-50", dot: "bg-emerald-500" },
};

export const KIND_META: Record<ActivityKind, { label: string; codeClass: string }> = {
  project: { label: "Proyecto", codeClass: "text-sky-700 bg-sky-100" },
  ticket: { label: "Ticket", codeClass: "text-violet-700 bg-violet-100" },
  internal: { label: "Interna", codeClass: "text-zinc-600 bg-zinc-100" },
};