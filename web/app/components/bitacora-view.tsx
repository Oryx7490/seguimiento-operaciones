"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchJson } from "@/app/lib/client";
import { formatDateTime } from "@/app/lib/format";
import { EmptyState, Spinner } from "@/app/components/ui";

interface LogEntry {
  id: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  action: string;
  summary: string;
  details: Record<string, unknown> | null;
  actor_id: string | null;
  actor_name: string | null;
  project_id: string | null;
  ticket_id: string | null;
  created_at: string;
}

interface LogResponse {
  entries: LogEntry[];
  total: number;
  limit: number;
  offset: number;
  filters: {
    actions: { value: string; total: number }[];
    actors: { id: string; name: string }[];
  };
}

const ENTITY_LABEL: Record<string, string> = {
  project: "Proyecto",
  ticket: "Ticket",
  activity: "Actividad",
  client: "Cliente",
  assignment: "Asignación",
  comment: "Comentario",
  attachment: "Archivo",
  inventory: "Inventario",
  planning: "Planeación",
  user: "Usuario",
  technician: "Técnico",
  screen: "Pantalla",
  controller: "Controlador",
  time_entry: "Horas",
};

const ACTION_LABEL: Record<string, string> = {
  create: "Crear",
  update: "Actualizar",
  status_change: "Cambio de estado",
  schedule: "Programar",
  assign: "Asignar",
  unassign: "Quitar asignación",
  comment: "Comentario",
  upload: "Subir archivo",
  delete: "Eliminar",
  restore: "Restaurar",
  close: "Cerrar",
  reopen: "Reabrir",
  login: "Ingreso",
};

const ACTION_TONE: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-700",
  update: "bg-zinc-100 text-zinc-700",
  status_change: "bg-sky-100 text-sky-700",
  schedule: "bg-indigo-100 text-indigo-700",
  assign: "bg-violet-100 text-violet-700",
  unassign: "bg-zinc-100 text-zinc-600",
  comment: "bg-amber-100 text-amber-700",
  upload: "bg-cyan-100 text-cyan-700",
  delete: "bg-rose-100 text-rose-700",
  restore: "bg-teal-100 text-teal-700",
  close: "bg-zinc-200 text-zinc-700",
  reopen: "bg-orange-100 text-orange-700",
  login: "bg-slate-100 text-slate-600",
};

const EMPTY_FILTERS = { actions: [] as { value: string; total: number }[], actors: [] as { id: string; name: string }[] };

function entryHref(e: LogEntry): string | null {
  if (e.entity_type === "project" && e.entity_id) return `/proyectos/${e.entity_id}`;
  if (e.entity_type === "ticket" && e.entity_id) return `/tickets/${e.entity_id}`;
  if (e.entity_type === "activity") return "/agenda";
  return null;
}

function DetailList({ details }: { details: Record<string, unknown> | null }) {
  if (!details) return null;
  const entries = Object.entries(details).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-400">
      {entries.map(([k, v]) => (
        <li key={k}>
          <span className="text-zinc-300">{k}:</span> {typeof v === "object" ? JSON.stringify(v) : String(v)}
        </li>
      ))}
    </ul>
  );
}

