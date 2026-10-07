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
  SearchableSelect,
  Spinner,
  StatusBadge,
  TextInput,
} from "@/app/components/ui";
import { projectStatusLabel } from "@/app/lib/format";
import { ColumnSelector } from "@/app/components/column-selector";
import type { CatalogItem, CatalogsResponse, Client, ClientsResponse, Location, LocationsResponse, Project, ProjectsResponse } from "@/app/lib/types";

const PROJECT_COLUMNS = [
  { key: "codigo", label: "Código" },
  { key: "nombre", label: "Nombre" },
  { key: "cliente", label: "Cliente" },
  { key: "estado", label: "Estado" },
  { key: "salud", label: "Salud" },
  { key: "inicio", label: "Inicio plan." },
  { key: "actividad", label: "Última actividad" },
  { key: "pantallas", label: "Pantallas" },
  { key: "m2", label: "m² totales" },
] as const;
const DEFAULT_PROJECT_COLS: Record<string, boolean> = Object.fromEntries(
  PROJECT_COLUMNS.map((c) => [c.key, true])
);

const EDITABLE_PROJECT_STATUSES = [
  "new",
  "planning",
  "waiting_authorization",
  "waiting_materials",
  "assembly",
  "ready_install",
  "installation",
  "pending_docs",
  "closed",
  "cancelled",
] as const;

interface ProjectStatusSetting {
  status: string;
  label: string;
  color: string;
  sort_order: number;
}

