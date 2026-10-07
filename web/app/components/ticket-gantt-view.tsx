"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { fetchJson, useResource } from "@/app/lib/client";
import { ticketStatusLabel } from "@/app/lib/format";
import { dateAtNoon, todayIso } from "@/app/lib/time";
import { Field, Modal, PrimaryButton, SecondaryButton, Select, Spinner, TextInput, UiMark } from "@/app/components/ui";

type ScaleKey = "week" | "biweek" | "month";

const SCALES: Record<ScaleKey, { label: string; days: number; px: number }> = {
  week: { label: "1 semana", days: 7, px: 88 },
  biweek: { label: "2 semanas", days: 14, px: 64 },
  month: { label: "Mes", days: 30, px: 38 },
};

const ACTIVITY_STYLE: Record<string, string> = {
  planned: "bg-sky-300 text-sky-950",
  in_progress: "bg-amber-300 text-amber-950",
  completed: "bg-emerald-300 text-emerald-950",
};

const TICKET_STATUS_STYLE: Record<string, string> = {
  new: "bg-zinc-100 text-zinc-700",
  to_review: "bg-violet-100 text-violet-700",
  unassigned: "bg-rose-100 text-rose-700",
  scheduled: "bg-sky-100 text-sky-700",
  in_progress: "bg-amber-100 text-amber-700",
  waiting_client: "bg-orange-100 text-orange-700",
  waiting_material: "bg-fuchsia-100 text-fuchsia-700",
  waiting_access: "bg-cyan-100 text-cyan-700",
  resolved_pending_validation: "bg-emerald-100 text-emerald-700",
};

const WEEKDAYS = ["D", "L", "M", "M", "J", "V", "S"];
const LANE_H = 26;

const EDITABLE_TICKET_STATUSES = [
  "new",
  "to_review",
  "unassigned",
  "scheduled",
  "in_progress",
  "waiting_client",
  "waiting_material",
  "waiting_access",
  "resolved_pending_validation",
];

interface TicketItem {
  id: string;
  kind: "activity" | "next_action";
  label: string;
  status: string;
  start_date: string;
  end_date: string | null;
  planned_hours: number;
  technicians: string[];
}

interface TicketRow {
  id: string;
  code: string;
  title: string;
  status: string;
  ticket_type: string;
  client_name: string | null;
  priority_name: string | null;
  next_action: string | null;
  next_action_date: string | null;
  opened_at: string;
  items: TicketItem[];
  assignments: AssignmentRow[];
}

interface TicketGanttResponse {
  tickets: TicketRow[];
  technicians: { id: string; display_name: string }[];
}

interface AssignmentRow {
  id: string;
  ticket_id: string;
  technician_id: string;
  technician_name: string;
}

