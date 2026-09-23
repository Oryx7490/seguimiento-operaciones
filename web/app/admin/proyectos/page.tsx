"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchJson, useResource } from "@/app/lib/client";
import { Badge, Spinner } from "@/app/components/ui";

interface PendingProject {
  id: string;
  code: string;
  name: string;
  status: string;
  client_name: string | null;
  requested_by_name: string | null;
  deletion_requested_at: string;
  deletion_reason: string | null;
}

interface PendingResponse {
  projects: PendingProject[];
}

export default function AdminProyectosPage() {
  const { data, error, reload } = useResource<PendingResponse>(
    "/api/admin/projects/pending-deletion"
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function approve(p: PendingProject) {
    if (!confirm(`¿Eliminar definitivamente "${p.code} — ${p.name}"? Esta acción no se puede deshacer.`)) return;
    setBusy(p.id);
    setMsg(null);
    try {
      await fetchJson(`/api/admin/projects/${p.id}/delete`, { method: "POST" });
      setMsg(`Proyecto ${p.code} eliminado.`);
      reload();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function reject(p: PendingProject) {
    if (!confirm(`¿Rechazar la solicitud de eliminación de "${p.code}"?`)) return;
    setBusy(p.id);
    setMsg(null);
    try {
      await fetchJson(`/api/admin/projects/${p.id}/delete`, { method: "DELETE" });
      setMsg(`Solicitud de ${p.code} rechazada.`);
      reload();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(null);
    }
  }

  const count = data?.projects.length ?? 0;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Proyectos — Solicitudes de eliminación</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {count > 0
              ? `${count} proyecto${count !== 1 ? "s" : ""} pendiente${count !== 1 ? "s" : ""} de aprobación.`
              : "No hay solicitudes pendientes."}
          </p>
        </div>
      </div>

      {msg && (
        <div className="mt-4 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
          {msg}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6">
        {!data && !error ? (
          <Spinner />
        ) : count === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-10 text-center text-zinc-500">
            No hay proyectos con solicitudes de eliminación pendientes.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2 text-left">Proyecto</th>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-left">Solicitado por</th>
                  <th className="px-3 py-2 text-left">Fecha solicitud</th>
                  <th className="px-3 py-2 text-left">Motivo</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data!.projects.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <Link href={`/proyectos/${p.id}`} className="hover:underline">
                        <span className="font-mono text-xs text-sky-700">{p.code}</span>
                        <span className="ml-1 font-medium text-zinc-800">{p.name}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{p.client_name ?? "—"}</td>
                    <td className="px-3 py-3">
                      <Badge className="bg-zinc-100 text-zinc-600">{p.status}</Badge>
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{p.requested_by_name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-zinc-500">
                      {p.deletion_requested_at.slice(0, 10)}
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-600 max-w-xs truncate" title={p.deletion_reason ?? ""}>
                      {p.deletion_reason ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => reject(p)}
                          disabled={busy === p.id}
                          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                        >
                          Rechazar
                        </button>
                        <button
                          onClick={() => approve(p)}
                          disabled={busy === p.id}
                          className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                        >
                          {busy === p.id ? "…" : "Eliminar definitivamente"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}