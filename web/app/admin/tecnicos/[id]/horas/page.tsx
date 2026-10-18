"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useResource } from "@/app/lib/client";
import { EmptyState, Spinner } from "@/app/components/ui";

interface Period {
  period: string;
  entries: number;
  hours: number;
  overtime: number;
  check_in: string | null;
  check_out: string | null;
  missing_in: boolean;
  missing_out: boolean;
  overnight: boolean;
  exit_offset_days: number;
}

interface Segment {
  date: string;
  started_at: string | null;
  ended_at: string | null;
  hours: number | null;
  source: string;
}

interface HoursResponse {
  technician: { id: string; display_name: string };
  granularity: string;
  periods: Period[];
  totals: { hours: number; overtime: number; entries: number };
  segments: Segment[];
}

const GRANS = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "year", label: "Año" },
];

function fmtHours(n: number): string {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

function monthName(i: number): string {
  return ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][i];
}

function periodLabel(period: string, granularity: string): string {
  const d = new Date(`${period}T12:00:00Z`);
  const day = d.getUTCDate();
  const month = monthName(d.getUTCMonth());
  const year = d.getUTCFullYear();
  if (granularity === "day") {
    const wd = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][d.getUTCDay()];
    return `${wd} ${day} ${month} ${year}`;
  }
  if (granularity === "week") return `Semana del ${day} ${month} ${year}`;
  if (granularity === "month") return `${month} ${year}`;
  return String(year);
}

export default function TechnicianHoursPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [granularity, setGranularity] = useState("week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showSegments, setShowSegments] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("granularity", granularity);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [granularity, from, to]);

  const { data, error } = useResource<HoursResponse>(`/api/technicians/${id}/hours?${query}`);
  const loading = !data && !error;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/admin/tecnicos/${id}`} className="text-xs text-zinc-500 hover:text-zinc-800">
            ← Expediente
          </Link>
          <h1 className="text-xl font-semibold text-zinc-900">{data?.technician.display_name ?? "Técnico"}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Horas trabajadas y horas extra por periodo.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-0.5">
          {GRANS.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => setGranularity(g.value)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                granularity === g.value ? "bg-zinc-900 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-zinc-500">
          Desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-sm text-zinc-500">
          Hasta
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        </label>
        {(from || to) && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="text-xs text-sky-700 hover:underline"
          >
            Quitar rango
          </button>
        )}
      </div>

      {data && (
        <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-xl">
          <Stat label="Horas totales" value={fmtHours(data.totals.hours)} />
          <Stat label="Horas extra" value={fmtHours(data.totals.overtime)} accent="amber" />
          <Stat label="Registros" value={String(data.totals.entries)} />
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-4"><Spinner /></div>
        ) : !data || data.periods.length === 0 ? (
          <div className="p-4"><EmptyState title="Sin horas registradas en este periodo" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2 text-left">Periodo</th>
                  <th className="px-4 py-2 text-right">Horas</th>
                  <th className="px-4 py-2 text-right">Extra</th>
                  <th className="px-4 py-2 text-center">Registros</th>
                  {granularity === "day" && <th className="px-4 py-2 text-left">Entrada / salida</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.periods.map((p) => (
                  <tr key={p.period} className="hover:bg-zinc-50">
                    <td className="px-4 py-2 font-medium text-zinc-800">{periodLabel(p.period, data.granularity)}</td>
                    <td className="px-4 py-2 text-right text-zinc-700">{fmtHours(p.hours)}</td>
                    <td className="px-4 py-2 text-right text-amber-700">{p.overtime > 0 ? fmtHours(p.overtime) : "—"}</td>
                    <td className="px-4 py-2 text-center text-zinc-500">{p.entries}</td>
                    {granularity === "day" && (
                      <td className="px-4 py-2 text-zinc-600">
                        {p.check_in ?? "—"} / {p.check_out ?? "—"}{p.overnight ? (p.exit_offset_days > 1 ? `+${p.exit_offset_days}` : "+") : ""}
                        {(p.missing_in || p.missing_out) && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">incompleto</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.segments.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowSegments((v) => !v)} className="text-sm text-sky-700 hover:underline">
            {showSegments ? "Ocultar" : "Ver"} tramos por día ({data.segments.length})
          </button>
          {showSegments && (
            <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Día</th>
                    <th className="px-4 py-2 text-left">Entrada–salida</th>
                    <th className="px-4 py-2 text-right">Horas</th>
                    <th className="px-4 py-2 text-left">Origen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.segments.map((s, i) => (
                    <tr key={`${s.date}-${i}`}>
                      <td className="px-4 py-2 text-zinc-700">{periodLabel(s.date, "day")}</td>
                      <td className="px-4 py-2 text-zinc-600">{s.started_at ?? "—"} – {s.ended_at ?? "—"}</td>
                      <td className="px-4 py-2 text-right text-zinc-700">{s.hours != null ? fmtHours(Number(s.hours)) : "—"}</td>
                      <td className="px-4 py-2 text-zinc-400">{s.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "amber" }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`text-lg font-semibold ${accent === "amber" ? "text-amber-700" : "text-zinc-800"}`}>{value}</p>
    </div>
  );
}
