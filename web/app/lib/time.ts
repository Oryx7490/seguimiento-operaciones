export const BIZ_TZ = "America/Mexico_City";

const cdmxDtf = new Intl.DateTimeFormat("en-CA", {
  timeZone: BIZ_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayIso(now: Date = new Date()): string {
  return cdmxDtf.format(now);
}

export function mondayIsoOfWeek(today: string): string {
  const dt = dateAtNoon(today);
  const day = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - day);
  return isoDateLocal(dt);
}

export function dateAtNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function isoDateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}