"use client";

import { useMemo, useState } from "react";
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

type ScaleKey = "month" | "week";
const SCALES: Record<ScaleKey, { label: string; days: number; px: number }> = {
  month: { label: "Mes", days: 30, px: 38 },
  week: { label: "Zoom (2 semanas)", days: 14, px: 64 },
};

const WEEKDAYS = ["D", "L", "M", "M", "J", "V", "S"];

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
  const [scaleKey, setScaleKey] = useState<ScaleKey>("month");
  const [activeKinds, setActiveKinds] = useState<GanttKind[]>([]);
  const [edit, setEdit] = useState<{ projectId: string; phase: GanttPhase } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const scale = SCALES[scaleKey];
  const from = useMemo(() => mondayRef(), []);
  const days = useMemo(() => Array.from({ length: scale.days }, (_, i) => i), [scale.days]);
  const todayIdx = diffDays(from, isoToday());

  function toggleKind(kind: GanttKind) {
    setActiveKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );
  }

  const visibleProjects = useMemo(() => {
    const filter = (ph: GanttPhase): boolean => {
      if (!ph.planned_start_date) return false;
      if (activeKinds.length === 0) return true;
      return activeKinds.includes(kindOf(ph.kind));
    };
    return data?.projects.map((p) => {
      const visible = p.phases.filter(filter);
      return { ...p, visible };
    });
  }, [data, activeKinds]);

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

  return (
    <div className="bg-zinc-100 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold leading-tight">Proyectos · Vista Gantt</h1>
            <p className="text-sm text-zinc-500">
              Cadencia {formatDay(from)} en adelante · cada barra es una fase con fecha planificada
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
        {!data && !error && (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
            Cargando proyectos…
          </div>
        )}
        {data && (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div className="min-w-[900px]">
              <div className="flex border-b border-zinc-200 bg-zinc-50">
                <div className="w-72 shrink-0 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
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
                return (
                  <div
                    key={p.id}
                    className={`flex border-b border-zinc-100 last:border-b-0 ${
                      hasDates ? "" : "opacity-40"
                    }`}
                  >
                    <div className="flex w-72 shrink-0 flex-col justify-center gap-1 border-r border-zinc-100 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-800">
                          <span className="font-mono text-xs text-zinc-500">{p.code}</span> {p.name}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            HEALTH_META[p.health_status]?.cls ?? HEALTH_META.no_update.cls
                          }`}
                        >
                          {HEALTH_META[p.health_status]?.label ?? "Sin novedad"}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {projectRange(p)}
                        </span>
                      </div>
                    </div>
                    <div className="relative flex flex-1 items-center py-2.5" style={{ minHeight: 46 }}>
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
                      {p.visible.map((ph) => (
                        <Bar
                          key={ph.id}
                          phase={ph}
                          scale={scale}
                          from={from}
                          todayIdx={todayIdx}
                          onEdit={() => setEdit({ projectId: p.id, phase: ph })}
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
          Toca una barra para ajustar sus fechas. El rango del proyecto se deriva de sus fases.
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

function Bar({
  phase,
  scale,
  from,
  todayIdx,
  onEdit,
}: {
  phase: GanttPhase;
  scale: { days: number; px: number };
  from: Date;
  todayIdx: number;
  onEdit: () => void;
}) {
  const start = phase.planned_start_date;
  const end = phase.planned_end_date;
  if (!start) return null;

  const i0 = diffDays(from, start);
  let i1 = end ? diffDays(from, end) : todayIdx;
  if (phase.status === "completed" && !end) i1 = i0;
  if (i1 < i0) i1 = i0;
  if (i0 > scale.days - 1 || i1 < 0) return null;

  const left = Math.max(0, i0);
  const right = Math.min(scale.days - 1, i1);
  const width = (right - left + 1) * scale.px - 4;
  const kind = kindOf(phase.kind);
  const blocked = phase.status === "blocked" || Boolean(phase.blocked_reason);

  return (
    <button
      type="button"
      onClick={onEdit}
      className={`absolute flex h-7 items-center overflow-hidden rounded-md border border-white/70 pl-2 pr-2 text-left text-[11px] font-medium text-zinc-800 shadow-sm transition hover:brightness-95 ${
        phase.status === "completed" ? "opacity-50" : "opacity-100"
      }`}
      style={{
        left: left * scale.px + 2,
        width,
        backgroundColor: KIND_STYLE[kind].color,
        ...(blocked ? { outline: "2px solid #f59e0b", outlineOffset: "1px" } : {}),
      }}
      title={`${phase.name}${blocked ? " · BLOQUEADO" : ""}\n${toDateIso(start) ?? "?"} → ${toDateIso(end) ?? "abierta"} · ${statusLabel(phase.status)}`}
    >
      {width > 78 ? <span className="truncate">{phase.name}</span> : null}
    </button>
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

function projectRange(p: GanttProject): string {
  const from = p.min_phase_start ?? p.planned_start_date;
  const to = p.max_phase_end ?? p.planned_end_date;
  if (!from && !to) return "sin fechas";
  return `${from ? toDateIso(from) : "?"} → ${to ? toDateIso(to) : "?"}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
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