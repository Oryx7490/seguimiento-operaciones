"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useResource } from "@/app/lib/client";
import { Spinner } from "@/app/components/ui";

/* ── Tipos ───────────────────────────────────────── */
interface ScreenRow {
  screen_type: string;
  quantity: number;
  pitch_mm: number | null;
  m2_unit: number;
  m2_total: number;
  width_m: number | null;
  height_m: number | null;
  is_irregular: boolean;
  area_m2: number | null;
}
interface ProjectRow {
  project_id: string;
  code: string;
  name: string;
  client_name: string | null;
  planned_end_date: string;
  status: string;
  screens: ScreenRow[];
}
interface HorizonData {
  key: "short" | "medium" | "long";
  label: string;
  from_months: number;
  to_months: number;
  total_m2: number;
  by_type: Record<string, number>;
  project_count: number;
  projects: ProjectRow[];
}
interface ProjectionData {
  anchor_month: string;
  horizons: HorizonData[];
  all_types: string[];
  all_pitches: number[];
  selected_pitches: number[];
  total_m2: number;
}

/* ── Helpers ─────────────────────────────────────── */
const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function addMonths(base: string, delta: number) {
  const d = new Date(base + "-01");
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const HORIZON_COLORS: Record<HorizonData["key"], string> = {
  short: "border-emerald-200 bg-emerald-50",
  medium: "border-amber-200 bg-amber-50",
  long: "border-indigo-200 bg-indigo-50",
};

/* ── Componente principal ────────────────────────── */
export default function ProyeccionPage() {
  const [anchor, setAnchor] = useState(todayYM());
  const [short, setShort] = useState(3);
  const [medium, setMedium] = useState(6);
  const [long, setLong] = useState(12);
  const [pitches, setPitches] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const url = `/api/reports/screen-projection?anchor=${anchor}-01&short=${short}&medium=${medium}&long=${long}${pitches.length ? `&pitch=${pitches.map(p => formatPitch(p)).join(",")}` : ""}`;
  const { data, error } = useResource<ProjectionData>(url);

  const totalM2 = data?.total_m2 ?? 0;

  function togglePitch(v: number) {
    setPitches(prev => {
      const next = prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v];
      return next.sort((a, b) => a - b);
    });
  }

  function formatPitch(v: number) {
    return String(Number.isInteger(v) ? v : Math.round(v * 100) / 100);
  }

  function toggleHorizon(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  }

  const totalProjects = useMemo(
    () => new Set((data?.horizons ?? []).flatMap(h => h.projects.map(p => p.project_id))).size,
    [data]
  );

  return (
    <div className="p-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Proyección de instalación</h1>
          <p className="mt-1 text-sm text-zinc-500">
            m² de pantalla a instalar por tipo, agrupados en corto, mediano y largo plazo según la entrega planeada.
          </p>
        </div>
      </div>

      {/* ── Controles ── */}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAnchor(a => addMonths(a, -1))}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >←</button>
          <button
            onClick={() => setAnchor(todayYM())}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >Hoy</button>
          <button
            onClick={() => setAnchor(a => addMonths(a, 1))}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >→</button>
        </div>
        <span className="text-sm font-medium text-zinc-700">Desde {monthLabel(anchor)}</span>

        <div className="flex flex-wrap items-center gap-3">
          {([["Corto", short, setShort], ["Mediano", medium, setMedium], ["Largo", long, setLong]] as const).map(([label, val, setVal]) => (
            <label key={label} className="flex items-center gap-1 text-xs text-zinc-500">
              {label}:
              <input
                type="number"
                min={1}
                max={36}
                value={val}
                onChange={(e) => setVal(clamp(Number(e.target.value)))}
                className="w-14 rounded-md border border-zinc-300 px-1.5 py-1 text-sm text-zinc-700"
              />
              meses
            </label>
          ))}
        </div>
      </div>

      {/* ── Filtro por pitch ── */}
      {data && data.all_pitches.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pitch (mm):</span>
          <button
            onClick={() => setPitches([])}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              pitches.length === 0
                ? "border-sky-600 bg-sky-600 text-white"
                : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Todos
          </button>
          {data.all_pitches.map(v => {
            const active = pitches.includes(v);
            return (
              <button
                key={v}
                onClick={() => togglePitch(v)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  active
                    ? "border-sky-600 bg-sky-600 text-white"
                    : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {formatPitch(v)} mm
              </button>
            );
          })}
          {pitches.length > 0 && (
            <button
              onClick={() => setPitches([])}
              className="text-xs text-zinc-400 underline hover:text-zinc-600"
            >
              Limpiar
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {!data && !error && <Spinner />}

      {data && (
        <>
          {/* ── Resumen total ── */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
              <p className="text-xs text-sky-600 font-medium uppercase tracking-wide">Total proyectado</p>
              <p className="mt-1 text-3xl font-bold text-sky-800">{fmt(totalM2)} m²</p>
              <p className="mt-1 text-xs text-sky-600">{short} + {medium - short} + {long - medium} meses de horizonte</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Proyectos con pantallas</p>
              <p className="mt-1 text-3xl font-bold text-zinc-800">{totalProjects}</p>
              <p className="mt-1 text-xs text-zinc-400">en el horizonte completo</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Tipos de pantalla</p>
              <p className="mt-1 text-3xl font-bold text-zinc-800">{data.all_types.length}</p>
              <p className="mt-1 text-xs text-zinc-400 truncate">{data.all_types.join(", ") || "—"}</p>
            </div>
          </div>

          {/* ── Cards por horizonte ── */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {data.horizons.map(h => (
              <div key={h.key} className={`rounded-lg border p-4 ${HORIZON_COLORS[h.key]}`}>
                <p className="text-xs font-medium uppercase tracking-wide opacity-70">{h.label}</p>
                <p className="mt-1 text-2xl font-bold">{fmt(h.total_m2)} m²</p>
                <p className="mt-1 text-xs opacity-70">
                  {h.from_months + 1}–{h.to_months} meses · {h.project_count} proyecto{h.project_count !== 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </div>

          {/* ── Tabla tipo × horizonte ── */}
          {data.all_types.length > 0 && (
            <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
              <p className="border-b border-zinc-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                m² por tipo de pantalla por horizonte
              </p>
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Tipo de pantalla</th>
                    {data.horizons.map(h => (
                      <th key={h.key} className="px-3 py-2 text-right whitespace-nowrap">{h.label}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.all_types.map(type => {
                    const total = data.horizons.reduce((s, h) => s + (h.by_type[type] ?? 0), 0);
                    return (
                      <tr key={type} className="hover:bg-zinc-50">
                        <td className="px-3 py-2 font-medium text-zinc-800">{type}</td>
                        {data.horizons.map(h => (
                          <td key={h.key} className="px-3 py-2 text-right text-zinc-600">
                            {h.by_type[type] ? `${fmt(h.by_type[type])} m²` : "—"}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right font-semibold text-zinc-800">{fmt(total)} m²</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-zinc-50 font-semibold">
                    <td className="px-3 py-2 text-zinc-700">Total</td>
                    {data.horizons.map(h => (
                      <td key={h.key} className="px-3 py-2 text-right text-sky-700">{fmt(h.total_m2)} m²</td>
                    ))}
                    <td className="px-3 py-2 text-right text-sky-800">{fmt(totalM2)} m²</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ── Detalle por horizonte ── */}
          <div className="mt-6 space-y-3">
            {data.horizons.map(h => {
              const isOpen = expanded.has(h.key);
              const isEmpty = h.projects.length === 0;
              return (
                <div key={h.key} className="rounded-lg border border-zinc-200 bg-white shadow-sm">
                  <button
                    onClick={() => !isEmpty && toggleHorizon(h.key)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left ${isEmpty ? "cursor-default" : "hover:bg-zinc-50"}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-semibold ${isEmpty ? "text-zinc-400" : "text-zinc-800"}`}>
                        {h.label} <span className="text-xs font-normal text-zinc-400">(meses {h.from_months + 1}–{h.to_months})</span>
                      </span>
                      {!isEmpty && (
                        <span className="text-xs text-zinc-500">
                          {h.project_count} proyecto{h.project_count !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {h.total_m2 > 0 ? (
                        <span className="rounded-full bg-sky-100 px-3 py-0.5 text-sm font-bold text-sky-700">
                          {fmt(h.total_m2)} m²
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400">Sin proyectos</span>
                      )}
                      {!isEmpty && (
                        <svg
                          className={`w-4 h-4 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>
                  </button>

                  {isOpen && !isEmpty && (
                    <div className="border-t border-zinc-100">
                      <table className="min-w-full text-sm">
                        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                          <tr>
                            <th className="px-4 py-2 text-left">Proyecto</th>
                            <th className="px-3 py-2 text-left">Cliente</th>
                            <th className="px-3 py-2 text-left">Tipo de pantalla</th>
                            <th className="px-3 py-2 text-right">Cant.</th>
                            <th className="px-3 py-2 text-left">Dimensiones</th>
                            <th className="px-3 py-2 text-right">Pitch</th>
                            <th className="px-3 py-2 text-right">m² c/u</th>
                            <th className="px-3 py-2 text-right">m² total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {h.projects.map(p => (
                            p.screens.map((s, si) => (
                              <tr key={`${p.project_id}-${si}`} className="hover:bg-zinc-50">
                                {si === 0 ? (
                                  <td className="px-4 py-2" rowSpan={p.screens.length}>
                                    <Link href={`/proyectos/${p.project_id}`} className="hover:underline">
                                      <span className="font-mono text-xs text-sky-700">{p.code}</span>
                                      <span className="ml-1 text-zinc-800 font-medium">{p.name}</span>
                                    </Link>
                                    <p className="mt-0.5 text-xs text-zinc-400">Entrega: {p.planned_end_date}</p>
                                  </td>
                                ) : null}
                                {si === 0 ? (
                                  <td className="px-3 py-2 text-zinc-600" rowSpan={p.screens.length}>
                                    {p.client_name ?? "—"}
                                  </td>
                                ) : null}
                                <td className="px-3 py-2 text-zinc-800">{s.screen_type}</td>
                                <td className="px-3 py-2 text-right text-zinc-700">{s.quantity}</td>
                                <td className="px-3 py-2 text-xs text-zinc-600">
                                  {s.is_irregular
                                    ? `Irregular · ${s.area_m2 ?? "—"} m²`
                                    : s.width_m && s.height_m
                                      ? `${s.width_m} × ${s.height_m} m`
                                      : "—"}
                                </td>
                                <td className="px-3 py-2 text-xs text-zinc-500 text-right">
                                  {s.pitch_mm ? `${s.pitch_mm} mm` : "—"}
                                </td>
                                <td className="px-3 py-2 text-right text-zinc-600">{fmt(s.m2_unit)} m²</td>
                                <td className="px-3 py-2 text-right font-medium text-zinc-800">{fmt(s.m2_total)} m²</td>
                              </tr>
                            ))
                          ))}
                          <tr className="border-t-2 border-zinc-200 bg-zinc-50 font-semibold">
                            <td colSpan={7} className="px-4 py-2 text-right text-zinc-600">Total {h.label}</td>
                            <td className="px-3 py-2 text-right text-sky-700">{fmt(h.total_m2)} m²</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {totalProjects === 0 && (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-8 text-center text-zinc-500">
              No hay proyectos con pantallas y fecha de entrega planeada en este horizonte.<br />
              <span className="text-xs text-zinc-400">Ajusta los meses o revisa que los proyectos tengan pantallas registradas.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function clamp(n: number) {
  if (Number.isNaN(n)) return 3;
  return Math.max(1, Math.min(36, Math.round(n)));
}