"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useResource, fetchJson } from "@/app/lib/client";
import {
  mondayOfWeek,
  weekDays,
  formatShortDate,
  isToday,
  WEEKDAY_SHORT,
} from "@/app/lib/prototype-data";
import {
  Field,
  Modal,
  PrimaryButton,
  SecondaryButton,
  Select,
  Spinner,
  Textarea,
  TextInput,
} from "@/app/components/ui";
import type {
  Activity,
  ActivitiesResponse,
  CatalogItem,
  CatalogsResponse,
  Client,
  ClientsResponse,
  Technician,
  Ticket,
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

function activityCode(a: Activity): string {
  if (a.kind === "project") return a.projects[0]?.project_code ?? "";
  if (a.kind === "ticket") return a.ticket_code ?? "";
  return a.internal_activity_type_name ?? "Interna";
}

export default function TechnicianView({
  initialTechId,
  technicians,
}: {
  initialTechId: string;
  technicians: Technician[];
}) {
  const [monday, setMonday] = useState(() => mondayOfWeek(new Date()));
  const [techId, setTechId] = useState(initialTechId);
  const [selected, setSelected] = useState<Activity | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const days = weekDays(monday);
  const effectiveTechId = techId || technicians[0]?.id || "";

  const params = new URLSearchParams();
  params.set("from", isoDate(days[0]));
  params.set("to", isoDate(days[6]));
  if (effectiveTechId) params.set("technician", effectiveTechId);
  const activitiesPath = `/api/activities?${params.toString()}`;

  const act = useResource<ActivitiesResponse>(activitiesPath);
  const activities = act.data?.activities ?? [];

  const plannedTotal = activities.reduce((s, a) => s + a.planned_hours, 0);
  const workedTotal = activities.reduce((s, a) => s + Number(a.worked_hours), 0);

  const currentTech = technicians.find((x) => x.id === effectiveTechId);
  const selectedFresh = selected ? activities.find((a) => a.id === selected.id) ?? selected : null;

  function shift(delta: number) {
    const next = new Date(monday);
    next.setDate(next.getDate() + delta * 7);
    setMonday(next);
  }

  function changeTech(id: string) {
    setTechId(id);
    history.replaceState(null, "", id ? `/tecnico?t=${id}` : "/tecnico");
  }

  const weekLabel = `Semana del ${formatShortDate(days[0])} – ${formatShortDate(days[6])}`;

  return (
    <div className="mx-auto min-h-screen w-full max-w-xl bg-zinc-100 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 pb-3 pt-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold leading-tight">Mi agenda</h1>
            <p className="text-xs text-zinc-500">{currentTech?.display_name ?? "Técnico"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/tecnico/perfil?t=${effectiveTechId}`}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
            >
              Mi perfil
            </Link>
            <Link
              href="/"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
            >
              Vista de operaciones →
            </Link>
          </div>
        </div>

        <div className="mt-2">
          <Select
            value={effectiveTechId}
            onChange={changeTech}
            options={technicians.map((x) => ({ value: x.id, label: x.display_name }))}
          />
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <button
            onClick={() => shift(-1)}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
            aria-label="Semana anterior"
          >
            ←
          </button>
          <button
            onClick={() => setMonday(mondayOfWeek(new Date()))}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Hoy
          </button>
          <button
            onClick={() => shift(1)}
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
            aria-label="Semana siguiente"
          >
            →
          </button>
          <span className="ml-auto text-xs text-zinc-500">{weekLabel}</span>
        </div>

        <div className="mt-2 flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
          <div>
            <p className="text-[11px] text-zinc-500">Horas plan</p>
            <p className="text-sm font-semibold text-zinc-800">{plannedTotal} h</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-zinc-500">Horas trabajadas</p>
            <p className="text-sm font-semibold text-emerald-700">{workedTotal} h</p>
          </div>
        </div>

        <button
          onClick={() => setReportOpen(true)}
          className="mt-2 w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          + Reportar ticket
        </button>
      </header>

      <main className="px-4 py-4">
        {act.error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{act.error}</div>
        )}

        {!act.data && !act.error ? (
          <Spinner />
        ) : (
          <div className="space-y-4">
            {days.map((d, i) => {
              const iso = isoDate(d);
              const dayActs = activities.filter((a) => a.date <= iso && iso <= (a.end_date && a.end_date > a.date ? a.end_date : a.date));
              const today = isToday(d);
              return (
                <section key={i}>
                  <div className="mb-1.5 flex items-center gap-2 px-1">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        today ? "bg-sky-600 text-white" : "bg-white text-zinc-700"
                      }`}
                    >
                      {WEEKDAY_SHORT[i]}
                    </span>
                    <span className={`text-xs ${today ? "font-medium text-sky-700" : "text-zinc-500"}`}>
                      {formatShortDate(d)}
                    </span>
                    {dayActs.length > 0 && (
                      <span className="ml-auto rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                        {dayActs.length} actividad{dayActs.length === 1 ? "" : "es"}
                      </span>
                    )}
                  </div>
                  {dayActs.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-3 text-center text-xs text-zinc-400">
                      Sin actividades
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dayActs.map((a) => (
                        <ActivityCard key={a.id} activity={a} onClick={() => setSelected(a)} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>

      {selectedFresh && (
        <ActivitySheet
          activity={selectedFresh}
          technicianId={effectiveTechId}
          onClose={() => setSelected(null)}
          onSaved={() => act.reload()}
        />
      )}

      {reportOpen && (
        <ReportTicketModal
          technicianName={currentTech?.display_name ?? "Técnico"}
          onClose={() => setReportOpen(false)}
          onCreated={() => act.reload()}
        />
      )}
    </div>
  );
}

function ReportTicketModal({
  technicianName,
  onClose,
  onCreated,
}: {
  technicianName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [priorities, setPriorities] = useState<CatalogItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<Ticket | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchJson<ClientsResponse>("/api/clients"),
      fetchJson<CatalogsResponse>("/api/catalogs"),
    ])
      .then(([c, cat]) => {
        if (cancelled) return;
        setClients(c.clients);
        setPriorities(cat.priorities);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function uploadPhoto(ticketId: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("ticket_id", ticketId);
    form.append("attachment_type", "photo");
    const res = await fetch("/api/attachments", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        typeof data === "object" && data !== null && "error" in data
          ? String((data as { error: unknown }).error)
          : res.statusText;
      throw new Error(msg || `HTTP ${res.status}`);
    }
  }

  async function submit() {
    if (!title.trim() || !description.trim()) {
      setErr("Título y descripción son obligatorios.");
      return;
    }
    if (!clientId) {
      setErr("Selecciona el cliente.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const { ticket } = await fetchJson<{ ticket: Ticket }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          ticket_type: "external",
          client_id: clientId,
          priority_id: priorityId || undefined,
          reported_by: technicianName,
        }),
      });
      if (photo) await uploadPhoto(ticket.id, photo);
      setCreated(ticket);
      onCreated();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <Modal
        open={true}
        onClose={onClose}
        title="Ticket reportado"
        footer={<PrimaryButton onClick={onClose}>Cerrar</PrimaryButton>}
      >
        <p className="text-sm text-zinc-700">
          Se creó el ticket <span className="font-semibold">{created.code}</span>
          {photo ? " con su evidencia adjunta." : "."}
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Reportar ticket"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving}>
            {saving ? "Enviando…" : "Crear ticket"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Título">
          <TextInput value={title} onChange={setTitle} placeholder="Resumen breve del problema" />
        </Field>
        <Field label="Descripción">
          <Textarea value={description} onChange={setDescription} rows={3} placeholder="¿Qué ocurrió y dónde?" />
        </Field>
        <Field label="Cliente">
          <Select
            value={clientId}
            onChange={setClientId}
            placeholder="Seleccionar cliente…"
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Field>
        <Field label="Prioridad">
          <Select
            value={priorityId}
            onChange={setPriorityId}
            placeholder="— Sin prioridad —"
            options={priorities.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
        <Field label="Foto de evidencia (opcional)">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700"
          />
        </Field>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}

function ActivityCard({ activity, onClick }: { activity: Activity; onClick: () => void }) {
  const meta = STATUS_META[activity.status];
  const kind = KIND_META[activity.kind];
  const code = activityCode(activity);
  const endIso = activity.end_date && activity.end_date > activity.date ? activity.end_date : activity.date;
  const overdue =
    endIso < isoDate(new Date()) && (activity.status === "planned" || activity.status === "in_progress");
  const hours =
    activity.worked_hours > 0
      ? `${activity.worked_hours} h reg · ${activity.planned_hours} h plan`
      : `${activity.planned_hours} h plan`;

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left shadow-sm transition active:scale-[0.99] ${meta.card} ${
        overdue ? "ring-1 ring-rose-400" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`truncate rounded px-1.5 py-0.5 text-[11px] font-semibold ${kind.chip}`}>
            {code || kind.label}
          </span>
          <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} title={meta.label} />
          {overdue && (
            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">Vencido</span>
          )}
        </div>
        <p className="mt-1.5 text-[15px] font-semibold leading-snug text-zinc-900">{activity.description}</p>
        <p className="mt-0.5 truncate text-xs text-zinc-500">
          {activity.client_name ?? "—"} · {hours}
        </p>
      </div>
      <svg
        className="h-5 w-5 shrink-0 text-zinc-300"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 3l5 5-5 5" />
      </svg>
    </button>
  );
}

function ActivitySheet({
  activity,
  technicianId,
  onClose,
  onSaved,
}: {
  activity: Activity;
  technicianId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<string>(activity.status);
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const kind = KIND_META[activity.kind];
  const statusMeta = STATUS_META[activity.status];
  const code = activityCode(activity);

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
      setSaving(false);
    }
  }

  async function saveHours() {
    const h = Number(hours);
    if (!technicianId || isNaN(h) || h <= 0) {
      setErr("Indica las horas trabajadas");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await fetchJson("/api/time-entries", {
        method: "POST",
        body: JSON.stringify({
          activity_id: activity.id,
          technician_id: technicianId,
          date: activity.date,
          duration_hours: h,
          notes: notes || undefined,
        }),
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
    <Modal
      open={true}
      onClose={onClose}
      title={activity.description}
      footer={
        activity.status !== "cancelled" ? (
          <>
            <SecondaryButton onClick={cancel} disabled={saving} className="text-red-600">
              Cancelar actividad
            </SecondaryButton>
            <PrimaryButton onClick={saveStatus} disabled={saving || status === activity.status}>
              Guardar estado
            </PrimaryButton>
          </>
        ) : (
          <SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>
        )
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
          <DetailPair label="Técnicos" value={activity.technicians.map((x) => x.technician_name).join(", ")} />
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
            <Field label="Horas">
              <TextInput value={hours} onChange={setHours} type="number" placeholder="3.5" />
            </Field>
          </div>
          <Field label="Notas (opcional)">
            <TextInput value={notes} onChange={setNotes} placeholder="Avance, observaciones…" />
          </Field>
          <SecondaryButton onClick={saveHours} disabled={saving}>
            Registrar horas
          </SecondaryButton>
        </div>

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