function mondayRef(): Date {
  const d = dateAtNoon(todayIso());
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(12, 0, 0, 0);
  return d;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diffDays(from: Date, value: string): number {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return Math.round((date.getTime() - from.getTime()) / 86400000);
}

function addDaysIso(value: string, days: number): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function assignLanes(items: TicketItem[]): { item: TicketItem; lane: number }[] {
  const laneEnds: number[] = [];
  return [...items]
    .sort((a, b) =>
      a.start_date.localeCompare(b.start_date) ||
      (a.end_date ?? a.start_date).localeCompare(b.end_date ?? b.start_date)
    )
    .map((item) => {
      const start = new Date(`${item.start_date}T12:00:00`).getTime();
      const end = new Date(`${item.end_date ?? item.start_date}T12:00:00`).getTime();
      let lane = laneEnds.findIndex((laneEnd) => laneEnd < start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      return { item, lane };
    });
}

export default function TicketGanttView() {
  const { data, error, reload } = useResource<TicketGanttResponse>("/api/ticket-gantt");
  const [scaleKey, setScaleKey] = useState<ScaleKey>("month");
  const [dayOffset, setDayOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [statusId, setStatusId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ ticket: TicketRow; rect: DOMRect } | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const scale = SCALES[scaleKey];
  const baseMonday = useMemo(() => mondayRef(), []);
  const from = useMemo(() => addDays(baseMonday, dayOffset), [baseMonday, dayOffset]);
  const days = useMemo(() => Array.from({ length: scale.days }, (_, i) => i), [scale.days]);
  const todayIdx = diffDays(from, todayIso());

  const tickets = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("es");
    return (data?.tickets ?? [])
      .filter((ticket) => !status || ticket.status === status)
      .filter((ticket) => !q || [ticket.code, ticket.title, ticket.client_name]
        .some((value) => (value ?? "").toLocaleLowerCase("es").includes(q)))
      .sort((a, b) => {
        const tier = (ticket: TicketRow) => {
          if (ticket.status === "resolved_pending_validation") return 2;
          if (ticket.items.length === 0 && ticket.assignments.length === 0) return 0;
          return 1;
        };
        const tierDiff = tier(a) - tier(b);
        if (tierDiff !== 0) return tierDiff;
        const aStart = a.items.map((item) => item.start_date).sort()[0] ?? "9999-12-31";
        const bStart = b.items.map((item) => item.start_date).sort()[0] ?? "9999-12-31";
        return aStart.localeCompare(bStart) || a.code.localeCompare(b.code);
      });
  }, [data, search, status]);

  const assigning = data?.tickets.find((ticket) => ticket.id === assigningId) ?? null;
  const scheduling = data?.tickets.find((ticket) => ticket.id === schedulingId) ?? null;
  const statusTicket = data?.tickets.find((ticket) => ticket.id === statusId) ?? null;

  async function moveActivity(item: TicketItem, start: string, end: string | null) {
    if (item.kind !== "activity") return;
    setSaveErr(null);
    try {
      await fetchJson(`/api/activities/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ date: start, end_date: end }),
      });
      reload();
    } catch (err) {
      setSaveErr(String(err));
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Tickets abiertos · Vista Gantt</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Programación basada en actividades y próximas acciones de tickets no cerrados.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/agenda" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
              Agenda semanal
            </Link>
            <Link href="/tickets" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
              Lista de tickets
            </Link>
          </div>
        </div>

        <div className="mt-3 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
          <TextInput value={search} onChange={setSearch} placeholder="Buscar ticket…" className="w-52 shrink-0" />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-44 shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-700"
          >
            <option value="">Todos los estados abiertos</option>
            <option value="new">Nuevo</option>
            <option value="to_review">Por revisar</option>
            <option value="unassigned">Sin asignar</option>
            <option value="scheduled">Programado</option>
            <option value="in_progress">En progreso</option>
            <option value="waiting_client">Esperando cliente</option>
            <option value="waiting_material">Esperando material</option>
            <option value="waiting_access">Esperando acceso</option>
            <option value="resolved_pending_validation">Resuelto / Pendiente validación</option>
          </select>
          <span className="shrink-0 text-xs text-zinc-500">Escala:</span>
          {(Object.keys(SCALES) as ScaleKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setScaleKey(key)}
              className={`shrink-0 rounded-md border px-3 py-1.5 text-sm ${
                scaleKey === key ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700"
              }`}
            >
              {SCALES[key].label}
            </button>
          ))}
          <button type="button" onClick={() => setDayOffset((v) => v - 1)} className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm">← Día</button>
          <button type="button" onClick={() => setDayOffset(0)} className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm">Hoy</button>
          <button type="button" onClick={() => setDayOffset((v) => v + 1)} className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm">Día →</button>
        </div>
      </header>

      <main className="p-4">
        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {saveErr && <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveErr}</div>}
        {!data && !error && <div className="rounded-lg border border-zinc-200 bg-white p-6"><Spinner /></div>}
        {data && (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div style={{ minWidth: 300 + scale.days * scale.px }}>
              <div className="flex border-b border-zinc-200 bg-zinc-50">
                <div className="w-[300px] shrink-0 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Ticket</div>
                <div className="flex border-l border-zinc-200">
                  {days.map((index) => {
                    const day = addDays(from, index);
                    return (
                      <div key={index} className="border-l border-zinc-100 px-0.5 py-1 text-center text-xs text-zinc-500" style={{ width: scale.px }}>
                        <span className="block font-medium">{day.getDate()}</span>
                        <span className="block text-[9px] font-semibold uppercase text-zinc-400">{WEEKDAYS[day.getDay()]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {tickets.length === 0 && <div className="p-4 text-sm text-zinc-500">No hay tickets que coincidan con los filtros.</div>}
              {tickets.map((ticket) => {
                const placed = assignLanes(ticket.items);
                const lanes = placed.length === 0 ? 0 : Math.max(...placed.map((entry) => entry.lane)) + 1;
                const rowHeight = Math.max(54, lanes * LANE_H + 16);
                return (
                  <div key={ticket.id} className="flex border-b border-zinc-100 last:border-0">
                    <div className="flex w-[300px] shrink-0 flex-col justify-center border-r border-zinc-100 px-4 py-2" style={{ minHeight: rowHeight }}>
                      <div className="flex items-start gap-1">
                        <Link href={`/tickets/${ticket.id}`} className="min-w-0 flex-1 truncate font-medium text-zinc-800 hover:underline">
                          <span className="font-mono text-xs text-sky-700">{ticket.code}</span> {ticket.title}
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenu(menu?.ticket.id === ticket.id ? null : { ticket, rect: e.currentTarget.getBoundingClientRect() });
                          }}
                          aria-label={`Acciones de ${ticket.code}`}
                          aria-haspopup="menu"
                          aria-expanded={menu?.ticket.id === ticket.id}
                          className="shrink-0 rounded px-1.5 text-base leading-5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                        >
                          ⋮
                        </button>
                      </div>
                      <p className="truncate text-xs text-zinc-400">{ticket.client_name ?? "Sin cliente"}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TICKET_STATUS_STYLE[ticket.status] ?? "bg-zinc-100 text-zinc-600"}`}>
                          {ticketStatusLabel(ticket.status)}
                        </span>
                        {ticket.items.length === 0 && <span className="text-[10px] text-rose-600">Sin programación</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="min-w-0 truncate text-[10px] text-zinc-500">
                          {ticket.assignments.length > 0
                            ? ticket.assignments.map((assignment) => assignment.technician_name).join(", ")
                            : "Sin técnico asignado"}
                        </span>
                      </div>
                    </div>
                    <div className="relative flex" style={{ minHeight: rowHeight, width: scale.days * scale.px }}>
                      {days.map((index) => <div key={index} className="h-full border-l border-zinc-50" style={{ width: scale.px }} />)}
                      {todayIdx >= 0 && todayIdx < scale.days && (
                        <div className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-rose-400" style={{ left: todayIdx * scale.px + scale.px / 2 }} title="Hoy" />
                      )}
                      {placed.map(({ item, lane }) => (
                        <TicketBar
                          key={item.id}
                          item={item}
                          from={from}
                          scale={scale}
                          top={8 + lane * LANE_H}
                          onMove={(start, end) => void moveActivity(item, start, end)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
          <Legend cls="bg-sky-300" label="Planeada" />
          <Legend cls="bg-amber-300" label="En progreso" />
          <Legend cls="bg-emerald-300" label="Completada" />
          <Legend cls="bg-rose-300" label="Próxima acción" />
        </div>
        <p className="mt-2 text-xs text-zinc-400">Arrastra una actividad para moverla conservando su duración.</p>
      </main>

      {assigning && data && (
        <AssignmentModal
          ticket={assigning}
          technicians={data.technicians}
          onClose={() => setAssigningId(null)}
          onChanged={reload}
        />
      )}
      {scheduling && data && (
        <ScheduleTicketModal
          key={scheduling.id}
          ticket={scheduling}
          technicians={data.technicians}
          onClose={() => setSchedulingId(null)}
          onSaved={() => {
            setSchedulingId(null);
            reload();
          }}
        />
      )}
      {statusTicket && (
        <TicketStatusModal
          key={statusTicket.id}
          ticket={statusTicket}
          onClose={() => setStatusId(null)}
          onSaved={() => {
            setStatusId(null);
            reload();
          }}
        />
      )}
      {menu && (
        <TicketRowMenu
          ticket={menu.ticket}
          rect={menu.rect}
          onClose={() => setMenu(null)}
          onStatus={() => setStatusId(menu.ticket.id)}
          onSchedule={() => setSchedulingId(menu.ticket.id)}
          onAssign={() => setAssigningId(menu.ticket.id)}
        />
      )}
    </div>
  );
}

function TicketBar({
  item,
  from,
  scale,
  top,
  onMove,
}: {
  item: TicketItem;
  from: Date;
  scale: { days: number; px: number };
  top: number;
  onMove: (start: string, end: string | null) => void;
}) {
  const dragRef = useRef<{ startX: number; days: number; moved: boolean } | null>(null);
  const [previewDays, setPreviewDays] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = diffDays(from, item.start_date);
  const end = Math.max(start, diffDays(from, item.end_date ?? item.start_date));
  if (start > scale.days - 1 || end < 0) return null;
  const shift = item.kind === "activity" ? previewDays : 0;
  const left = Math.max(0, start + shift);
  const right = Math.min(scale.days - 1, end + shift);
  const width = Math.max(scale.px - 4, (right - left + 1) * scale.px - 4);
  const cls = item.kind === "next_action" ? "bg-rose-300 text-rose-950" : ACTIVITY_STYLE[item.status] ?? "bg-zinc-300 text-zinc-800";
  const extra = item.technicians.length > 0 ? `\nTécnicos: ${item.technicians.join(", ")}` : "";

  function begin(e: ReactPointerEvent<HTMLDivElement>) {
    if (item.kind !== "activity") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, days: 0, moved: false };
    setDragging(true);
  }

  function move(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    drag.days = Math.round((e.clientX - drag.startX) / scale.px);
    if (drag.days !== 0) drag.moved = true;
    setPreviewDays(drag.days);
  }

  function finish() {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setPreviewDays(0);
    setDragging(false);
    if (!drag.moved) return;
    onMove(
      addDaysIso(item.start_date, drag.days),
      item.end_date ? addDaysIso(item.end_date, drag.days) : null
    );
  }

  function cancel() {
    dragRef.current = null;
    setPreviewDays(0);
    setDragging(false);
  }

  return (
    <div
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={cancel}
      className={`absolute flex h-[22px] select-none items-center overflow-hidden rounded-md border border-white/70 px-2 text-[11px] font-medium shadow-sm ${cls} ${
        item.kind === "activity" ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
      }`}
      style={{ left: left * scale.px + 2, top, width, touchAction: item.kind === "activity" ? "none" : "auto" }}
      title={`${item.kind === "next_action" ? "Próxima acción" : "Actividad"}: ${item.label}\n${item.start_date} → ${item.end_date ?? item.start_date}${extra}`}
    >
      <span className="truncate">{width > 60 ? item.label : ""}</span>
    </div>
  );
}

function TicketRowMenu({
  ticket,
  rect,
  onClose,
  onStatus,
  onSchedule,
  onAssign,
}: {
  ticket: TicketRow;
  rect: DOMRect;
  onClose: () => void;
  onStatus: () => void;
  onSchedule: () => void;
  onAssign: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function dismiss() {
      onClose();
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [onClose]);

  const width = 220;
  const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
  const itemCls = "block w-full px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100";

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        role="menu"
        aria-label={`Acciones de ${ticket.code}`}
        style={{ top: rect.bottom + 4, left, width }}
        className="fixed z-50 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-xl"
      >
        <span className="absolute right-1.5 top-1"><UiMark id="N10" /></span>
        <p className="px-3 pb-1 pt-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{ticket.code}</p>
        <button role="menuitem" className={itemCls} onClick={() => { onStatus(); onClose(); }}>Cambiar estado</button>
        <button role="menuitem" className={itemCls} onClick={() => { onSchedule(); onClose(); }}>Programar actividad</button>
        <button role="menuitem" className={itemCls} onClick={() => { onAssign(); onClose(); }}>Asignar técnicos</button>
        <Link role="menuitem" href={`/tickets/${ticket.id}`} className={itemCls} onClick={onClose}>Abrir detalle</Link>
      </div>
    </>
  );
}

function TicketStatusModal({
  ticket,
  onClose,
  onSaved,
}: {
  ticket: TicketRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState(ticket.status);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (status === ticket.status) return;
    setSaving(true);
    setErr(null);
    try {
      await fetchJson(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      onSaved();
    } catch (error) {
      setErr(String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      mark="W43"
      open={true}
      onClose={onClose}
      title={`Cambiar estado · ${ticket.code}`}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={() => void save()} disabled={saving || status === ticket.status}>
            {saving ? "Guardando…" : "Guardar"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Estado">
          <Select
            value={status}
            onChange={setStatus}
            options={EDITABLE_TICKET_STATUSES.map((value) => ({ value, label: ticketStatusLabel(value) }))}
          />
        </Field>
        <p className="text-[11px] text-zinc-400">El estado Cerrado se establece desde el cierre del ticket en V6.</p>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}

function ScheduleTicketModal({
  ticket,
  technicians,
  onClose,
  onSaved,
}: {
  ticket: TicketRow;
  technicians: { id: string; display_name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState(ticket.title);
  const [hours, setHours] = useState("8");
  const [technicianIds, setTechnicianIds] = useState<string[]>(ticket.assignments.map((a) => a.technician_id));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleTechnician(id: string) {
    setTechnicianIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function save() {
    if (!date) return setErr("Selecciona una fecha");
    if (!description.trim()) return setErr("La descripción es obligatoria");
    if (endDate && endDate < date) return setErr("La fecha final no puede ser anterior al inicio");
    if (technicianIds.length === 0) return setErr("Selecciona al menos un técnico");
    setSaving(true);
    setErr(null);
    try {
      await fetchJson("/api/ticket-gantt/schedule", {
        method: "POST",
        body: JSON.stringify({
          ticket_id: ticket.id,
          date,
          end_date: endDate || null,
          description: description.trim(),
          planned_hours: Number(hours) || 0,
          technician_ids: technicianIds,
        }),
      });
      onSaved();
    } catch (error) {
      setErr(String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      mark="W42"
      open={true}
      onClose={onClose}
      title={`Programar · ${ticket.code}`}
      wide
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={() => void save()} disabled={saving}>
            {saving ? "Programando…" : "Programar"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Descripción">
          <TextInput value={description} onChange={setDescription} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Fecha de inicio">
            <TextInput type="date" value={date} onChange={setDate} />
          </Field>
          <Field label="Fecha de fin (opcional)">
            <TextInput type="date" value={endDate} onChange={setEndDate} />
          </Field>
          <Field label="Horas planeadas">
            <TextInput type="number" value={hours} onChange={setHours} />
          </Field>
        </div>
        <Field label="Técnicos">
          <div className="grid max-h-52 gap-2 overflow-y-auto rounded-md border border-zinc-200 p-3 sm:grid-cols-2">
            {technicians.map((technician) => (
              <label key={technician.id} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={technicianIds.includes(technician.id)}
                  onChange={() => toggleTechnician(technician.id)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                {technician.display_name}
              </label>
            ))}
          </div>
        </Field>
        <p className="text-[11px] text-zinc-400">Los técnicos seleccionados también quedarán asignados al ticket. Tickets nuevos pasan a Programado.</p>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}

function AssignmentModal({
  ticket,
  technicians,
  onClose,
  onChanged,
}: {
  ticket: TicketRow;
  technicians: { id: string; display_name: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [technicianId, setTechnicianId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const assignedIds = new Set(ticket.assignments.map((assignment) => assignment.technician_id));

  async function assign() {
    if (!technicianId) return;
    setSaving(true);
    setErr(null);
    try {
      await fetchJson("/api/assignments", {
        method: "POST",
        body: JSON.stringify({ ticket_id: ticket.id, technician_id: technicianId }),
      });
      setTechnicianId("");
      onChanged();
    } catch (error) {
      setErr(String(error));
    } finally {
      setSaving(false);
    }
  }

  async function unassign(id: string) {
    setSaving(true);
    setErr(null);
    try {
      await fetchJson(`/api/assignments/${id}`, { method: "DELETE" });
      onChanged();
    } catch (error) {
      setErr(String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      mark="W40"
      open={true}
      onClose={onClose}
      title={`Asignar técnicos · ${ticket.code}`}
      footer={<SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>}
    >
      <div className="space-y-4">
        <Field label="Técnico">
          <div className="flex gap-2">
            <Select
              value={technicianId}
              onChange={setTechnicianId}
              placeholder="Seleccionar técnico…"
              options={technicians
                .filter((technician) => !assignedIds.has(technician.id))
                .map((technician) => ({ value: technician.id, label: technician.display_name }))}
            />
            <PrimaryButton onClick={() => void assign()} disabled={saving || !technicianId}>Asignar</PrimaryButton>
          </div>
        </Field>
        <div>
          <p className="text-xs font-medium text-zinc-600">Asignados actualmente</p>
          {ticket.assignments.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-400">Sin técnicos asignados.</p>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-100 rounded-md border border-zinc-200">
              {ticket.assignments.map((assignment) => (
                <li key={assignment.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-sm text-zinc-700">{assignment.technician_name}</span>
                  <button
                    type="button"
                    onClick={() => void unassign(assignment.id)}
                    disabled={saving}
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-3 rounded-sm ${cls}`} />{label}</span>;
}
