"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { formatRelative, ticketStatusLabel } from "@/app/lib/format";
import {
  EmptyState,
  Field,
  Modal,
  PrimaryButton,
  SecondaryButton,
  Select,
  Spinner,
  StatusBadge,
  TextInput,
  Textarea,
} from "@/app/components/ui";
import type { CatalogItem, CatalogsResponse, Client, ClientsResponse, Ticket, TicketsResponse } from "@/app/lib/types";

const STATUS_OPTIONS = [
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
  "cancelled",
];

export default function TicketsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (typeFilter) params.set("type", typeFilter);
  if (search.trim()) params.set("q", search.trim());
  const query = params.toString();
  const { data, error, reload } = useResource<TicketsResponse>(`/api/tickets${query ? `?${query}` : ""}`);

  const tickets = data?.tickets ?? [];
  const loading = !data && !error;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Tickets</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Solicitudes de servicio y soporte técnico.
          </p>
        </div>
        <PrimaryButton onClick={() => setOpen(true)}>Nuevo ticket</PrimaryButton>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-96">
            <TextInput value={search} onChange={setSearch} placeholder="Buscar por título, código o cliente…" />
          </div>
          <div className="w-56">
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="Todos los estados"
              options={STATUS_OPTIONS.map((s) => ({ value: s, label: ticketStatusLabel(s) }))}
            />
          </div>
        </div>
        <div className="w-48">
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            placeholder="Todos los tipos"
            options={[
              { value: "external", label: "Externo (cliente)" },
              { value: "internal", label: "Interno" },
            ]}
          />
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <Spinner />
        ) : tickets.length === 0 ? (
          <EmptyState title="No se encontraron tickets" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">Código</th>
                  <th className="px-4 py-3 text-left">Título</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Prioridad</th>
                  <th className="px-4 py-3 text-left">Coordinador</th>
                  <th className="px-4 py-3 text-left">Abierto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <Link href={`/tickets/${t.id}`} className="font-semibold text-sky-700 hover:underline">
                        {t.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-800">{t.title}</td>
                    <td className="px-4 py-3 text-zinc-600">{t.client_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={t.status} kind="ticket" />
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{t.priority_name ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-600">{t.coordinator_name ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-500" title={t.opened_at}>{formatRelative(t.opened_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && <NewTicketModal onClose={() => setOpen(false)} onSaved={reload} />}
    </div>
  );
}

function NewTicketModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [priorities, setPriorities] = useState<CatalogItem[]>([]);
  const [channels, setChannels] = useState<CatalogItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ticketType, setTicketType] = useState<"external" | "internal">("external");
  const [clientId, setClientId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [reportedBy, setReportedBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
        setChannels(cat.ticket_channels);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (ticketType !== "internal") return;
    const rgb = clients.find((client) => client.name.trim().toLowerCase() === "rgb");
    if (rgb) {
      // Sincroniza el cliente fijo de los tickets internos después de cargar el catálogo.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClientId(rgb.id);
    }
  }, [clients, ticketType]);

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const { ticket } = await fetchJson<{ ticket: Ticket }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          ticket_type: ticketType,
          client_id: clientId || undefined,
          priority_id: priorityId || undefined,
          channel_id: channelId || undefined,
          reported_by: reportedBy || undefined,
        }),
      });
      onSaved();
      router.push(`/tickets/${ticket.id}`);
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Nuevo ticket"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Creando…" : "Crear ticket"}</PrimaryButton>
        </>
      }
      wide
    >
      <div className="space-y-4">
        <Field label="Título del ticket">
          <TextInput value={title} onChange={setTitle} placeholder="Resumen breve del problema" />
        </Field>
        <Field label="Descripción">
          <Textarea value={description} onChange={setDescription} rows={3} placeholder="Detalles del ticket" />
        </Field>
        <Field label="Tipo de ticket">
          <Select
            value={ticketType}
            onChange={(value) => setTicketType(value as "external" | "internal")}
            options={[
              { value: "external", label: "Externo (cliente)" },
              { value: "internal", label: "Interno (RGB)" },
            ]}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente">
            {ticketType === "internal" ? (
              <TextInput value="RGB" onChange={() => {}} disabled />
            ) : (
              <Select value={clientId} onChange={setClientId} placeholder="Seleccionar cliente…" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
            )}
          </Field>
          <Field label="Prioridad">
            <Select value={priorityId} onChange={setPriorityId} placeholder="— Sin prioridad —" options={priorities.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Canal de reporte">
            <Select value={channelId} onChange={setChannelId} placeholder="— Sin canal —" options={channels.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Reportado por">
            <TextInput value={reportedBy} onChange={setReportedBy} placeholder="Nombre del reportante" />
          </Field>
        </div>
        <p className="text-[11px] text-zinc-400">El estado inicial será <strong>Nuevo</strong>. El código de ticket se genera automáticamente.</p>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}
