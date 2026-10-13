"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useResource } from "@/app/lib/client";
import { EmptyState, SecondaryButton, Spinner } from "@/app/components/ui";

interface TeamSummary {
  week: { start: string; end: string };
  team: { hours: number; overtime: number; technicians: number; entries: number };
  technicians: { technician_id: string; display_name: string; hours: number; overtime: number; entries: number; days: number }[];
  kpis: {
    m2_installed: number;
    mp_installed: number;
    screens_installed_count: number;
    projects_with_installed_screens: number;
    controllers_installed_week: number;
    tickets_closed_week: number;
    activities_completed_week: number;
    hours_registered_week: number;
  };
}

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number): string {
  return Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

function label(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const m = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.getUTCMonth()];
  return `${d.getUTCDate()} ${m}`;
}

export default function TeamSummaryPage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date().toISOString().slice(0, 10)));
  const currentMonday = mondayOf(new Date().toISOString().slice(0, 10));

  const query = useMemo(() => new URLSearchParams({ from: weekStart }).toString(), [weekStart]);
  const { data, error } = useResource<TeamSummary>(`/api/attendance/team-summary?${query}`);
  const loading = !data && !error;

  const m2PerHour = data && data.team.hours > 0 ? data.kpis.m2_installed / data.team.hours : 0;
  const diffHours = data ? data.kpis.hours_registered_week - data.team.hours : 0;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Resumen del equipo</h1>
          <p className="mt-1 text-sm text-zinc-500">Horas trabajadas y KPIs de la semana; base para comparar desempeño.</p>
        </div>
        <div className="flex items-center gap-2">
          <SecondaryButton className="px-2 py-1 text-xs" onClick={() => setWeekStart((w) => addDays(w, -7))}>
            ← Semana anterior
          </SecondaryButton>
          <button
            type="button"
            onClick={() => setWeekStart(currentMonday)}
            className="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
          >
            Semana actual
          </button>
          <SecondaryButton className="px-2 py-1 text-xs" onClick={() => setWeekStart((w) => addDays(w, 7))}>
            Semana siguiente →
          </SecondaryButton>
        </div>
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {loading ? (
        <Spinner />
      ) : data ? (
        <>
          <p className="mt-4 text-sm font-medium text-zinc-600">
            Semana del {label(data.week.start)} al {label(data.week.end)}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Horas trabajadas" value={fmt(data.team.hours)} unit="h" />
            <Stat label="Horas extra" value={fmt(data.team.overtime)} unit="h" accent="amber" />
            <Stat label="Técnicos" value={String(data.team.technicians)} />
            <Stat label="Registros" value={String(data.team.entries)} />
          </div>

          <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-400">KPIs de la semana</h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="m² instalados" value={fmt(data.kpis.m2_installed)} unit="m²" />
            <Stat label="Pantallas instaladas" value={fmt(data.kpis.screens_installed_count)} />
            <Stat label="Controladores" value={fmt(data.kpis.controllers_installed_week)} />
            <Stat label="Tickets cerrados" value={fmt(data.kpis.tickets_closed_week)} />
          </div>

          <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-400">Horas vs KPIs</h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Horas asistencias" value={fmt(data.team.hours)} unit="h" />
            <Stat label="Horas en actividades" value={fmt(data.kpis.hours_registered_week)} unit="h" />
            <Stat
              label="Diferencia"
              value={`${diffHours >= 0 ? "+" : ""}${fmt(diffHours)}`}
              unit="h"
              accent={Math.abs(diffHours) > 8 ? "rose" : undefined}
            />
            <Stat label="m² por hora" value={data.team.hours > 0 ? fmt(m2PerHour) : "—"} unit={data.team.hours > 0 ? "m²/h" : ""} />
          </div>

          <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-400">Detalle por técnico</h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
            {data.technicians.length === 0 ? (
              <div className="p-4"><EmptyState title="Sin horas registradas esta semana" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Técnico</th>
                      <th className="px-4 py-2 text-right">Horas</th>
                      <th className="px-4 py-2 text-right">Extra</th>
                      <th className="px-4 py-2 text-center">Días</th>
                      <th className="px-4 py-2 text-center">Registros</th>
                      <th className="px-4 py-2 text-right">Perfil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {data.technicians.map((t) => (
                      <tr key={t.technician_id} className="hover:bg-zinc-50">
                        <td className="px-4 py-2 font-medium text-zinc-800">{t.display_name}</td>
                        <td className="px-4 py-2 text-right text-zinc-700">{fmt(t.hours)}</td>
                        <td className="px-4 py-2 text-right text-amber-700">{t.overtime > 0 ? fmt(t.overtime) : "—"}</td>
                        <td className="px-4 py-2 text-center text-zinc-500">{t.days}</td>
                        <td className="px-4 py-2 text-center text-zinc-500">{t.entries}</td>
                        <td className="px-4 py-2 text-right">
                          <Link href={`/admin/tecnicos/${t.technician_id}/horas`} className="text-xs text-sky-700 hover:underline">
                            Ver horas →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: "amber" | "rose" }) {
  const color = accent === "amber" ? "text-amber-700" : accent === "rose" ? "text-rose-700" : "text-zinc-800";
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</p>
      <p className={`text-lg font-semibold ${color}`}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-zinc-400">{unit}</span>}
      </p>
    </div>
  );
}
