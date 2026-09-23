"use client";

import { useMemo, useState, useRef, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { fetchJson, useResource } from "@/app/lib/client";
import { Modal, Field, TextInput, PrimaryButton, SecondaryButton } from "@/app/components/ui";

type GanttKind =
  | "planning"
  | "purchase"
  | "manufacture"
  | "ship_sea"
  | "ship_air"
  | "ship_courier"
  | "customs"
  | "assembly"
  | "install"
  | "close"
  | "generic";

const KIND_ORDER: GanttKind[] = [
  "planning",
  "purchase",
  "manufacture",
  "ship_sea",
  "ship_air",
  "ship_courier",
  "customs",
  "assembly",
  "install",
  "close",
];

interface GanttPhase {
  id: string;
  name: string;
  kind: string | null;
  status: string;
  blocked_reason: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
}

interface GanttProject {
  id: string;
  code: string;
  name: string;
  client_name: string | null;
  health_status: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  min_phase_start: string | null;
  max_phase_end: string | null;
  phases: GanttPhase[];
}

interface GanttResponse {
  projects: GanttProject[];
}

const KIND_STYLE: Record<GanttKind, { label: string; bar: string; color: string }> = {
  planning: { label: "Planeación", bar: "bg-sky-300 text-sky-900", color: "#7dd3fc" },
  purchase: { label: "Compra", bar: "bg-orange-300 text-orange-900", color: "#fdba74" },
  manufacture: { label: "Fabricación", bar: "bg-blue-300 text-blue-900", color: "#93c5fd" },
  ship_sea: { label: "Envío por barco", bar: "bg-cyan-300 text-cyan-900", color: "#67e8f9" },
  ship_air: { label: "Envío cargo aéreo", bar: "bg-violet-300 text-violet-900", color: "#c4b5fd" },
  ship_courier: { label: "Envío por paquetería", bar: "bg-fuchsia-300 text-fuchsia-900", color: "#f0abfc" },
  customs: { label: "Importación (aduana)", bar: "bg-lime-300 text-lime-900", color: "#bef264" },
  assembly: { label: "Armado", bar: "bg-amber-300 text-amber-900", color: "#fcd34d" },
  install: { label: "Instalación", bar: "bg-emerald-300 text-emerald-900", color: "#6ee7b7" },
  close: { label: "Cierre", bar: "bg-zinc-300 text-zinc-800", color: "#d4d4d8" },
  generic: { label: "Otra", bar: "bg-teal-300 text-teal-900", color: "#5eead4" },
};

const HEALTH_META: Record<string, { label: string; cls: string }> = {
  on_time: { label: "En tiempo", cls: "bg-emerald-100 text-emerald-700" },
  at_risk: { label: "En riesgo", cls: "bg-amber-100 text-amber-700" },
  blocked: { label: "Bloqueado", cls: "bg-rose-100 text-rose-700" },
  no_update: { label: "Sin novedad", cls: "bg-zinc-100 text-zinc-600" },
};

type ScaleKey = "month" | "biweek" | "week";
const SCALES: Record<ScaleKey, { label: string; days: number; px: number }> = {
  month: { label: "Mes", days: 30, px: 38 },
  biweek: { label: "2 semanas", days: 14, px: 64 },
  week: { label: "1 semana", days: 7, px: 88 },
};

const WEEKDAYS = ["D", "L", "M", "M", "J", "V", "S"];

type SortKey = "default" | "name" | "client";
const SORTS: Record<SortKey, string> = {
  default: "Creación",
  name: "Proyecto",
  client: "Cliente",
};

const LANE_H = 26;

interface LanePlacement {
  phase: GanttPhase;
  lane: number;
}

function phaseVisibleRange(
  phase: GanttPhase,
  from: Date,
  todayIdx: number,
  scale: { days: number }
): { i0: number; i1: number } | null {
  const startIso = toDateIso(phase.planned_start_date);
  if (!startIso) return null;
  const i0 = diffDays(from, startIso);
  let i1 = phase.planned_end_date ? diffDays(from, toDateIso(phase.planned_end_date)) : todayIdx;
  if (phase.status === "completed" && !phase.planned_end_date) i1 = i0;
  if (i1 < i0) i1 = i0;
  if (i0 > scale.days - 1 || i1 < 0) return null;
  return { i0, i1 };
}

function assignLanes(
  phases: GanttPhase[],
  from: Date,
  todayIdx: number,
  scale: { days: number }
): { placed: LanePlacement[]; lanes: number } {
  const items = phases
    .map((phase) => {
      const range = phaseVisibleRange(phase, from, todayIdx, scale);
      return range ? { phase, ...range } : null;
    })
    .filter((x): x is { phase: GanttPhase; i0: number; i1: number } => x !== null)
    .sort((a, b) => a.i0 - b.i0 || a.i1 - b.i1);

  const laneEnds: number[] = [];
  const placed: LanePlacement[] = [];
  for (const it of items) {
    let lane = laneEnds.findIndex((end) => end < it.i0);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.i1);
    } else {
      laneEnds[lane] = it.i1;
    }
    placed.push({ phase: it.phase, lane });
  }
  return { placed, lanes: laneEnds.length };
}

