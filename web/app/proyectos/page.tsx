"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { formatDate } from "@/app/lib/format";
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
} from "@/app/components/ui";
import type { CatalogItem, CatalogsResponse, Client, ClientsResponse, Project, ProjectsResponse } from "@/app/lib/types";

export default function ProjectsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (search.trim()) params.set("q", search.trim());
  const query = params.toString();
  const { data, error, reload } = useResource<ProjectsResponse>(`/api/projects${query ? `?${query}` : ""}`);

  const projects = data?.projects ?? [];
  const loading = !data && !error;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Proyectos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Proyectos de instalación, servicio y mantenimiento con fases y seguimiento.
          </p>
        </div>
        <PrimaryButton onClick={() => setOpen(true)}>Nuevo proyecto</PrimaryButton>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <TextInput value={search} onChange={setSearch} placeholder="Buscar por nombre, código o cliente…" className="w-80" />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          placeholder="Todos los estados"
          options={[
            { value: "new", label: "Nuevo" },
            { value: "planning", label: "Planeación" },
            { value: "waiting_authorization", label: "Esperando autorización" },
            { value: "waiting_materials", label: "Esperando materiales" },
            { value: "assembly", label: "Armado" },
            { value: "ready_install", label: "Listo para instalar" },
            { value: "installation", label: "Instalación" },
            { value: "pending_docs", label: "Pendiente de documentos" },
            { value: "closed", label: "Cerrado" },
            { value: "cancelled", label: "Cancelado" },
          ]}
        />
      </div>

      <div className="mt-4">
        {loading ? (
          <Spinner />
        ) : projects.length === 0 ? (
          <EmptyState title="No se encontraron proyectos" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">Código</th>
                  <th className="px-4 py-3 text-left">Nombre</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Salud</th>
                  <th className="px-4 py-3 text-left">Inicio plan.</th>
                  <th className="px-4 py-3 text-left">Última actividad</th>
                  <th className="px-4 py-3 text-right">Pantallas</th>
                  <th className="px-4 py-3 text-right">m² totales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {projects.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <Link href={`/proyectos/${p.id}`} className="font-semibold text-sky-700 hover:underline">
                        {p.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-800">{p.name}</td>
                    <td className="px-4 py-3 text-zinc-600">{p.client_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} kind="project" />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.health_status} kind="health" />
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{formatDate(p.planned_start_date)}</td>
                    <td className="px-4 py-3 text-zinc-500">{formatDate(p.last_activity_at)}</td>
                    <td className="px-4 py-3 text-right">{p.screen_count > 0 ? p.screen_count.toLocaleString("es-MX") : "—"}</td>
                    <td className="px-4 py-3 text-right">{p.screen_m2_total > 0 ? `${p.screen_m2_total.toLocaleString("es-MX", { maximumFractionDigits: 2 })} m²` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && <NewProjectModal onClose={() => setOpen(false)} onSaved={reload} />}
    </div>
  );
}

function NewProjectModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [priorities, setPriorities] = useState<CatalogItem[]>([]);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
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
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const { project } = await fetchJson<{ project: Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          client_id: clientId || undefined,
          priority_id: priorityId || undefined,
          planned_start_date: startDate || undefined,
          planned_end_date: endDate || undefined,
        }),
      });
      onSaved();
      router.push(`/proyectos/${project.id}`);
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Nuevo proyecto"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Creando…" : "Crear proyecto"}</PrimaryButton>
        </>
      }
      wide
    >
      <div className="space-y-4">
        <Field label="Nombre del proyecto">
          <TextInput value={name} onChange={setName} placeholder="P. ej. Instalación LED Retail" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente">
            <Select value={clientId} onChange={setClientId} placeholder="— Sin cliente —" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Prioridad">
            <Select value={priorityId} onChange={setPriorityId} placeholder="— Sin prioridad —" options={priorities.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Inicio planificado">
            <TextInput value={startDate} onChange={setStartDate} type="date" />
          </Field>
          <Field label="Fin planificado">
            <TextInput value={endDate} onChange={setEndDate} type="date" />
          </Field>
        </div>
        <p className="text-[11px] text-zinc-400">
          Las fases se generan automáticamente del catálogo; podrás editarlas en el detalle del proyecto.
        </p>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}
