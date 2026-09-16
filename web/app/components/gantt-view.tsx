"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatShortDate } from "@/app/lib/prototype-data";

interface Phase {
  name: string;
  start: number; // día 0..N dentro del rango visible
  days: number;
  kind: "planning" | "assembly" | "install" | "close";
  blocked?: boolean;
}

interface ProjectRow {
  code: string;
  name: string;
  health: "on_time" | "at_risk" | "blocked";
  phases: Phase[];
}

const DAYS = 14;

const PHASE_STYLE: Record<Phase["kind"], { label: string; bar: string }> = {
  planning: { label: "Planeación", bar: "bg-sky-300 text-sky-900" },
  assembly: { label: "Armado", bar: "bg-amber-300 text-amber-900" },
  install: { label: "Instalación", bar: "bg-emerald-300 text-emerald-900" },
  close: { label: "Cierre", bar: "bg-zinc-300 text-zinc-800" },
};

const HEALTH_META: Record<ProjectRow["health"], { label: string; cls: string }> = {
  on_time: { label: "En tiempo", cls: "bg-emerald-100 text-emerald-700" },
  at_risk: { label: "En riesgo", cls: "bg-amber-100 text-amber-700" },
  blocked: { label: "Bloqueado", cls: "bg-rose-100 text-rose-700" },
};

const PROJECTS: ProjectRow[] = [
  {
    code: "PR-014",
    name: "Pantalla Chedraui Mérida",
    health: "on_time",
    phases: [
      { name: "Planeación", start: 0, days: 2, kind: "planning" },
      { name: "Armado", start: 2, days: 4, kind: "assembly" },
      { name: "Instalación", start: 6, days: 3, kind: "install" },
      { name: "Cierre", start: 9, days: 2, kind: "close" },
    ],
  },
  {
    code: "PR-016",
    name: "Cronometraje Estadio Universitario",
    health: "blocked",
    phases: [
      { name: "Planeación", start: 0, days: 3, kind: "planning" },
      { name: "Armado", start: 3, days: 5, kind: "assembly", blocked: true },
      { name: "Instalación", start: 8, days: 4, kind: "install" },
      { name: "Cierre", start: 12, days: 2, kind: "close" },
    ],
  },
  {
    code: "PR-018",
    name: "Publicidad Centro Santa Fe",
    health: "at_risk",
    phases: [
      { name: "Planeación", start: 0, days: 1, kind: "planning" },
      { name: "Armado", start: 1, days: 3, kind: "assembly" },
      { name: "Instalación", start: 4, days: 4, kind: "install", blocked: true },
      { name: "Cierre", start: 8, days: 2, kind: "close" },
    ],
  },
  {
    code: "PR-021",
    name: "Video wall Aeropuerto GDL",
    health: "on_time",
    phases: [
      { name: "Planeación", start: 0, days: 1, kind: "planning" },
      { name: "Armado", start: 1, days: 2, kind: "assembly" },
      { name: "Instalación", start: 3, days: 5, kind: "install" },
      { name: "Cierre", start: 8, days: 2, kind: "close" },
    ],
  },
  {
    code: "PR-022",
    name: "Vallas Centros Comerciales",
    health: "at_risk",
    phases: [
      { name: "Planeación", start: 0, days: 2, kind: "planning" },
      { name: "Armado", start: 2, days: 4, kind: "assembly" },
      { name: "Instalación", start: 6, days: 4, kind: "install" },
      { name: "Cierre", start: 10, days: 2, kind: "close" },
    ],
  },
];

export default function GanttView() {
  const [scale, setScale] = useState(40); // px por día: 40 (2 semanas) | 80 (zoom) 

  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => i + 1), []);
  const startRef = mondayRef();

  return (
    <div className="bg-zinc-100 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold leading-tight">Proyectos · Vista Gantt</h1>
            <p className="text-sm text-zinc-500">
              Horizonte: {formatShortDate(startRef)} en adelante · cada barra es una fase
            </p>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              ← Agenda semanal
            </Link>
          </nav>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-zinc-500">Escala:</span>
          <button
            onClick={() => setScale(40)}
            className={`rounded-md border px-3 py-1.5 text-sm ${scale === 40 ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-300 bg-white text-zinc-700"}`}
          >
            2 semanas
          </button>
          <button
            onClick={() => setScale(80)}
            className={`rounded-md border px-3 py-1.5 text-sm ${scale === 80 ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-300 bg-white text-zinc-700"}`}
          >
            1 semana
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
            {(Object.keys(PHASE_STYLE) as Phase["kind"][]).map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-zinc-600">
                <span className={`h-3 w-4 rounded-sm ${PHASE_STYLE[k].bar}`} />
                {PHASE_STYLE[k].label}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="p-4">
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="min-w-[960px]">
            {/* encabezado de días */}
            <div className="flex border-b border-zinc-200 bg-zinc-50">
              <div className="w-72 shrink-0 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Proyecto
              </div>
              <div className="flex flex-1">
                {days.map((d) => (
                  <div key={d} className="border-l border-zinc-100 px-1 py-2 text-center text-xs text-zinc-500" style={{ width: scale }}>
                    D{d}
                  </div>
                ))}
              </div>
            </div>

            {PROJECTS.map((p) => (
              <div key={p.code} className="flex border-b border-zinc-100 last:border-b-0">
                <div className="flex w-72 shrink-0 items-center gap-3 border-r border-zinc-100 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-800">
                      <span className="font-mono text-xs text-zinc-500">{p.code}</span> {p.name}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${HEALTH_META[p.health].cls}`}>
                    {HEALTH_META[p.health].label}
                  </span>
                </div>
                <div className="relative flex flex-1 items-center py-2.5" style={{ minHeight: 44 }}>
                  {days.map((d) => (
                    <div key={d} className="h-full border-l border-zinc-50" style={{ width: scale }} />
                  ))}
                  {p.phases.map((ph) => (
                    <div
                      key={ph.name}
                      className="absolute flex h-7 items-center overflow-hidden rounded-md border border-white/70 pl-2 pr-2 text-[11px] font-medium shadow-sm"
                      style={{
                        left: ph.start * scale + 2,
                        width: ph.days * scale - 4,
                        ...(ph.blocked ? { outline: "2px solid #f59e0b", outlineOffset: "1px" } : {}),
                        backgroundColor: "inherit",
                        ...phaseBg(ph),
                      }}
                      title={`${ph.name}${ph.blocked ? " · BLOQUEADO" : ""}`}
                    >
                      {ph.days * scale > 70 ? (
                        <span className="truncate">{ph.name}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Prototipo: las barras representan fases de proyecto (Planeación → Armado → Instalación →
          Cierre). Cambios aquí actualizarían las fechas del proyecto y se reflejarían en la agenda
          semanal.
        </p>
      </main>
    </div>
  );
}

function mondayRef(): Date {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function phaseBg(ph: Phase): Record<string, string | number> {
  const color = {
    planning: "#7dd3fc",
    assembly: "#fcd34d",
    install: "#6ee7b7",
    close: "#d4d4d8",
  }[ph.kind];
  return {
    backgroundColor: color,
    filter: ph.blocked ? "saturate(0.7)" : "none",
    opacity: ph.blocked ? 0.85 : 1,
  };
}