"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ACTIVITIES,
  TECHNICIANS,
  WEEKDAY_SHORT,
  mondayOfWeek,
  weekDays,
  formatShortDate,
  isToday,
  STATUS_META,
  KIND_META,
  type Activity,
  type Technician,
} from "@/app/lib/prototype-data";

export default function WeekAgenda() {
  const [monday, setMonday] = useState(() => mondayOfWeek(new Date()));
  const [selected, setSelected] = useState<Activity | null>(null);
  const [filterKind, setFilterKind] = useState<"all" | "project" | "ticket" | "internal">("all");

  const days = useMemo(() => weekDays(monday), [monday]);

  const visible = useMemo(
    () => (filterKind === "all" ? ACTIVITIES : ACTIVITIES.filter((a) => a.kind === filterKind)),
    [filterKind]
  );

  const plannedTotal = visible.reduce((s, a) => s + a.plannedHours, 0);
  const workedTotal = visible.reduce((s, a) => s + a.workedHours, 0);
  const overdue = visible.filter((a) => a.overdue).length;
  const blocked = visible.filter((a) => a.blocked).length;
  const unassignedTickets = 4;
  const weekLabel = `${formatShortDate(days[0])} – ${formatShortDate(days[6])} de ${new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(days[0])}`;

  function shift(delta: number) {
    const next = new Date(monday);
    next.setDate(next.getDate() + delta * 7);
    setMonday(next);
  }

  function activityFor(tech: Technician, day: Date): Activity | undefined {
    const weekday = ((day.getDay() + 6) % 7) + 1;
    return visible.find((a) => a.technicianId === tech.id && a.weekday === weekday);
  }

  return (
    <div className="bg-zinc-100 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold leading-tight">Operaciones técnicas</h1>
            <p className="text-sm text-zinc-500">
              Semana del {weekLabel}
            </p>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/gantt" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
              Vista Gantt
            </Link>
          </nav>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => shift(-1)} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
            ← Semana anterior
          </button>
          <button onClick={() => setMonday(mondayOfWeek(new Date()))} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
            Hoy
          </button>
          <button onClick={() => shift(1)} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
            Semana siguiente →
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-zinc-300 text-sm">
              {(["all", "project", "ticket", "internal"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setFilterKind(k)}
                  className={`px-3 py-1.5 ${
                    filterKind === k ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {k === "all" ? "Todo" : k === "project" ? "Proyectos" : k === "ticket" ? "Tickets" : "Internas"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
            <p className="text-xs text-rose-600">Actividades vencidas</p>
            <p className="text-xl font-semibold text-rose-700">{overdue}</p>
          </div>
          <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2">
            <p className="text-xs text-violet-600">Tickets sin asignar</p>
            <p className="text-xl font-semibold text-violet-700">{unassignedTickets}</p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-600">Proyectos bloqueados</p>
            <p className="text-xl font-semibold text-amber-700">{blocked}</p>
          </div>
          <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
            <p className="text-xs text-zinc-500">Horas plan / real</p>
            <p className="text-xl font-semibold text-zinc-800">
              {plannedTotal} / {workedTotal}
            </p>
          </div>
        </div>
      </header>

      <main className="p-4">
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[140px_repeat(7,1fr)] border-b border-zinc-200 bg-zinc-50">
              <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Técnico
              </div>
              {days.map((d, i) => (
                <div key={i} className={`px-1 py-2 text-center ${isToday(d) ? "bg-sky-50" : ""}`}>
                  <p className={`text-xs font-semibold ${isToday(d) ? "text-sky-700" : "text-zinc-700"}`}>
                    {WEEKDAY_SHORT[i]}
                  </p>
                  <p className={`text-xs ${isToday(d) ? "text-sky-600" : "text-zinc-400"}`}>
                    {formatShortDate(d)}
                  </p>
                </div>
              ))}
            </div>

            {TECHNICIANS.map((tech) => (
              <div
                key={tech.id}
                className="grid grid-cols-[140px_repeat(7,1fr)] border-b border-zinc-100 last:border-b-0"
              >
                <div className="flex items-center gap-2 border-r border-zinc-100 px-3 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-white">
                    {tech.short}
                  </span>
                  <span className="text-xs font-medium text-zinc-700">{tech.name}</span>
                </div>
                {days.map((d, i) => {
                  const act = activityFor(tech, d);
                  return (
                    <div
                      key={i}
                      className={`min-h-[92px] border-r border-zinc-100 p-1 last:border-r-0 ${
                        isToday(d) ? "bg-sky-50/60" : ""
                      }`}
                    >
                      {act && <ActivityCard activity={act} onClick={() => setSelected(act)} />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Prototipo con datos de ejemplo. Haz clic en una tarjeta para ver el detalle. La cuadrícula
          mostrará técnicos en filas y días en columnas.
        </p>
      </main>

      {selected && <DetailPanel activity={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ActivityCard({ activity, onClick }: { activity: Activity; onClick: () => void }) {
  const meta = STATUS_META[activity.status];
  const kind = KIND_META[activity.kind];
  const hours = activity.workedHours > 0 ? `${activity.workedHours}h` : `${activity.plannedHours}h plan`;

  return (
    <button
      onClick={onClick}
      className={`flex w-full flex-col gap-1 rounded-md border p-1.5 text-left shadow-sm transition hover:shadow ${meta.card} ${
        activity.overdue ? "ring-1 ring-rose-400" : ""
      } ${activity.blocked ? "ring-1 ring-amber-400" : ""}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={`rounded px-1 text-[10px] font-semibold ${kind.codeClass}`}>{activity.code}</span>
        <span className={`h-2 w-2 rounded-full ${meta.dot}`} title={meta.label} />
      </div>
      <p className="truncate text-[11px] font-medium leading-tight text-zinc-800">{activity.name}</p>
      <p className="truncate text-[10px] text-zinc-500">
        {activity.client} · {activity.location}
      </p>
      <div className="flex items-center justify-between text-[10px] text-zinc-600">
        <span>{hours}</span>
        <span className="flex items-center gap-1">
          {activity.blocked && <span className="text-amber-600">Bloqueado</span>}
          {activity.overdue && <span className="text-rose-600">Vencido</span>}
        </span>
      </div>
    </button>
  );
}

function DetailPanel({ activity, onClose }: { activity: Activity; onClose: () => void }) {
  const meta = STATUS_META[activity.status];
  const kind = KIND_META[activity.kind];
  const tech = TECHNICIANS.find((t) => t.id === activity.technicianId);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${kind.codeClass}`}>
              {activity.code}
            </span>
            <h2 className="mt-2 text-lg font-semibold text-zinc-900">{activity.name}</h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar panel" className="rounded-md border border-zinc-300 px-2 py-1 text-zinc-600 hover:bg-zinc-50">
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <DetailField label="Tipo" value={kind.label} />
          <DetailField label="Estado" value={meta.label} />
          <DetailField label="Cliente" value={activity.client} />
          <DetailField label="Ubicación" value={activity.location} />
          <DetailField label="Técnico" value={tech?.name ?? "—"} />
          <DetailField label="Horas" value={`${activity.workedHours} trabajadas / ${activity.plannedHours} planeadas`} />
          <DetailField label="Progreso" value={`${activity.progress}%`} />
          <DetailField label="Próxima acción" value={activity.blocked ? "Esperando material / autorización" : "Continuar según plan"} />
        </dl>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>Avance</span>
            <span>{activity.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div
              className={`h-full rounded-full ${activity.status === "completed" ? "bg-emerald-500" : "bg-sky-500"}`}
              style={{ width: `${activity.progress}%` }}
            />
          </div>
        </div>

        <div className="mt-5 space-y-3 border-t border-zinc-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Historial</h3>
          <div className="rounded-md border border-zinc-200 p-3">
            <p className="text-xs font-medium text-zinc-700">{tech?.name}</p>
            <p className="mt-1 text-sm text-zinc-600">
              {activity.blocked
                ? "Material retrasado por proveedor; se solicita cotización de envío exprés."
                : "Actividad registrada según plan semanal."}
            </p>
            <p className="mt-1 text-[11px] text-zinc-400">Hace 1 día · Comentario</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
          <button className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700">
            Registrar horas
          </button>
          <button className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
            Añadir comentario
          </button>
          <button className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
            Adjuntar evidencia
          </button>
        </div>
      </aside>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="font-medium text-zinc-800">{value}</dd>
    </div>
  );
}