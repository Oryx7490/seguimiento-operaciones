export interface RosterTech {
  id: string;
  display_name: string;
}

export interface AliasRow {
  alias: string;
  technician_id: string;
}

export type MatchStatus = "matched" | "ambiguous" | "unknown";

export interface MatchResult {
  technician_id: string | null;
  status: MatchStatus;
  candidates: string[];
}

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveTechnician(
  name: string,
  roster: RosterTech[],
  aliases: AliasRow[]
): MatchResult {
  const norm = normalizeName(name);
  if (!norm) return { technician_id: null, status: "unknown", candidates: [] };

  const aliasHit = aliases.find((a) => normalizeName(a.alias) === norm);
  if (aliasHit) return { technician_id: aliasHit.technician_id, status: "matched", candidates: [] };

  const exact = roster.find((t) => normalizeName(t.display_name) === norm);
  if (exact) return { technician_id: exact.id, status: "matched", candidates: [] };

  const tokens = norm.split(" ");
  const candidates = roster.filter((t) => {
    const dn = normalizeName(t.display_name);
    if (dn.includes(norm) || norm.includes(dn)) return true;
    return tokens.every((tok) => dn.includes(tok));
  });

  if (candidates.length === 1) {
    return { technician_id: candidates[0].id, status: "matched", candidates: [] };
  }
  if (candidates.length > 1) {
    return {
      technician_id: null,
      status: "ambiguous",
      candidates: candidates.map((c) => c.display_name),
    };
  }
  return { technician_id: null, status: "unknown", candidates: [] };
}

const TIME_RE = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?$/;

export function parseTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  const m = TIME_RE.exec(v);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
}

export function hoursBetween(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  let diff = toMinutes(checkOut) - toMinutes(checkIn);
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

function isoWeekKey(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - day);
  return dt.toISOString().slice(0, 10);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeOvertime(
  entries: { date: string; hours: number | null }[],
  dailyStd: number,
  weeklyStd: number
): Map<string, number> {
  const result = new Map<string, number>();
  const weeks = new Map<string, { date: string; hours: number }[]>();

  for (const e of entries) {
    const hours = Number(e.hours ?? 0);
    result.set(e.date, 0);
    if (hours <= 0) continue;
    const key = isoWeekKey(e.date);
    const list = weeks.get(key) ?? [];
    list.push({ date: e.date, hours });
    weeks.set(key, list);
  }

  for (const list of weeks.values()) {
    const daily = list.map((d) => ({ date: d.date, hours: d.hours, ot: Math.max(0, d.hours - dailyStd) }));
    const sumDaily = daily.reduce((acc, d) => acc + d.ot, 0);
    const weekTotal = daily.reduce((acc, d) => acc + d.hours, 0);
    const target = Math.max(sumDaily, Math.max(0, weekTotal - weeklyStd));

    if (sumDaily > 0) {
      const factor = target / sumDaily;
      for (const d of daily) result.set(d.date, round2(d.ot * factor));
    } else if (target > 0) {
      const worked = daily.filter((d) => d.hours > 0);
      const share = target / worked.length;
      for (const d of worked) result.set(d.date, round2(d.hours > 0 ? share : 0));
    }
  }

  return result;
}

export interface ParsedAttendanceRow {
  person_name: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
}

const HEADER_HINTS = ["nombre", "persona", "empleado", "colaborador", "fecha", "entrada", "salida", "hora"];

function detectDelimiter(line: string): string {
  const counts: [string, number][] = [
    ["\t", (line.match(/\t/g) ?? []).length],
    [";", (line.match(/;/g) ?? []).length],
    [",", (line.match(/,/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

function normalizeDate(value: string): string | null {
  const v = value.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function parseAttendanceDelimited(text: string): { rows: ParsedAttendanceRow[]; skipped: number } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], skipped: 0 };

  const delimiter = detectDelimiter(lines[0]);
  const split = (line: string) => line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""));

  const first = split(lines[0]).map((c) => c.toLowerCase());
  const hasHeader = first.some((c) => HEADER_HINTS.some((h) => c.includes(h)));

  let idx = { name: 0, date: 1, checkIn: 2, checkOut: 3 };
  let start = 0;
  if (hasHeader) {
    start = 1;
    const find = (hints: string[]) => first.findIndex((c) => hints.some((h) => c.includes(h)));
    idx = {
      name: find(["nombre", "persona", "empleado", "colaborador"]),
      date: find(["fecha", "dia", "día"]),
      checkIn: find(["entrada", "ingreso", "inicio", "hora de entrada"]),
      checkOut: find(["salida", "fin", "hora de salida"]),
    };
    if (idx.name < 0) idx.name = 0;
    if (idx.date < 0) idx.date = 1;
    if (idx.checkIn < 0) idx.checkIn = 2;
    if (idx.checkOut < 0) idx.checkOut = 3;
  }

  const rows: ParsedAttendanceRow[] = [];
  let skipped = 0;
  for (let i = start; i < lines.length; i++) {
    const cells = split(lines[i]);
    const person = cells[idx.name] ?? "";
    const date = normalizeDate(cells[idx.date] ?? "");
    if (!person || !date) {
      skipped++;
      continue;
    }
    rows.push({
      person_name: person,
      date,
      check_in: parseTime(cells[idx.checkIn]),
      check_out: parseTime(cells[idx.checkOut]),
    });
  }
  return { rows, skipped };
}