export default function ProjectsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [cols, setCols] = useState<Record<string, boolean>>(DEFAULT_PROJECT_COLS);

  const toggleCol = (key: string) => setCols((prev) => ({ ...prev, [key]: !prev[key] }));

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (search.trim()) params.set("q", search.trim());
  const query = params.toString();
  const { data, error, reload } = useResource<ProjectsResponse>(`/api/projects${query ? `?${query}` : ""}`);
  const statusSettingsResource = useResource<{ project_statuses: ProjectStatusSetting[] }>("/api/catalogs/project-statuses");

  const projects = data?.projects ?? [];
  const statusSettings = statusSettingsResource.data?.project_statuses ?? [];
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
        <div className="ml-auto">
          <ColumnSelector columns={PROJECT_COLUMNS} visible={cols} onToggle={toggleCol} />
        </div>
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
                  {cols.codigo && <th className="px-4 py-3 text-left">Código</th>}
                  {cols.nombre && <th className="px-4 py-3 text-left">Nombre</th>}
                  {cols.cliente && <th className="px-4 py-3 text-left">Cliente</th>}
                  {cols.estado && <th className="px-4 py-3 text-left">Estado</th>}
                  {cols.salud && <th className="px-4 py-3 text-left">Salud</th>}
                  {cols.inicio && <th className="px-4 py-3 text-left">Inicio plan.</th>}
                  {cols.actividad && <th className="px-4 py-3 text-left">Última actividad</th>}
                  {cols.pantallas && <th className="px-4 py-3 text-right">Pantallas</th>}
                  {cols.m2 && <th className="px-4 py-3 text-right">m² totales</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {projects.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50">
                    {cols.codigo && (
                      <td className="px-4 py-3">
                        <Link href={`/proyectos/${p.id}`} className="font-semibold text-sky-700 hover:underline">
                          {p.code}
                        </Link>
                      </td>
                    )}
                    {cols.nombre && <td className="px-4 py-3 font-medium text-zinc-800">{p.name}</td>}
                    {cols.cliente && <td className="px-4 py-3 text-zinc-600">{p.client_name ?? "—"}</td>}
                    {cols.estado && (
                      <td className="px-4 py-3">
                        <StatusCell
                          status={p.status}
                          projectId={p.id}
                          settings={statusSettings}
                          onChange={reload}
                        />
                      </td>
                    )}
                    {cols.salud && (
                      <td className="px-4 py-3">
                        <StatusBadge status={p.health_status} kind="health" />
                      </td>
                    )}
                    {cols.inicio && <td className="px-4 py-3 text-zinc-500">{formatDate(p.planned_start_date)}</td>}
                    {cols.actividad && <td className="px-4 py-3 text-zinc-500">{formatDate(p.last_activity_at)}</td>}
                    {cols.pantallas && <td className="px-4 py-3 text-right">{p.screen_count > 0 ? p.screen_count.toLocaleString("es-MX") : "—"}</td>}
                    {cols.m2 && <td className="px-4 py-3 text-right">{p.screen_m2_total > 0 ? `${p.screen_m2_total.toLocaleString("es-MX", { maximumFractionDigits: 2 })} m²` : "—"}</td>}
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
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [priorityId, setPriorityId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clientDraft, setClientDraft] = useState<{
    name: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
  } | null>(null);
  const [clientSaving, setClientSaving] = useState(false);
  const [clientErr, setClientErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchJson<ClientsResponse>("/api/clients"),
      fetchJson<CatalogsResponse>("/api/catalogs"),
      fetchJson<LocationsResponse>("/api/locations"),
    ])
      .then(([c, cat, loc]) => {
        if (cancelled) return;
        setClients(c.clients);
        setPriorities(cat.priorities);
        setLocations(loc.locations.filter((location) => location.active));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function createClient() {
    if (!clientDraft?.name.trim()) return;
    setClientSaving(true);
    setClientErr(null);
    try {
      const { client } = await fetchJson<{ client: Client }>("/api/clients", {
        method: "POST",
        body: JSON.stringify({
          name: clientDraft.name.trim(),
          contact_name: clientDraft.contactName.trim() || null,
          contact_email: clientDraft.contactEmail.trim() || null,
          contact_phone: clientDraft.contactPhone.trim() || null,
          active: true,
        }),
      });
      setClients((prev) => [...prev, client].sort((a, b) => a.name.localeCompare(b.name, "es")));
      setClientId(client.id);
      setClientDraft(null);
    } catch (e) {
      setClientErr(String(e));
    } finally {
      setClientSaving(false);
    }
  }

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const { project } = await fetchJson<{ project: Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          client_id: clientId || undefined,
          location_id: locationId || undefined,
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
    <Modal mark="W34" open={true} onClose={onClose} title="Nuevo proyecto"
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
            <SearchableSelect
              mark="N9"
              value={clientId}
              onChange={(value) => {
                setClientId(value);
                setClientDraft(null);
                if (locationId && value && locations.find((location) => location.id === locationId)?.client_id !== value) {
                  setLocationId("");
                }
              }}
              placeholder="Buscar cliente…"
              clearLabel="— Sin cliente —"
              topN={5}
              options={clients
                .filter((client) => client.active)
                .map((client) => ({
                  value: client.id,
                  label: client.name,
                  frequency: Number(client.activity_count) || 0,
                }))}
              onCreate={(query) => {
                setClientErr(null);
                setClientDraft({ name: query, contactName: "", contactEmail: "", contactPhone: "" });
              }}
            />
          </Field>
          <Field label="Sucursal / ubicación">
            <Select
              value={locationId}
              onChange={setLocationId}
              placeholder="Selecciona una sucursal…"
              options={locations
                .filter((location) => !clientId || location.client_id === clientId)
                .map((location) => ({
                  value: location.id,
                  label: `${location.name}${location.city ? ` · ${location.city}` : ""}`,
                }))}
            />
          </Field>
          <Field label="Prioridad">
            <Select value={priorityId} onChange={setPriorityId} placeholder="— Sin prioridad —" options={priorities.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
        </div>
        {clientDraft && (
          <div className="rounded-md border border-sky-200 bg-sky-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Agregar cliente</p>
              <button type="button" onClick={() => setClientDraft(null)} className="text-xs text-zinc-500 hover:text-zinc-800">Cancelar</button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Nombre del cliente">
                <TextInput value={clientDraft.name} onChange={(value) => setClientDraft({ ...clientDraft, name: value })} />
              </Field>
              <Field label="Nombre de contacto (opcional)">
                <TextInput value={clientDraft.contactName} onChange={(value) => setClientDraft({ ...clientDraft, contactName: value })} />
              </Field>
              <Field label="Teléfono (opcional)">
                <TextInput value={clientDraft.contactPhone} onChange={(value) => setClientDraft({ ...clientDraft, contactPhone: value })} />
              </Field>
              <Field label="Correo (opcional)">
                <TextInput type="email" value={clientDraft.contactEmail} onChange={(value) => setClientDraft({ ...clientDraft, contactEmail: value })} />
              </Field>
            </div>
            {clientErr && <p className="mt-2 text-xs text-red-600">{clientErr}</p>}
            <div className="mt-3 flex justify-end">
              <SecondaryButton onClick={() => void createClient()} disabled={clientSaving || !clientDraft.name.trim()}>
                {clientSaving ? "Creando…" : "Crear y seleccionar"}
              </SecondaryButton>
            </div>
          </div>
        )}
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

function StatusCell({
  status,
  projectId,
  settings,
  onChange,
}: {
  status: string;
  projectId: string;
  settings: ProjectStatusSetting[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState(status);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const currentSetting = settings.find((setting) => setting.status === status);
  const displayLabel = currentSetting?.label ?? projectStatusLabel(status);
  const displayColor = currentSetting?.color ?? "#71717A";

  async function submit() {
    if (newStatus === status) return;
    if (newStatus === "cancelled" && !window.confirm("¿Cancelar este proyecto? Dejará de aparecer en la lista activa.")) return;
    setSaving(true);
    setErr(null);
    try {
      if (newStatus === "closed") {
        await fetchJson(`/api/projects/${projectId}`, {
          method: "PATCH",
          body: JSON.stringify({ close_project: true }),
        });
      } else if (newStatus === "cancelled") {
        await fetchJson(`/api/projects/${projectId}`, { method: "DELETE" });
      } else {
        await fetchJson(`/api/projects/${projectId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus }),
        });
      }
      setOpen(false);
      onChange();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (status === "closed") return;
          setNewStatus(status);
          setOpen(true);
        }}
        disabled={status === "closed"}
        title={status === "closed" ? "El proyecto está cerrado" : "Cambiar estado"}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border"
        style={{
          backgroundColor: `${displayColor}18`,
          color: displayColor,
          borderColor: displayColor,
        }}
      >
        {displayLabel}
        {status !== "closed" && <span className="ml-1">▼</span>}
      </button>

      {open && (
        <Modal
          mark="W41"
          open={true}
          onClose={() => setOpen(false)}
          title="Cambiar estado del proyecto"
          footer={
            <>
              <SecondaryButton onClick={() => setOpen(false)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={() => void submit()} disabled={saving || newStatus === status}>
                {saving ? "Guardando…" : "Guardar"}
              </PrimaryButton>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="Estado">
              <Select
                value={newStatus}
                onChange={setNewStatus}
                options={EDITABLE_PROJECT_STATUSES.map((value) => ({
                  value,
                  label: settings.find((setting) => setting.status === value)?.label ?? projectStatusLabel(value),
                }))}
              />
            </Field>
            <p className="text-[11px] text-zinc-400">
              Cerrado valida el checklist de cierre de V4. Cancelado retira el proyecto de la lista activa.
            </p>
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