function mondayRef(): Date {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function diffDays(from: Date, iso: string): number {
  const [y, m, dd] = toDateIso(iso).split("-").map(Number);
  const t = new Date(y, m - 1, dd, 12, 0, 0, 0);
  return Math.round((t.getTime() - from.getTime()) / 86400000);
}

function toDateIso(v: string | null | undefined): string {
  if (!v) return "";
  return v.slice(0, 10);
}

function useGantt() {
  return useResource<GanttResponse>("/api/gantt");
}

export default function GanttView() {
  const { data, error, reload } = useGantt();
  const [scaleKey, setScaleKey] = useState<ScaleKey>("week");
  const [activeKinds, setActiveKinds] = useState<GanttKind[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [search, setSearch] = useState("");
  const [dayOffset, setDayOffset] = useState(0);
  const [edit, setEdit] = useState<{ projectId: string; phase: GanttPhase } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const scale = SCALES[scaleKey];
  const baseMonday = useMemo(() => mondayRef(), []);
  const from = useMemo(() => addDays(baseMonday, dayOffset), [baseMonday, dayOffset]);
  const days = useMemo(() => Array.from({ length: scale.days }, (_, i) => i), [scale.days]);
  const todayIdx = diffDays(from, isoToday());

  function shiftDay(delta: number) {
    setDayOffset((prev) => prev + delta);
  }

  function goToToday() {
    setDayOffset(0);
  }

  function toggleKind(kind: GanttKind) {
    setActiveKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );
  }

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    const filter = (ph: GanttPhase): boolean => {
      if (!ph.planned_start_date) return false;
      if (activeKinds.length === 0) return true;
      return activeKinds.includes(kindOf(ph.kind));
    };
    const matches = (text: string | null | undefined): boolean => {
      if (!query) return true;
      return (text ?? "").toLocaleLowerCase("es").includes(query);
    };
    const list = (data?.projects ?? [])
      .filter((p) => matches(p.code) || matches(p.name) || matches(p.client_name))
      .map((p) => {
        const visible = p.phases.filter(filter);
        const hasDates = p.phases.some((ph) => ph.planned_start_date);
        return { ...p, visible, hasDates };
      });
    const cmpText = (a: string | null, b: string | null) =>
      (a ?? "").localeCompare(b ?? "", "es", { sensitivity: "base" });
    list.sort((a, b) => {
      if (a.hasDates !== b.hasDates) return a.hasDates ? -1 : 1;
      if (sortKey === "name") return cmpText(a.name, b.name) || cmpText(a.code, b.code);
      if (sortKey === "client") return cmpText(a.client_name, b.client_name) || cmpText(a.name, b.name);
      return 0;
    });
    return list;
  }, [data, activeKinds, sortKey, search]);

  async function saveDates(start: string | null, end: string | null) {
    if (!edit) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await fetchJson(`/api/projects/${edit.projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          phases: [
            {
              id: edit.phase.id,
              planned_start_date: start ? toDateIso(start) : null,
              planned_end_date: end ? toDateIso(end) : null,
            },
          ],
        }),
      });
      setEdit(null);
      reload();
    } catch (err) {
      setSaveErr(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function resizePhase(projectId: string, phaseId: string, start: string, end: string | null) {
    setSaveErr(null);
    try {
      await fetchJson(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          phases: [{ id: phaseId, planned_start_date: start, planned_end_date: end }],
        }),
      });
      reload();
    } catch (err) {
      setSaveErr(String(err));
    }
  }

  return (
    <div className="bg-zinc-100 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold leading-tight">Proyectos · Vista Gantt</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-sm text-zinc-500">
                Cadencia {formatDay(from)} en adelante · cada barra es una fase con fecha planificada
              </p>
              <button
                onClick={() => shiftDay(-1)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
                title="Día anterior"
              >
                ← Día
              </button>
              <button
                onClick={goToToday}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
                title="Hoy"
              >
                Hoy
              </button>
              <button
                onClick={() => shiftDay(1)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
                title="Día siguiente"
              >
                Día →
              </button>
            </div>
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TextInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar proyecto…"
            className="w-48 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none"
          />
          <span className="text-xs text-zinc-500">Escala:</span>
          {(Object.keys(SCALES) as ScaleKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setScaleKey(key)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                scaleKey === key
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-700"
              }`}
            >
              {SCALES[key].label}
            </button>
          ))}
          <span className="ml-2 text-xs text-zinc-500">Orden:</span>
          {(Object.keys(SORTS) as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              title="Los proyectos con fechas van primero; los vacíos al final"
              className={`rounded-md border px-3 py-1.5 text-sm ${
                sortKey === key
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-700"
              }`}
            >
              {SORTS[key]}
            </button>
          ))}
          <div className="ml-auto w-full sm:w-auto">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5">
              <span className="text-xs text-zinc-500">Etapas · toca para filtrar:</span>
              <button
                onClick={() => setActiveKinds([])}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${
                  activeKinds.length === 0
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "border-zinc-300 bg-white text-zinc-600"
                }`}
              >
                Todas
              </button>
              {KIND_ORDER.map((k) => (
                <button
                  key={k}
                  onClick={() => toggleKind(k)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                    activeKinds.includes(k)
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 bg-white text-zinc-600"
                  }`}
                >
                  <span className={`h-2.5 w-3 rounded-sm ${KIND_STYLE[k].bar}`} />
                  {KIND_STYLE[k].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="p-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
        {saveErr && !edit && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            No se pudieron guardar las fechas: {saveErr}
          </div>
        )}
        {!data && !error && (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
            Cargando proyectos…
          </div>
        )}
        {data && (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div className="min-w-[900px]">
              <div className="flex border-b border-zinc-200 bg-zinc-50">
                <div className="w-[260px] shrink-0 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Proyecto
                </div>
                <div className="flex flex-1 border-l border-zinc-200">
                  {days.map((i) => {
                    const day = addDays(from, i);
                    return (
                      <div
                        key={i}
                        className="border-l border-zinc-100 px-0.5 py-1 text-center text-xs font-medium text-zinc-500"
                        style={{ width: scale.px }}
                      >
                        <span className="block">{day.getDate()}</span>
                        <span className="block text-[9px] font-semibold uppercase text-zinc-400">
                          {WEEKDAYS[day.getDay()]} · {day.getMonth() + 1}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {(visibleProjects ?? []).length === 0 && (
                <div className="p-4 text-sm text-zinc-500">
                  No hay proyectos con fases que coincidan con el filtro.
                </div>
              )}

              {(visibleProjects ?? []).map((p) => {
                const hasDates = p.visible.length > 0 || activeKinds.length === 0;
                const { placed, lanes } = assignLanes(p.visible, from, todayIdx, scale);
                const rowHeight = Math.max(46, lanes * LANE_H + 16);
                return (
                  <div
                    key={p.id}
                    className={`flex border-b border-zinc-100 last:border-b-0 ${
                      hasDates ? "" : "opacity-40"
                    }`}
                  >
                    <div className="flex w-[260px] shrink-0 flex-col justify-center gap-1 border-r border-zinc-100 px-4 py-2.5">
                      <Link href={`/proyectos/${p.id}`} title={`Abrir ${p.code}`} className="min-w-0 rounded hover:underline">
                        <p className="truncate text-sm font-medium text-zinc-800">
                          <span className="font-mono text-xs text-sky-700">{p.code}</span> {p.name}
                        </p>
                      </Link>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            HEALTH_META[p.health_status]?.cls ?? HEALTH_META.no_update.cls
                          }`}
                        >
                          {HEALTH_META[p.health_status]?.label ?? "Sin novedad"}
                        </span>
                        {p.client_name && (
                          <span className="truncate text-[10px] text-zinc-400">{p.client_name}</span>
                        )}
                      </div>
                    </div>
                    <div className="relative flex flex-1 items-stretch" style={{ minHeight: rowHeight }}>
                      {days.map((i) => (
                        <div key={i} className="h-full border-l border-zinc-50" style={{ width: scale.px }} />
                      ))}
                      {todayIdx >= 0 && todayIdx < scale.days && (
                        <div
                          className="pointer-events-none absolute top-0 bottom-0 border-l-2 border-dashed border-rose-400"
                          style={{ left: todayIdx * scale.px }}
                          title="Hoy"
                        />
                      )}
                      {placed.map(({ phase, lane }) => (
                        <Bar
                          key={phase.id}
                          phase={phase}
                          scale={scale}
                          from={from}
                          todayIdx={todayIdx}
                          top={8 + lane * LANE_H}
                          onEdit={() => setEdit({ projectId: p.id, phase })}
                          onResize={(start, end) => resizePhase(p.id, phase.id, start, end)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="mt-3 text-xs text-zinc-500">
          Solo se dibujan fases con fecha planificada; las marcadas como “no aplica” no aparecen.
          Arrastra una barra para moverla, o sus bordes para cambiar inicio y fin; al soltar se guarda.
          Toca una barra sin moverla para editar sus fechas con precisión. El rango del proyecto se deriva de sus fases.
        </p>
      </main>

      {edit && (
        <PhaseEditModal
          phase={edit.phase}
          saving={saving}
          err={saveErr}
          onSave={saveDates}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

type DragMode = "move" | "start" | "end";

function Bar({
  phase,
  scale,
  from,
  todayIdx,
  top,
  onEdit,
  onResize,
}: {
  phase: GanttPhase;
  scale: { days: number; px: number };
  from: Date;
  todayIdx: number;
  top: number;
  onEdit: () => void;
  onResize: (start: string, end: string | null) => void;
}) {
  const startIso = toDateIso(phase.planned_start_date);
  const endIso = toDateIso(phase.planned_end_date);
  const dragRef = useRef<{
    mode: DragMode;
    origStart: string;
    origEnd: string | null;
    days: number;
    moved: boolean;
  } | null>(null);
  const startXRef = useRef(0);
  const [preview, setPreview] = useState<{ mode: DragMode; days: number } | null>(null);

  if (!startIso) return null;

  const i0 = diffDays(from, startIso);
  let i1 = endIso ? diffDays(from, endIso) : todayIdx;
  if (phase.status === "completed" && !endIso) i1 = i0;
  if (i1 < i0) i1 = i0;
  if (i0 > scale.days - 1 || i1 < 0) return null;

  const kind = kindOf(phase.kind);
  const blocked = phase.status === "blocked" || Boolean(phase.blocked_reason);
  const shiftStart = preview && (preview.mode === "move" || preview.mode === "start") ? preview.days : 0;
  const shiftEnd = preview && (preview.mode === "move" || preview.mode === "end") ? preview.days : 0;
  const left = Math.max(0, i0 + shiftStart);
  const right = Math.min(scale.days - 1, i1 + shiftEnd);
  const width = Math.max(scale.px - 4, (right - left + 1) * scale.px - 4);

  function begin(e: ReactPointerEvent, mode: DragMode) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    startXRef.current = e.clientX;
    dragRef.current = { mode, origStart: startIso, origEnd: endIso || null, days: 0, moved: false };
    setPreview({ mode, days: 0 });
  }

  function move(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    let days = Math.round((e.clientX - startXRef.current) / scale.px);
    const endIdx = d.origEnd ? diffDays(from, d.origEnd) : null;
    if (d.mode === "start" && endIdx !== null) days = Math.min(days, endIdx - i0);
    if (d.mode === "end") days = Math.max(days, i0 - i1);
    d.days = days;
    if (days !== 0) d.moved = true;
    setPreview({ mode: d.mode, days });
  }

  function end() {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setPreview(null);
    if (!d.moved) {
      onEdit();
      return;
    }
    const newStart = d.mode === "end" ? d.origStart : addDaysIso(d.origStart, d.days);
    const newEnd =
      d.origEnd === null
        ? null
        : d.mode === "start"
          ? d.origEnd
          : addDaysIso(d.origEnd, d.days);
    onResize(newStart, newEnd);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => begin(e, "move")}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
      className={`absolute flex h-[22px] select-none items-center overflow-hidden rounded-md border border-white/70 pl-2 pr-2 text-left text-[11px] font-medium text-zinc-800 shadow-sm transition hover:brightness-95 ${
        preview ? "z-20 cursor-grabbing opacity-90 shadow-md" : "cursor-grab"
      } ${phase.status === "completed" && !preview ? "opacity-50" : "opacity-100"}`}
      style={{
        left: left * scale.px + 2,
        top,
        width,
        backgroundColor: KIND_STYLE[kind].color,
        touchAction: "none",
        ...(blocked ? { outline: "2px solid #f59e0b", outlineOffset: "1px" } : {}),
      }}
      title={`${phase.name}${blocked ? " · BLOQUEADO" : ""}\n${startIso || "?"} → ${endIso || "abierta"} · ${statusLabel(
        phase.status
      )}\nArrastra para mover · usa los bordes para cambiar inicio y fin`}
    >
      <span
        onPointerDown={(e) => begin(e, "start")}
        className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize bg-black/10 opacity-0 transition-opacity hover:opacity-100"
        aria-hidden
      />
      <span className="pointer-events-none truncate">{width > 78 ? phase.name : ""}</span>
      {endIso ? (
        <span
          onPointerDown={(e) => begin(e, "end")}
          className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize bg-black/10 opacity-0 transition-opacity hover:opacity-100"
          aria-hidden
        />
      ) : null}
    </div>
  );
}

function PhaseEditModal({
  phase,
  saving,
  err,
  onSave,
  onClose,
}: {
  phase: GanttPhase;
  saving: boolean;
  err: string | null;
  onSave: (start: string | null, end: string | null) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(toDateIso(phase.planned_start_date));
  const [openEnd, setOpenEnd] = useState(phase.planned_end_date === null && phase.planned_start_date !== null);
  const [end, setEnd] = useState(toDateIso(phase.planned_end_date));

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`Editar etapa · ${phase.name}`}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={() => onSave(start || null, openEnd ? null : end || null)} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Fecha de inicio planificada">
          <TextInput type="date" value={start} onChange={setStart} />
        </Field>
        <div className="flex items-center gap-3 pt-1">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={openEnd}
              onChange={(e) => setOpenEnd(e.target.checked)}
              className="rounded border-zinc-300"
            />
            Fase abierta (sin fecha de fin)
          </label>
        </div>
        {!openEnd && (
          <Field label="Fecha de fin planificada">
            <TextInput type="date" value={end} onChange={setEnd} />
          </Field>
        )}
        {err && <p className="text-[11px] text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}

function kindOf(kind: string | null): GanttKind {
  return (kind && (KIND_ORDER as string[]).includes(kind) ? kind : "generic") as GanttKind;
}

function statusLabel(status: string): string {
  switch (status) {
    case "planned":
      return "planeada";
    case "completed":
      return "completada";
    case "in_progress":
      return "en curso";
    case "blocked":
      return "bloqueada";
    default:
      return "no iniciada";
  }
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = toDateIso(iso).split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDay(d: Date): string {
  const months = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
