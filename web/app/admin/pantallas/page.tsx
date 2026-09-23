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
  total_m2: number;
}
interface MonthData {
  month: string;
  total_m2: number;
  by_type: Record<string, number>;
  projects: ProjectRow[];
}
interface ReportData {
  from: string;
  to: string;
  months: MonthData[];
  all_types: string[];
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

/* ── Componente principal ────────────────────────── */
export default function PantallasPage() {
  const [months, setMonths] = useState(6);
  const [anchor, setAnchor] = useState(todayYM());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const url = `/api/reports/screens-m2?months=${months}&anchor=${anchor}-01`;
  const { data, error } = useResource<ReportData>(url);

  const totalM2All = useMemo(
    () => data?.months.reduce((s, m) => s + m.total_m2, 0) ?? 0,
    [data]
  );

  function toggleMonth(key: string) {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  }

  return (
    <div className="p-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Estimación m² a instalar</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Proyectos con pantallas registradas, agrupados por mes de entrega planeada.
          </p>
        </div>
      </div>

      {/* ── Controles ── */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {/* Navegación meses */}
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

        <span className="text-sm font-medium text-zinc-700">{monthLabel(anchor)}</span>

        {/* Escala de meses */}
        <div className="flex items-center gap-1 ml-4">
          <span className="text-xs text-zinc-500">Horizonte:</span>
          {[1, 3, 6, 12].map(n => (
            <button
              key={n}
              onClick={() => setMonths(n)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                months === n
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {n === 1 ? "1 mes" : n === 12 ? "1 año" : `${n} meses`}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {!data && !error && <Spinner />}

      {data && (
        <>
          {/* ── Resumen total ── */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
              <p className="text-xs text-sky-600 font-medium uppercase tracking-wide">Total m² en el periodo</p>
              <p className="mt-1 text-3xl font-bold text-sky-800">{fmt(totalM2All)} m²</p>
              <p className="text-xs text-sky-600 mt-1">{monthLabel(anchor)} → {monthLabel(addMonths(anchor, months - 1))}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Proyectos con pantallas</p>
              <p className="mt-1 text-3xl font-bold text-zinc-800">
                {new Set(data.months.flatMap(m => m.projects.map(p => p.project_id))).size}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Tipos de pantalla</p>
              <p className="mt-1 text-3xl font-bold text-zinc-800">{data.all_types.length}</p>
              <p className="text-xs text-zinc-400 mt-1 truncate">{data.all_types.join(", ") || "—"}</p>
            </div>
          </div>

          {/* ── Resumen por tipo de pantalla ── */}
          {data.all_types.length > 0 && (
            <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
              <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 border-b border-zinc-100">
                m² por tipo de pantalla · todos los meses
              </p>
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    {data.months.map(m => (
                      <th key={m.month} className="px-3 py-2 text-right whitespace-nowrap">{monthLabel(m.month)}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.all_types.map(type => {
                    const total = data.months.reduce((s, m) => s + (m.by_type[type] ?? 0), 0);
                    return (
                      <tr key={type} className="hover:bg-zinc-50">
                        <td className="px-3 py-2 font-medium text-zinc-800">{type}</td>
                        {data.months.map(m => (
                          <td key={m.month} className="px-3 py-2 text-right text-zinc-600">
                            {m.by_type[type] ? `${fmt(m.by_type[type])} m²` : "—"}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right font-semibold text-zinc-800">{fmt(total)} m²</td>
                      </tr>
                    );
                  })}
                  {/* Fila total */}
                  <tr className="bg-zinc-50 font-semibold">
                    <td className="px-3 py-2 text-zinc-700">Total</td>
                    {data.months.map(m => (
                      <td key={m.month} className="px-3 py-2 text-right text-sky-700">
                        {m.total_m2 > 0 ? `${fmt(m.total_m2)} m²` : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right text-sky-800">{fmt(totalM2All)} m²</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ── Detalle por mes ── */}
          <div className="mt-6 space-y-3">
            {data.months.map(m => {
              const expanded = expandedMonths.has(m.month);
              const isEmpty = m.projects.length === 0;
              return (
                <div key={m.month} className="rounded-lg border border-zinc-200 bg-white shadow-sm">
                  <button
                    onClick={() => !isEmpty && toggleMonth(m.month)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-left ${isEmpty ? "cursor-default" : "hover:bg-zinc-50"}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-semibold ${isEmpty ? "text-zinc-400" : "text-zinc-800"}`}>
                        {monthLabel(m.month)}
                      </span>
                      {!isEmpty && (
                        <span className="text-xs text-zinc-500">
                          {m.projects.length} proyecto{m.projects.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {m.total_m2 > 0 ? (
                        <span className="rounded-full bg-sky-100 px-3 py-0.5 text-sm font-bold text-sky-700">
                          {fmt(m.total_m2)} m²
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400">Sin proyectos</span>
                      )}
                      {!isEmpty && (
                        <svg
                          className={`w-4 h-4 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>
                  </button>

                  {expanded && !isEmpty && (
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
                          {m.projects.map(p => (
                            p.screens.map((s, si) => (
                              <tr key={`${p.project_id}-${si}`} className="hover:bg-zinc-50">
                                {si === 0 ? (
                                  <td className="px-4 py-2" rowSpan={p.screens.length}>
                                    <Link href={`/proyectos/${p.project_id}`} className="hover:underline">
                                      <span className="font-mono text-xs text-sky-700">{p.code}</span>
                                      <span className="ml-1 text-zinc-800 font-medium">{p.name}</span>
                                    </Link>
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                      Entrega: {p.planned_end_date}
                                    </p>
                                  </td>
                                ) : null}
                                {si === 0 ? (
                                  <td className="px-3 py-2 text-zinc-600" rowSpan={p.screens.length}>
                                    {p.client_name ?? "—"}
                                  </td>
                                ) : null}
                                <td className="px-3 py-2 text-zinc-800">{s.screen_type}</td>
                                <td className="px-3 py-2 text-right text-zinc-700">{s.quantity}</td>
                                <td className="px-3 py-2 text-zinc-600 text-xs">
                                  {s.is_irregular
                                    ? `Irregular · ${s.area_m2 ?? "—"} m²`
                                    : s.width_m && s.height_m
                                      ? `${s.width_m} × ${s.height_m} m`
                                      : "—"}
                                </td>
                                <td className="px-3 py-2 text-right text-zinc-500 text-xs">
                                  {s.pitch_mm ? `${s.pitch_mm} mm` : "—"}
                                </td>
                                <td className="px-3 py-2 text-right text-zinc-600">{fmt(s.m2_unit)} m²</td>
                                <td className="px-3 py-2 text-right font-medium text-zinc-800">{fmt(s.m2_total)} m²</td>
                              </tr>
                            ))
                          ))}
                          {/* Subtotal del mes */}
                          <tr className="bg-zinc-50 font-semibold border-t-2 border-zinc-200">
                            <td colSpan={7} className="px-4 py-2 text-right text-zinc-600">Total {monthLabel(m.month)}</td>
                            <td className="px-3 py-2 text-right text-sky-700">{fmt(m.total_m2)} m²</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {data.months.every(m => m.projects.length === 0) && (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-8 text-center text-zinc-500">
              No hay proyectos con pantallas registradas en este periodo.<br />
              <span className="text-xs text-zinc-400">Asegúrate de que los proyectos tengan fecha de entrega planeada y pantallas registradas.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}