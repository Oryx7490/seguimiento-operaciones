"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
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

type ProjectColumnKey =
  | "code"
  | "name"
  | "client"
  | "status"
  | "health"
  | "planned_start"
  | "last_activity"
  | "planned_end"
  | "actual_start"
  | "actual_end"
  | "priority"
  | "coordinator"
  | "location"
  | "city"
  | "next_action"
  | "next_action_date"
  | "phase_count"
  | "screen_count"
  | "screen_m2_total"
  | "created_at"
  | "updated_at";

type ProjectColumn = {
  key: ProjectColumnKey;
  label: string;
  render: (project: Project) => ReactNode;
};

const PROJECT_COLUMNS: ProjectColumn[] = [
  {
    key: "code",
    label: "Código",
    render: (p) => (
      <Link href={`/proyectos/${p.id}`} className="font-semibold text-sky-700 hover:underline">
        {p.code}
      </Link>
    ),
  },
  { key: "name", label: "Nombre", render: (p) => <span className="font-medium text-zinc-800">{p.name}</span> },
  { key: "client", label: "Cliente", render: (p) => p.client_name ?? "—" },
  { key: "status", label: "Estado", render: (p) => <StatusBadge status={p.status} kind="project" /> },
  { key: "health", label: "Salud", render: (p) => <StatusBadge status={p.health_status} kind="health" /> },
  { key: "planned_start", label: "Inicio plan.", render: (p) => formatDate(p.planned_start_date) },
  { key: "last_activity", label: "Última actividad", render: (p) => formatDate(p.last_activity_at) },
  { key: "planned_end", label: "Fin plan.", render: (p) => formatDate(p.planned_end_date) },
  { key: "actual_start", label: "Inicio real", render: (p) => formatDate(p.actual_start_date) },
  { key: "actual_end", label: "Fin real", render: (p) => formatDate(p.actual_end_date) },
  { key: "priority", label: "Prioridad", render: (p) => p.priority_name ?? "—" },
  { key: "coordinator", label: "Coordinador", render: (p) => p.coordinator_name ?? "—" },
  { key: "location", label: "Ubicación", render: (p) => p.location_name ?? "—" },
  { key: "city", label: "Ciudad", render: (p) => p.city ?? "—" },
  { key: "next_action", label: "Próxima acción", render: (p) => p.next_action ?? "—" },
  { key: "next_action_date", label: "Fecha próxima acción", render: (p) => formatDate(p.next_action_date) },
  { key: "phase_count", label: "Fases", render: (p) => p.phase_count ?? "—" },
  { key: "screen_count", label: "Pantallas", render: (p) => p.screen_count > 0 ? p.screen_count.toLocaleString("es-MX") : "—" },
  { key: "screen_m2_total", label: "m² totales", render: (p) => p.screen_m2_total > 0 ? `${p.screen_m2_total.toLocaleString("es-MX", { maximumFractionDigits: 2 })} m²` : "—" },
  { key: "created_at", label: "Creado", render: (p) => formatDate(p.created_at) },
  { key: "updated_at", label: "Actualizado", render: (p) => formatDate(p.updated_at) },
];

const DEFAULT_PROJECT_COLUMNS: ProjectColumnKey[] = [
  "code",
  "name",
  "client",
  "status",
  "health",
  "planned_start",
  "last_activity",
];

const PROJECT_COLUMNS_STORAGE_KEY = "seguimiento-operaciones:project-columns";

function projectColumnSortValue(project: Project, key: ProjectColumnKey): string | number | null {
  switch (key) {
    case "code": return project.code;
    case "name": return project.name;
    case "client": return project.client_name;
    case "status": return project.status;
    case "health": return project.health_status;
    case "planned_start": return project.planned_start_date;
    case "last_activity": return project.last_activity_at;
    case "planned_end": return project.planned_end_date;
    case "actual_start": return project.actual_start_date;
    case "actual_end": return project.actual_end_date;
    case "priority": return project.priority_name;
    case "coordinator": return project.coordinator_name;
    case "location": return project.location_name;
    case "city": return project.city;
    case "next_action": return project.next_action;
    case "next_action_date": return project.next_action_date;
    case "phase_count": return project.phase_count ? Number(project.phase_count) : null;
    case "screen_count": return project.screen_count;
    case "screen_m2_total": return project.screen_m2_total;
    case "created_at": return project.created_at;
    case "updated_at": return project.updated_at;
  }
}