export default function BitacoraView() {
  const [data, setData] = useState<LogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);

  const LIMIT = 50;

  async function load(nextOffset = offset) {
    setLoading(true);
    setErr(null);
    const qs = new URLSearchParams();
    if (actorId) qs.set("actor_id", actorId);
    if (action) qs.set("action", action);
    if (entityType) qs.set("entity_type", entityType);
    if (q.trim()) qs.set("q", q.trim());
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    qs.set("limit", String(LIMIT));
    qs.set("offset", String(nextOffset));
    try {
      setData(await fetchJson<LogResponse>(`/api/activity-log?${qs.toString()}`));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  function applyFilter(next: Partial<{ actorId: string; action: string; entityType: string; q: string; from: string; to: string }>) {
    if (next.actorId !== undefined) setActorId(next.actorId);
    if (next.action !== undefined) setAction(next.action);
    if (next.entityType !== undefined) setEntityType(next.entityType);
    if (next.q !== undefined) setQ(next.q);
    if (next.from !== undefined) setFrom(next.from);
    if (next.to !== undefined) setTo(next.to);
    setOffset(0);
    load(0);
  }

  function clearFilters() {
    setActorId("");
    setAction("");
    setEntityType("");
    setQ("");
    setFrom("");
    setTo("");
    setOffset(0);
    load(0);
  }

  const filters = data?.filters ?? EMPTY_FILTERS;
  const total = data?.total ?? 0;
  const entries = data?.entries ?? [];
  const activeFilterCount = [actorId, action, entityType, q, from, to].filter(Boolean).length;

  return (
    <div className="p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Bitácora</h1>
          <p className="text-xs text-zinc-500">
            {loading ? "Cargando movimientos…" : `${total} movimiento${total === 1 ? "" : "s"} registrado${total === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(offset)}
          disabled={loading}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </header>

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-white p-3">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Usuario
          <select
            value={actorId}
            onChange={(e) => applyFilter({ actorId: e.target.value })}
            className="mt-0.5 block w-40 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs font-normal normal-case text-zinc-700"
          >
            <option value="">Todos</option>
            {filters.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Acción
          <select
            value={action}
            onChange={(e) => applyFilter({ action: e.target.value })}
            className="mt-0.5 block w-36 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs font-normal normal-case text-zinc-700"
          >
            <option value="">Todas</option>
            {filters.actions.map((a) => (
              <option key={a.value} value={a.value}>
                {ACTION_LABEL[a.value] ?? a.value} ({a.total})
              </option>
            ))}
          </select>
        </label>

        <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Módulo
          <select
            value={entityType}
            onChange={(e) => applyFilter({ entityType: e.target.value })}
            className="mt-0.5 block w-36 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs font-normal normal-case text-zinc-700"
          >
            <option value="">Todos</option>
            {Object.entries(ENTITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Buscar
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilter({ q });
            }}
            placeholder="Resumen o entidad"
            className="mt-0.5 block w-44 rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-normal normal-case text-zinc-700 placeholder:text-zinc-300"
          />
        </label>

        <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Desde
          <input
            type="date"
            value={from}
            onChange={(e) => applyFilter({ from: e.target.value })}
            className="mt-0.5 block rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-normal normal-case text-zinc-700"
          />
        </label>

        <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Hasta
          <input
            type="date"
            value={to}
            onChange={(e) => applyFilter({ to: e.target.value })}
            className="mt-0.5 block rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-normal normal-case text-zinc-700"
          />
        </label>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100"
          >
            Limpiar ({activeFilterCount})
          </button>
        )}
      </div>

      {err && <p className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p>}

      {loading && !data ? (
        <div className="py-10 text-center text-sm text-zinc-400">
          <Spinner />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState title="Sin movimientos">No hay acciones que coincidan con los filtros seleccionados.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-semibold">Cuándo</th>
                <th className="px-3 py-2 font-semibold">Usuario</th>
                <th className="px-3 py-2 font-semibold">Acción</th>
                <th className="px-3 py-2 font-semibold">Módulo</th>
                <th className="px-3 py-2 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {entries.map((e) => {
                const href = entryHref(e);
                return (
                  <tr key={e.id} className="align-top hover:bg-zinc-50">
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{formatDateTime(e.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="font-medium text-zinc-700">{e.actor_name ?? "Sistema"}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ACTION_TONE[e.action] ?? "bg-zinc-100 text-zinc-600"}`}>
                        {ACTION_LABEL[e.action] ?? e.action}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-500">
                      {ENTITY_LABEL[e.entity_type] ?? e.entity_type}
                    </td>
                    <td className="px-3 py-2">
                      {href ? (
                        <Link href={href} className="text-zinc-800 hover:underline">
                          {e.summary}
                        </Link>
                      ) : (
                        <span className="text-zinc-800">{e.summary}</span>
                      )}
                      {e.entity_label && <p className="text-[11px] text-zinc-400">{e.entity_label}</p>}
                      <DetailList details={e.details} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > LIMIT && (
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
          <span>
            Mostrando {offset + 1}–{Math.min(offset + LIMIT, total)} de {total}
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => {
                const next = Math.max(0, offset - LIMIT);
                setOffset(next);
                load(next);
              }}
              className="rounded-md border border-zinc-300 px-2.5 py-1 hover:bg-zinc-50 disabled:opacity-40"
            >
              Anteriores
            </button>
            <button
              type="button"
              disabled={offset + LIMIT >= total || loading}
              onClick={() => {
                const next = offset + LIMIT;
                setOffset(next);
                load(next);
              }}
              className="rounded-md border border-zinc-300 px-2.5 py-1 hover:bg-zinc-50 disabled:opacity-40"
            >
              Siguientes
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
