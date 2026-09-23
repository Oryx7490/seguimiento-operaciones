"use client";

import { useMemo, useState } from "react";
import { useResource } from "@/app/lib/client";
import { SecondaryButton, Spinner } from "@/app/components/ui";
import type { EffortResponse } from "@/app/lib/types";

type Scale = "week" | "month" | "year";

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function today(): string {
  return iso(new Date());
}

function shiftDay(dateStr: string, scale: Scale, dir: 1 | -1): string {
  const d = new Date(`${dateStr}T12:00:00`);
  if (scale === "week") d.setDate(d.getDate() + 7 * dir);
  else if (scale === "year") d.setFullYear(d.getFullYear() + dir);
  else d.setMonth(d.getMonth() + dir);
  return iso(d);
}

function fmtH(h: number): string {
  return `${h.toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}\u00a0h`;
}

function Bar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
      <div className="h-full rounded-full bg-zinc-800" style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

const SCALES: { key: Scale; label: string }[] = [
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
  { key: "year", label: "Año" },
];

type View = "clientes" | "proyectos" | "tickets";

export default function HorasHombrePage() {
  const [scale, setScale] = useState<Scale>("month");
  const [date, setDate] = useState<string>(() => today());
  const [view, setView] = useState<View>("clientes");

  const { data, error } = useResource<EffortResponse>(`/api/reports/effort?scale=${scale}&date=${date}`);

  const report = data;
  const total = report?.total_hours ?? 0;

  const sections = useMemo(
    () =>
      [
        { key: "clientes" as View, label: "Por cliente", n: report?.by_client.length ?? 0 },
        { key: "proyectos" as View, label: "Por proyecto", n: report?.by_project.length ?? 0 },
        { key: "tickets" as View, label: "Por ticket", n: report?.by_ticket.length ?? 0 },
      ].filter((s) => s.n > 0),
    [report]
  );

  const rows =
    view === "clientes"
      ? (report?.by_client ?? []).map((c) => ({ key: c.client_id, name: c.name, sub: "", p: c.projects, t: c.tickets, hours: c.hours, percent: c.percent }))
      : view === "proyectos"
      ? (report?.by_project ?? []).map((p) => ({ key: p.project_id, name: `${p.code} · ${p.name}`, sub: p.client_name ?? "", p: 0, t: 0, hours: p.hours, percent: p.percent }))
      : (report?.by_ticket ?? []).map((t) => ({ key: t.ticket_id, name: `${t.code} · ${t.title}`, sub: t.client_name ?? "", p: 0, t: 0, hours: t.hours, percent: t.percent }));

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-900">Horas hombre</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Horas planeadas dedicadas a proyectos, tickets y clientes. Base para cruzar con costos de operación.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        {SCALES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setScale(s.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              scale === s.key ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {s.label}
          </button>
        ))}
        <div className="mx-1 flex items-center gap-1">
          <SecondaryButton onClick={() => setDate((d) => shiftDay(d, scale, -1))}>‹</SecondaryButton>
          <span className="min-w-[180px] text-center text-sm font-medium text-zinc-800">{report?.label ?? "…"}</span>
          <SecondaryButton onClick={() => setDate((d) => shiftDay(d, scale, 1))}>›</SecondaryButton>
          <span className="ml-1">
            <SecondaryButton onClick={() => setDate(today())}>Hoy</SecondaryButton>
          </span>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {!report && !error && (
        <div className="mt-8 flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {report && total > 0 && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-zinc-500">Horas planeadas</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-900">{fmtH(total)}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-zinc-500">Clientes</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-900">{report.by_client.filter((c) => c.client_id).length}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-zinc-500">Proyectos con horas</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-900">{report.by_project.length}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-zinc-500">Tickets con horas</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-900">{report.by_ticket.length}</p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-700">
              Distribución {scale === "week" ? "por día" : scale === "month" ? "por semana" : "por mes"}
            </h2>
            <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              {report.buckets.map((b) => (
                <div key={b.key}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-zinc-500">{b.label}</span>
                    <span className="text-xs font-semibold text-zinc-800">{fmtH(b.hours)}</span>
                  </div>
                  <div className="mt-1">
                    <Bar value={b.percent} />
                  </div>
                  <p className="mt-0.5 text-[10px] text-zinc-400">{Math.round(b.percent)}% del total</p>
                </div>
              ))}
            </div>
          </div>

          {sections.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1">
              {sections.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setView(s.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    view === s.key ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {s.label} ({s.n})
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">
                    {view === "clientes" ? "Cliente" : view === "proyectos" ? "Proyecto" : "Ticket"}
                  </th>
                  {view === "clientes" && (
                    <>
                      <th className="px-4 py-3 text-right">Proyectos</th>
                      <th className="px-4 py-3 text-right">Tickets</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-right">Horas</th>
                  <th className="w-1/4 px-4 py-3 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-800">{r.name}</p>
                      {r.sub && <p className="text-xs text-zinc-500">{r.sub}</p>}
                    </td>
                    {view === "clientes" && (
                      <>
                        <td className="px-4 py-3 text-right text-zinc-600">{r.p}</td>
                        <td className="px-4 py-3 text-right text-zinc-600">{r.t}</td>
                      </>
                    )}
                    <td className="px-4 py-3 text-right font-semibold text-zinc-800">{fmtH(r.hours)}</td>
                    <td className="px-4 py-3">
                      <Bar value={r.percent} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}