export default function ProjectsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<ProjectColumnKey[]>(DEFAULT_PROJECT_COLUMNS);
  const [draftColumns, setDraftColumns] = useState<ProjectColumnKey[]>(DEFAULT_PROJECT_COLUMNS);
  const [sortColumn, setSortColumn] = useState<ProjectColumnKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PROJECT_COLUMNS_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter((key): key is ProjectColumnKey =>
        PROJECT_COLUMNS.some((column) => column.key === key),
      );
      // La preferencia se hidrata después del render inicial para evitar diferencias SSR/cliente.
      if (valid.length > 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedColumns(valid);
      }
    } catch {
      // Si la preferencia está dañada, se mantienen las columnas predeterminadas.
    }
  }, []);

  function toggleColumn(key: ProjectColumnKey) {
    setDraftColumns((current) => {
      if (current.includes(key)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== key);
      }
      return [...current, key];
    });
  }

  function saveColumns() {
    setSelectedColumns(draftColumns);
    window.localStorage.setItem(PROJECT_COLUMNS_STORAGE_KEY, JSON.stringify(draftColumns));
    setColumnsOpen(false);
  }

  function openColumns() {
    setDraftColumns(selectedColumns);
    setColumnsOpen((current) => !current);
  }

  const visibleColumns = PROJECT_COLUMNS.filter((column) => selectedColumns.includes(column.key));

  function sortByColumn(key: ProjectColumnKey) {
    if (sortColumn === key) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(key);
      setSortDirection("asc");
    }
  }

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (search.trim()) params.set("q", search.trim());
  const query = params.toString();
  const { data, error, reload } = useResource<ProjectsResponse>(`/api/projects${query ? `?${query}` : ""}`);

  const projects = data?.projects ?? [];
  const loading = !data && !error;

  const sortedProjects = [...projects].sort((a, b) => {
    if (!sortColumn) return 0;
    const aValue = projectColumnSortValue(a, sortColumn);
    const bValue = projectColumnSortValue(b, sortColumn);
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    const comparison = typeof aValue === "number" && typeof bValue === "number"
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue), "es", { sensitivity: "base", numeric: true });
    return sortDirection === "asc" ? comparison : -comparison;
  });

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Proyectos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Proyectos de instalación, servicio y mantenimiento con fases y seguimiento.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <SecondaryButton onClick={openColumns}>
              Configurar columnas
            </SecondaryButton>
            {columnsOpen && (
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-zinc-200 bg-white p-4 shadow-lg">
                <p className="text-sm font-semibold text-zinc-900">Columnas visibles</p>
                <p className="mt-1 text-xs text-zinc-500">La selección se guarda en este navegador.</p>
                <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                  {PROJECT_COLUMNS.map((column) => (
                    <label key={column.key} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                      <input
                        type="checkbox"
                        checked={draftColumns.includes(column.key)}
                        onChange={() => toggleColumn(column.key)}
                        disabled={draftColumns.length === 1 && draftColumns.includes(column.key)}
                        className="rounded border-zinc-300"
                      />
                      {column.label}
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t border-zinc-100 pt-3">
                  <SecondaryButton onClick={() => { setDraftColumns(selectedColumns); setColumnsOpen(false); }}>Cancelar</SecondaryButton>
                  <PrimaryButton onClick={saveColumns}>Aplicar</PrimaryButton>
                </div>
              </div>
            )}
          </div>
          <PrimaryButton onClick={() => setOpen(true)}>Nuevo proyecto</PrimaryButton>
        </div>
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
                  {visibleColumns.map((column) => (
                    <th
                      key={column.key}
                      className="px-4 py-3 text-left"
                      aria-sort={sortColumn === column.key ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <button
                        type="button"
                        onClick={() => sortByColumn(column.key)}
                        className="inline-flex items-center gap-1 font-semibold hover:text-zinc-900"
                        aria-label={`Ordenar por ${column.label}`}
                      >
                        {column.label}
                        <span className={sortColumn === column.key ? "text-sky-600" : "text-zinc-300"} aria-hidden="true">
                          {sortColumn === column.key ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {sortedProjects.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50">
                    {visibleColumns.map((column) => (
                      <td key={column.key} className="px-4 py-3 text-zinc-600">{column.render(p)}</td>
                    ))}
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
