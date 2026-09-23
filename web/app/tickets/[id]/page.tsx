"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchJson, useResource } from "@/app/lib/client";
import { formatDateTime, ticketStatusLabel } from "@/app/lib/format";
import {
  Badge,
  Field,
  Modal,
  PrimaryButton,
  SecondaryButton,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
  TextInput,
} from "@/app/components/ui";
import TicketClosure from "@/app/components/ticket-closure";
import CommentSection from "@/app/components/comment-section";
import AttachmentsSection from "@/app/components/attachments-section";
import type { Client, ClientsResponse, Technician, TechniciansResponse, TicketDetail } from "@/app/lib/types";

const TICKET_STATUS_FLOW = [
  "new",
  "to_review",
  "unassigned",
  "scheduled",
  "in_progress",
  "waiting_client",
  "waiting_material",
  "waiting_access",
  "resolved_pending_validation",
  "closed",
];

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: detail, error, reload } = useResource<TicketDetail>(`/api/tickets/${id}`);

  if (!detail) return <div className="p-6">{error ? <p className="text-red-600">Error: {error}</p> : <Spinner />}</div>;
  const t = detail.ticket;

  return (
    <div className="max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-zinc-700">{t.code}</span>
          <h1 className="mt-2 break-words text-xl font-semibold text-zinc-900">{t.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
            {t.ticket_type === "external" ? (
              <>
                <span>{t.client_name ?? "Sin cliente"}</span>
                {t.location_name && <span>· {t.location_name}{t.city ? `, ${t.city}` : ""}</span>}
              </>
            ) : (
              <span>Ticket interno · {t.client_name ?? "RGB"}</span>
            )}
            {t.channel_name && <span>· Canal: {t.channel_name}</span>}
            {t.reported_by && <span>· Reportado por: {t.reported_by}</span>}
          </div>
        </div>
        <button onClick={() => router.back()} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
          ← Volver
        </button>
      </div>

      {t.description && (
        <div className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="whitespace-pre-wrap break-words text-sm text-zinc-600">{t.description}</p>
        </div>
      )}

      <div className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <p className="text-xs text-zinc-400">Estado</p>
          <StatusBadge status={t.status} kind="ticket" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-zinc-400">Prioridad</p>
          <p className="break-words text-sm font-medium text-zinc-800">{t.priority_name ?? "—"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-zinc-400">Coordinador</p>
          <p className="break-words text-sm font-medium text-zinc-800">{t.coordinator_name ?? "Sin asignar"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-zinc-400">Abierto</p>
          <p className="break-words text-sm font-medium text-zinc-800">{formatDateTime(t.opened_at)}</p>
        </div>
      </div>

      {t.waiting_reason && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <strong>Esperando:</strong> {t.waiting_reason}
        </div>
      )}

      {t.status !== "cancelled" && (
        <div className="flex flex-wrap gap-2">
          <TicketStatusChanger detail={detail} onSaved={reload} />
          <EditTicket detail={detail} onSaved={reload} />
        </div>
      )}

      {/* Assignments */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-800">Asignaciones</h2>
          <AddAssignment ticketId={id} onSaved={reload} />
        </div>
        {detail.assignments.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">Sin técnicos asignados.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {detail.assignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-zinc-800">
                  {a.technician_name}
                  <span className="ml-1 text-xs text-zinc-400">{a.role}</span>
                </span>
                <span className="text-xs text-zinc-400">{formatDateTime(a.assigned_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* History */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-800">Historial</h2>
        {detail.history.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">Sin cambios de estado.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {detail.history.map((h) => (
              <li key={h.id} className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-zinc-300" />
                <div>
                  <p className="text-sm text-zinc-800">
                    <span className="font-medium">{h.changed_by_name}</span>{" "}
                    cambió de <Badge className="bg-zinc-100 text-zinc-600">{h.from_status ?? "Inicio"}</Badge> a{" "}
                    <Badge className="bg-zinc-100 text-zinc-600">{h.to_status}</Badge>
                    {h.reason && <span className="ml-1 text-zinc-500">— {h.reason}</span>}
                  </p>
                  <p className="text-xs text-zinc-400">{formatDateTime(h.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Adjuntos */}
      <AttachmentsSection ticketId={id} initial={detail.attachments} onChanged={reload} />

      {/* Comments */}
      <CommentSection kind="ticket" entityId={id} comments={detail.comments} onSaved={reload} />

      {/* Cierre del ticket */}
      <TicketClosure
        ticketId={id}
        status={detail.ticket.status}
        ticketType={detail.ticket.ticket_type}
        closure={detail.closure}
        attachments={detail.attachments}
        onChanged={reload}
      />
    </div>
  );
}

/* ── Status changer ──────────────────────────────── */

function TicketStatusChanger({ detail, onSaved }: { detail: TicketDetail; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string>(detail.ticket.status);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const t = detail.ticket;

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      await fetchJson(`/api/tickets/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason: reason || undefined }),
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PrimaryButton onClick={() => setOpen(true)}>Cambiar estado</PrimaryButton>
      {open && (
        <Modal open={true} onClose={() => setOpen(false)} title="Cambiar estado"
          footer={
            <>
              <SecondaryButton onClick={() => setOpen(false)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Confirmar"}</PrimaryButton>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Nuevo estado">
              <Select
                value={status}
                onChange={setStatus}
                options={TICKET_STATUS_FLOW.map((s) => ({ value: s, label: ticketStatusLabel(s) }))}
              />
            </Field>
            <Field label="Motivo / notas (opcional)">
              <TextInput value={reason} onChange={setReason} placeholder="Motivo del cambio" />
            </Field>
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

/* ── Edit title & description ────────────────────── */

function EditTicket({ detail, onSaved }: { detail: TicketDetail; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(detail.ticket.title);
  const [description, setDescription] = useState(detail.ticket.description ?? "");
  const [clientId, setClientId] = useState(detail.ticket.client_id ?? "");
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const t = detail.ticket;

  useEffect(() => {
    let cancelled = false;
    fetchJson<ClientsResponse>("/api/clients")
      .then((c) => { if (!cancelled) setClients(c.clients); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function openModal() {
    setTitle(t.title);
    setDescription(t.description ?? "");
    setClientId(t.client_id ?? "");
    setErr(null);
    setOpen(true);
  }

  async function submit() {
    if (!title.trim()) {
      setErr("El título es obligatorio");
      return;
    }
    if (t.ticket_type === "external" && !clientId) {
      setErr("Un ticket externo requiere cliente");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const clientChanged = (clientId || null) !== t.client_id;
      await fetchJson(`/api/tickets/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          client_id: clientId || null,
          ...(clientChanged && t.location_id ? { location_id: null } : {}),
        }),
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SecondaryButton onClick={openModal}>Editar ticket</SecondaryButton>
      {open && (
        <Modal open={true} onClose={() => setOpen(false)} title={`Editar ticket ${t.code}`}
          footer={
            <>
              <SecondaryButton onClick={() => setOpen(false)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</PrimaryButton>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Título">
              <TextInput value={title} onChange={setTitle} placeholder="Título del ticket" />
            </Field>
            <Field label="Descripción (opcional)">
              <Textarea value={description} onChange={setDescription} rows={5} placeholder="Detalle del problema, síntomas, alcance…" />
            </Field>
            <Field label="Cliente">
              {t.ticket_type === "internal" ? (
                <TextInput value="RGB" onChange={() => {}} disabled />
              ) : (
                <Select
                  value={clientId}
                  onChange={setClientId}
                  options={clients.map((c) => ({ value: c.id, label: c.name }))}
                />
              )}
            </Field>
            {t.location_id && (clientId || null) !== t.client_id && (
              <p className="text-[11px] text-amber-600">Al cambiar de cliente se quitará la ubicación actual ({t.location_name ?? "sin nombre"}).</p>
            )}
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

/* ── Add assignment ──────────────────────────────── */

function AddAssignment({ ticketId, onSaved }: { ticketId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [techId, setTechId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchJson<TechniciansResponse>("/api/technicians")
        .then((d) => setTechs(d.technicians))
        .catch(() => {});
    }
  }, [open]);

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      await fetchJson("/api/assignments", {
        method: "POST",
        body: JSON.stringify({ ticket_id: ticketId, technician_id: techId }),
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SecondaryButton onClick={() => setOpen(true)} className="text-xs px-2 py-1">Asignar técnico</SecondaryButton>
      {open && (
        <Modal open={true} onClose={() => setOpen(false)} title="Asignar técnico"
          footer={
            <>
              <SecondaryButton onClick={() => setOpen(false)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={submit} disabled={saving || !techId}>{saving ? "Guardando…" : "Asignar"}</PrimaryButton>
            </>
          }
        >
          <Field label="Técnico">
            <Select
              value={techId}
              onChange={setTechId}
              placeholder="Seleccionar técnico…"
              options={techs.map((t) => ({ value: t.id, label: `${t.display_name} (${t.email ?? (t.username ? "@" + t.username : "sin correo")})` }))}
            />
          </Field>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </Modal>
      )}
    </>
  );
}
