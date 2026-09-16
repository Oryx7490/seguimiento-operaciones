"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useResource, fetchJson } from "@/app/lib/client";
import { mondayOfWeek, weekDays, formatShortDate, isToday, WEEKDAY_SHORT } from "@/app/lib/prototype-data";
import {
  Field,
  Modal,
  PrimaryButton,
  SecondaryButton,
  Select,
  Spinner,
  TextInput,
} from "@/app/components/ui";
import type {
  Activity,
  ActivitiesResponse,
  ClientsResponse,
  ProjectsResponse,
  TechniciansResponse,
  TicketsResponse,
} from "@/app/lib/types";

const KIND_META: Record<Activity["kind"], { label: string; chip: string }> = {
  project: { label: "Proyecto", chip: "bg-sky-100 text-sky-700" },
  ticket: { label: "Ticket", chip: "bg-violet-100 text-violet-700" },
  internal: { label: "Interna", chip: "bg-zinc-100 text-zinc-600" },
};

const STATUS_META: Record<Activity["status"], { label: string; card: string; dot: string }> = {
  planned: { label: "Planeada", card: "border-zinc-200 bg-white", dot: "bg-zinc-400" },
  in_progress: { label: "En proceso", card: "border-amber-300 bg-amber-50", dot: "bg-amber-500" },
  completed: { label: "Completada", card: "border-emerald-300 bg-emerald-50", dot: "bg-emerald-500" },
  cancelled: { label: "Cancelada", card: "border-zinc-200 bg-zinc-50 opacity-60", dot: "bg-zinc-300" },
};

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function WeekAgenda() {
  const [monday, setMonday] = useState(() => mondayOfWeek(new Date()));
  const [kind, setKind] = useState<string>("");
  const [techId, setTechId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [selected, setSelected] = useState<Activity | null>(null);
  const [creating, setCreating] = useState<{ date: string; techIds: string[] } | null>(null);

  const days = weekDays(monday);

  const params = new URLSearchParams();
  params.set("from", isoDate(days[0]));
  params.set("to", isoDate(days[6]));
  if (kind) params.set("kind", kind);
  if (techId) params.set("technician", techId);
  if (status) params.set("status", status);
  if (clientId) params.set("client", clientId);
  const activitiesPath = `/api/activities?${params.toString()}`;

  const act = useResource<ActivitiesResponse>(activitiesPath);
  const techs = useResource<TechniciansResponse>("/api/technicians");
  const clients = useResource<ClientsResponse>("/api/clients");
  const tickets = useResource<TicketsResponse>("/api/tickets");
  const projects = useResource<ProjectsResponse>("/api/projects");

  const activities = act.data?.activities ?? [];
  const technicians = (techs.data?.technicians ?? []).filter((t) => t.technician_active);
  const loading = !act.data && !act.error;

  function shift(delta: number) {
    const next = new Date(monday);
    next.setDate(next.getDate() + delta * 7);
    setMonday(next);
  }

  const overdueCount = activities.filter((a) => a.date < isoDate(new Date()) && (a.status === "planned" || a.status === "in_progress")).length;
  const unassignedTickets = (tickets.data?.tickets ?? []).filter((t) => ["new", "unassigned", "to_review"].includes(t.status)).length;
  const blockedProjects = (projects.data?.projects ?? []).filter((p) => p.health_status === "blocked").length;
  const plannedTotal = activities.reduce((s, a) => s + a.planned_hours, 0);
  const workedTotal = activities.reduce((s, a) => s + Number(a.worked_hours), 0);

  const weekLabel = `Semana del ${formatShortDate(days[0])} – ${formatShortDate(days[6])} de ${new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(days[0])}`;

  return (
    <div className="bg-zinc-100 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold leading-tight">Operaciones técnicas</h1>
            <p className="text-sm text-zinc-500">{weekLabel}</p>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/gantt" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
              Vista Gantt
            </Link>
          </nav>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => shift(-1)} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">← Semana anterior</button>
          <button onClick={() => setMonday(mondayOfWeek(new Date()))} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">Hoy</button>
          <button onClick={() => shift(1)} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">Semana siguiente →</button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-zinc-300 text-sm">
              {([["", "Todo"], ["project", "Proyectos"], ["ticket", "Tickets"], ["internal", "Internas"]] as const).map(([v, label]) => (
                <button key={v} onClick={() => setKind(v)} className={`px-3 py-1.5 ${kind === v ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}>
                  {label}
                </button>
              ))}
            </div>
            <Select
              value={techId}
              onChange={setTechId}
              placeholder="Todos los técnicos"
              options={technicians.map((t) => ({ value: t.id, label: t.display_name }))}
              className="w-44"
            />
            <Select
              value={status}
              onChange={setStatus}
              placeholder="Todos los estados"
              options={[
                { value: "planned", label: "Planeada" },
                { value: "in_progress", label: "En proceso" },
                { value: "completed", label: "Completada" },
                { value: "cancelled", label: "Cancelada" },
              ]}
              className="w-40"
            />
            <Select
              value={clientId}
              onChange={setClientId}
              placeholder="Todos los clientes"
              options={clients.data?.clients.map((c) => ({ value: c.id, label: c.name })) ?? []}
              className="w-44"
            />
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard cls="border-rose-200 bg-rose-50" textCls="text-rose-600" valueCls="text-rose-700" label="Actividades vencidas" value={overdueCount} />
          <StatCard cls="border-violet-200 bg-violet-50" textCls="text-violet-600" valueCls="text-violet-700" label="Tickets sin asignar" value={unassignedTickets} />
          <StatCard cls="border-amber-200 bg-amber-50" textCls="text-amber-600" valueCls="text-amber-700" label="Proyectos bloqueados" value={blockedProjects} />
          <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
            <p className="text-xs text-zinc-500">Horas plan / real</p>
            <p className="text-xl font-semibold text-zinc-800">{plannedTotal} / {workedTotal}</p>
          </div>
        </div>
      </header>

      <main className="p-4">
        {act.error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{act.error}</div>}

        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[150px_repeat(7,1fr)] border-b border-zinc-200 bg-zinc-50">
              <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Técnico</div>
              {days.map((d, i) => (
                <div key={i} className={`px-1 py-2 text-center ${isToday(d) ? "bg-sky-50" : ""}`}>
                  <p className={`text-xs font-semibold ${isToday(d) ? "text-sky-700" : "text-zinc-700"}`}>{WEEKDAY_SHORT[i]}</p>
                  <p className={`text-xs ${isToday(d) ? "text-sky-600" : "text-zinc-400"}`}>{formatShortDate(d)}</p>
                </div>
              ))}
            </div>

            {loading ? (
              <div className="p-8"><Spinner /></div>
            ) : technicians.length === 0 ? (
              <p className="p-6 text-sm text-zinc-400">No hay técnicos activos. Crea técnicos desde Configuración.</p>
            ) : (
              technicians.map((tech) => (
                <div key={tech.id} className="grid grid-cols-[150px_repeat(7,1fr)] border-b border-zinc-100 last:border-b-0">
                  <div className="flex items-center gap-2 border-r border-zinc-100 px-2 py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-white">
                      {initials(tech.display_name)}
                    </span>
                    <span className="truncate text-xs font-medium text-zinc-700">{tech.display_name}</span>
                  </div>
                  {days.map((d, i) => {
                    const iso = isoDate(d);
                    const cellActs = activities.filter((a) => a.date === iso && a.technicians.some((t) => t.technician_id === tech.id));
                    return (
                      <div key={i} className={`min-h-[96px] border-r border-zinc-100 p-1 last:border-r-0 ${isToday(d) ? "bg-sky-50/60" : ""}`}>
                        <div className="flex flex-col gap-1">
                          {cellActs.map((a) => (
                            <ActivityCard key={a.id} activity={a} onClick={() => setSelected(a)} />
                          ))}
                          <button
                            onClick={() => setCreating({ date: iso, techIds: [tech.id] })}
                            className="flex h-5 items-center justify-center rounded border border-dashed border-zinc-300 text-[11px] text-zinc-400 hover:border-zinc-400 hover:text-zinc-600"
                          >
                            + Actividad
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          Haz clic en una tarjeta para ver detalle, registrar horas o cancelarla. Cada técnico puede tener
          varias actividades al día y una actividad puede tener varios técnicos.
        </p>
      </main>

      {selected && (
        <ActivityDetailModal
          activity={selected}
          onClose={() => setSelected(null)}
          onSaved={() => act.reload()}
        />
      )}
      {creating && (
        <NewActivityModal
          date={creating.date}
          initialTechIds={creating.techIds}
          technicians={technicians}
          onClose={() => setCreating(null)}
          onSaved={() => act.reload()}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, cls, textCls, valueCls }: { label: string; value: number; cls: string; textCls: string; valueCls: string }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${cls}`}>
      <p className={`text-xs ${textCls}`}>{label}</p>
      <p className={`text-xl font-semibold ${valueCls}`}>{value}</p>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "").toUpperCase();
}

function ActivityCard({ activity, onClick }: { activity: Activity; onClick: () => void }) {
  const meta = STATUS_META[activity.status];
  const kind = KIND_META[activity.kind];
  const code = activity.kind === "project" ? activity.projects[0]?.project_code
    : activity.kind === "ticket" ? activity.ticket_code
    : activity.internal_activity_type_name?.slice(0, 10);
  const label = activity.kind === "project" ? activity.projects[0]?.project_name
    : activity.kind === "ticket" ? activity.ticket_title
    : activity.internal_activity_type_name;
  const hours = activity.worked_hours > 0
    ? `${activity.worked_hours}h / ${activity.planned_hours}h plan`
    : `${activity.planned_hours}h plan`;
  const overdue = activity.date < isoDate(new Date()) && (activity.status === "planned" || activity.status === "in_progress");

  return (
    <button onClick={onClick} className={`flex w-full flex-col gap-1 rounded-md border p-1.5 text-left shadow-sm transition hover:shadow ${meta.card} ${overdue ? "ring-1 ring-rose-400" : ""}`}>
      <div className="flex items-center justify-between gap-1">
        <span className={`max-w-[80%] truncate rounded px-1 text-[10px] font-semibold ${kind.chip}`}>{code}</span>
        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} title={meta.label} />
      </div>
      <p className="truncate text-[11px] font-medium leading-tight text-zinc-800">{label}</p>
      <p className="truncate text-[10px] text-zinc-500">{activity.client_name ?? "—"}</p>
      <div className="flex items-center justify-between text-[10px] text-zinc-600">
        <span>{hours}</span>
        {overdue && <span className="text-rose-600">Vencido</span>}
      </div>
    </button>
  );
}

function ActivityDetailModal({ activity, onClose, onSaved }: { activity: Activity; onClose: () => void; onSaved: () => void }) {
  const kind = KIND_META[activity.kind];
  const code = activity.kind === "project" ? activity.projects[0]?.project_code
    : activity.kind === "ticket" ? activity.ticket_code
    : activity.internal_activity_type_name;
  const [status, setStatus] = useState<string>(activity.status);
  const [hourTech, setHourTech] = useState<string>(activity.technicians[0]?.technician_id ?? "");
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const statusMeta = STATUS_META[activity.status];

  async function saveStatus() {
    if (status === activity.status) return;
    setSaving(true);
    setErr(null);
    try {
      await fetchJson(`/api/activities/${activity.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      onSaved();
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveHours() {
    const h = Number(hours);
    if (!hourTech || isNaN(h) || h <= 0) {
      setErr("Indica el técnico y las horas trabajadas");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await fetchJson("/api/time-entries", {
        method: "POST",
        body: JSON.stringify({ activity_id: activity.id, technician_id: hourTech, date: activity.date, duration_hours: h, notes: notes || undefined }),
      });
      setHours("");
      setNotes("");
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    if (!confirm("¿Cancelar esta actividad?")) return;
    setSaving(true);
    try {
      await fetchJson(`/api/activities/${activity.id}`, { method: "DELETE" });
      onSaved();
      onClose();
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title={activity.description}
      footer={
        activity.status !== "cancelled" ? (
          <>
            <SecondaryButton onClick={cancel} disabled={saving}>Cancelar actividad</SecondaryButton>
            <PrimaryButton onClick={saveStatus} disabled={saving || status === activity.status}>Guardar estado</PrimaryButton>
          </>
        ) : <SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${kind.chip}`}>{code}</span>
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} /> {statusMeta.label}
          </span>
          <span className="text-xs text-zinc-400">{activity.date}</span>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <DetailPair label="Cliente" value={activity.client_name ?? "—"} />
          <DetailPair label="Técnicos" value={activity.technicians.map((t) => t.technician_name).join(", ")} />
          <DetailPair label="Horas planeadas" value={`${activity.planned_hours} h`} />
          <DetailPair label="Horas trabajadas" value={`${activity.worked_hours} h`} />
        </dl>

        {activity.kind === "internal" && activity.internal_activity_type_name && (
          <p className="text-xs text-zinc-500">Tipo interno: {activity.internal_activity_type_name}</p>
        )}

        <div className="space-y-3 border-t border-zinc-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Estado</h3>
          <Select
            value={status}
            onChange={setStatus}
            options={[
              { value: "planned", label: "Planeada" },
              { value: "in_progress", label: "En proceso" },
              { value: "completed", label: "Completada" },
              { value: "cancelled", label: "Cancelada" },
            ]}
          />
        </div>

        <div className="space-y-3 border-t border-zinc-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Registrar horas trabajadas</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Técnico">
              <Select value={hourTech} onChange={setHourTech} options={activity.technicians.map((t) => ({ value: t.technician_id, label: t.technician_name }))} />
            </Field>
            <Field label="Horas">
              <TextInput value={hours} onChange={setHours} type="number" placeholder="3.5" />
            </Field>
          </div>
          <Field label="Notas (opcional)">
            <TextInput value={notes} onChange={setNotes} placeholder="Avance, observaciones…" />
          </Field>
          <SecondaryButton onClick={saveHours} disabled={saving}>Registrar horas</SecondaryButton>
        </div>

        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}

function NewActivityModal({ date, initialTechIds, technicians, onClose, onSaved }: {
  date: string;
  initialTechIds: string[];
  technicians: { id: string; display_name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<string>("project");
  const [projectId, setProjectId] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [internalTypeId, setInternalTypeId] = useState("");
  const [plannedHours, setPlannedHours] = useState("8");
  const [techIds, setTechIds] = useState<string[]>(initialTechIds);
  const [projects, setProjects] = useState<ProjectsResponse["projects"]>([]);
  const [tickets, setTickets] = useState<TicketsResponse["tickets"]>([]);
  const [internalTypes, setInternalTypes] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchJson<ProjectsResponse>("/api/projects"),
      fetchJson<TicketsResponse>("/api/tickets"),
      fetchJson<{ internal_activity_types: { id: string; name: string }[] }>("/api/catalogs"),
    ])
      .then(([p, t, c]) => {
        if (cancelled) return;
        setProjects(p.projects);
        setTickets(t.tickets);
        setInternalTypes(c.internal_activity_types);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleTech(id: string) {
    setTechIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    if (!description.trim()) {
      setErr("La descripción es obligatoria");
      return;
    }
    if (techIds.length === 0) {
      setErr("Selecciona al menos un técnico");
      return;
    }
    if (kind === "project" && !projectId) {
      setErr("Selecciona un proyecto");
      return;
    }
    if (kind === "ticket" && !ticketId) {
      setErr("Selecciona un ticket");
      return;
    }
    if (kind === "internal" && !internalTypeId) {
      setErr("Selecciona el tipo interno");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await fetchJson("/api/activities", {
        method: "POST",
        body: JSON.stringify({
          date,
          description,
          planned_hours: Number(plannedHours) || 0,
          project_ids: kind === "project" ? [projectId] : [],
          ticket_id: kind === "ticket" ? ticketId : undefined,
          internal_activity_type_id: kind === "internal" ? internalTypeId : undefined,
          technician_ids: techIds,
        }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Nueva actividad" wide
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Creando…" : "Crear actividad"}</PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          Fecha: <strong className="text-zinc-800">{date}</strong>
        </p>
        <Field label="Descripción de la actividad">
          <TextInput value={description} onChange={setDescription} placeholder="P. ej. Instalación de gabinetes" />
        </Field>
        <Field label="Tipo">
          <Select value={kind} onChange={setKind} options={[
            { value: "project", label: "Proyecto" },
            { value: "ticket", label: "Ticket" },
            { value: "internal", label: "Interna" },
          ]} />
        </Field>
        {kind === "project" && (
          <Field label="Proyecto">
            <Select value={projectId} onChange={setProjectId} placeholder="Selecciona un proyecto…" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
          </Field>
        )}
        {kind === "ticket" && (
          <Field label="Ticket">
            <Select value={ticketId} onChange={setTicketId} placeholder="Selecciona un ticket…" options={tickets.filter((t) => t.status !== "cancelled").map((t) => ({ value: t.id, label: `${t.code} · ${t.title}` }))} />
          </Field>
        )}
        {kind === "internal" && (
          <Field label="Tipo interno">
            <Select value={internalTypeId} onChange={setInternalTypeId} placeholder="Selecciona el tipo…" options={internalTypes.map((i) => ({ value: i.id, label: i.name }))} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Horas planeadas">
            <TextInput value={plannedHours} onChange={setPlannedHours} type="number" />
          </Field>
        </div>
        <Field label="Técnicos (puedes elegir varios)">
          <div className="flex flex-wrap gap-1.5">
            {technicians.map((t) => {
              const on = techIds.includes(t.id);
              return (
                <button key={t.id} onClick={() => toggleTech(t.id)} className={`rounded-md border px-2 py-1 text-xs font-medium ${on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"}`}>
                  {t.display_name}
                </button>
              );
            })}
          </div>
        </Field>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}

function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="font-medium text-zinc-800">{value}</dd>
    </div>
  );
}