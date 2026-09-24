"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchJson, useResource } from "@/app/lib/client";
import { Badge, Spinner } from "@/app/components/ui";

/* ── Tipos ───────────────────────────────────────── */
interface PendingProject {
  id: string; code: string; name: string; status: string;
  client_name: string | null; requested_by_name: string | null;
  deletion_requested_at: string; deletion_reason: string | null;
}
interface PendingTicket {
  id: string; code: string; title: string; status: string; ticket_type: string;
  client_name: string | null; requested_by_name: string | null;
  deletion_requested_at: string; deletion_reason: string | null;
}
interface ClosedProject {
  id: string; code: string; name: string;
  client_name: string | null; coordinator_name: string | null;
  actual_end_date: string | null; planned_end_date: string | null;
  updated_at: string; prev_status: string | null;
}
interface ClosedTicket {
  id: string; code: string; title: string; ticket_type: string;
  client_name: string | null; coordinator_name: string | null;
  closed_at: string | null; updated_at: string;
  prev_status: string | null;
}

/* ── Tab component ───────────────────────────────── */
type Tab = "eliminar" | "proyectos" | "tickets" | "tickets-eliminar";

function TabBtn({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
        active
          ? "border-zinc-900 text-zinc-900"
          : "border-transparent text-zinc-500 hover:text-zinc-700"
      }`}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          active ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-700"
        }`}>{count}</span>
      )}
    </button>
  );
}

/* ── Página principal ────────────────────────────── */
export default function ArchivoPage() {
  const [tab, setTab] = useState<Tab>("eliminar");

  const pendingRes  = useResource<{ projects: PendingProject[] }>("/api/admin/projects/pending-deletion");
  const pendingTkRes = useResource<{ tickets: PendingTicket[] }>("/api/admin/tickets/pending-deletion");
  const closedPrRes = useResource<{ projects: ClosedProject[] }>("/api/admin/projects/closed");
  const closedTkRes = useResource<{ tickets: ClosedTicket[] }>("/api/admin/tickets/closed");

  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg]   = useState<{ text: string; error?: boolean } | null>(null);

  /* ── Acciones ── */
  async function permanentDelete(p: PendingProject) {
    if (!confirm(`¿Eliminar definitivamente "${p.code} — ${p.name}"?\nEsta acción no se puede deshacer.`)) return;
    setBusy(p.id); setMsg(null);
    try {
      await fetchJson(`/api/admin/projects/${p.id}/delete`, { method: "POST" });
      setMsg({ text: `Proyecto ${p.code} eliminado definitivamente.` });
      pendingRes.reload();
    } catch (e) { setMsg({ text: String(e), error: true }); }
    finally { setBusy(null); }
  }

  async function rejectDeletion(p: PendingProject) {
    if (!confirm(`¿Rechazar la solicitud de "${p.code}"? El proyecto se conservará.`)) return;
    setBusy(p.id); setMsg(null);
    try {
      await fetchJson(`/api/admin/projects/${p.id}/delete`, { method: "DELETE" });
      setMsg({ text: `Solicitud de ${p.code} rechazada. El proyecto se conserva.` });
      pendingRes.reload();
    } catch (e) { setMsg({ text: String(e), error: true }); }
    finally { setBusy(null); }
  }

  async function restoreProject(p: ClosedProject) {
    if (!confirm(`¿Restaurar "${p.code} — ${p.name}"? Volverá al estado anterior al cierre.`)) return;
    setBusy(p.id); setMsg(null);
    try {
      const r = await fetchJson<{ status: string }>(`/api/admin/projects/${p.id}/restore`, { method: "POST" });
      setMsg({ text: `Proyecto ${p.code} restaurado a estado "${r.status}".` });
      closedPrRes.reload();
    } catch (e) { setMsg({ text: String(e), error: true }); }
    finally { setBusy(null); }
  }

  async function reopenTicket(t: ClosedTicket) {
    if (!confirm(`¿Reabrir el ticket "${t.code}"? Volverá al estado anterior al cierre.`)) return;
    setBusy(t.id); setMsg(null);
    try {
      const r = await fetchJson<{ status: string }>(`/api/admin/tickets/${t.id}/reopen`, { method: "POST" });
      setMsg({ text: `Ticket ${t.code} reabierto a estado "${r.status}".` });
      closedTkRes.reload();
    } catch (e) { setMsg({ text: String(e), error: true }); }
    finally { setBusy(null); }
  }

  async function permanentDeleteTicket(p: PendingTicket) {
    if (!confirm(`¿Eliminar definitivamente el ticket "${p.code}"?\nEsta acción no se puede deshacer.`)) return;
    setBusy(p.id); setMsg(null);
    try {
      await fetchJson(`/api/admin/tickets/${p.id}/delete`, { method: "POST" });
      setMsg({ text: `Ticket ${p.code} eliminado definitivamente.` });
      pendingTkRes.reload();
    } catch (e) { setMsg({ text: String(e), error: true }); }
    finally { setBusy(null); }
  }

  async function rejectTicketDeletion(p: PendingTicket) {
    if (!confirm(`¿Rechazar la solicitud de "${p.code}"? El ticket se conservará.`)) return;
    setBusy(p.id); setMsg(null);
    try {
      await fetchJson(`/api/admin/tickets/${p.id}/delete`, { method: "DELETE" });
      setMsg({ text: `Solicitud de ${p.code} rechazada. El ticket se conserva.` });
      pendingTkRes.reload();
    } catch (e) { setMsg({ text: String(e), error: true }); }
    finally { setBusy(null); }
  }

  const pendingCount = pendingRes.data?.projects.length ?? 0;
  const pendingTkCount = pendingTkRes.data?.tickets.length ?? 0;
  const closedPrCount = closedPrRes.data?.projects.length ?? 0;
  const closedTkCount = closedTkRes.data?.tickets.length ?? 0;

  return (
    <div className="p-6">
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-zinc-900">Archivo</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Revisión administrativa de proyectos y tickets cerrados o marcados para eliminar.
        </p>
      </div>

      {/* Mensaje de resultado */}
      {msg && (
        <div className={`mt-4 rounded-md border px-3 py-2 text-sm ${
          msg.error
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}>
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="mt-4 flex border-b border-zinc-200">
        <TabBtn active={tab === "eliminar"} onClick={() => setTab("eliminar")} count={pendingCount}>
          🗑 Solicitudes de eliminación
        </TabBtn>
        <TabBtn active={tab === "proyectos"} onClick={() => setTab("proyectos")} count={closedPrCount}>
          📁 Proyectos cerrados
        </TabBtn>
        <TabBtn active={tab === "tickets"} onClick={() => setTab("tickets")} count={closedTkCount}>
          🎫 Tickets cerrados
        </TabBtn>
        <TabBtn active={tab === "tickets-eliminar"} onClick={() => setTab("tickets-eliminar")} count={pendingTkCount}>
          🗑 Tickets a eliminar
        </TabBtn>
      </div>

      {/* ── Tab: Solicitudes de eliminación ── */}
      {tab === "eliminar" && (
        <div className="mt-4">
          {!pendingRes.data && !pendingRes.error ? <Spinner /> :
           pendingCount === 0 ? (
            <Empty texto="No hay solicitudes de eliminación pendientes." />
          ) : (
            <Table headers={["Proyecto", "Cliente", "Estado actual", "Solicitado por", "Fecha", "Motivo", "Acciones"]}>
              {pendingRes.data!.projects.map(p => (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <ProjLink id={p.id} code={p.code} name={p.name} />
                  </td>
                  <td className="px-3 py-3 text-zinc-600">{p.client_name ?? "—"}</td>
                  <td className="px-3 py-3"><Badge className="bg-zinc-100 text-zinc-600">{p.status}</Badge></td>
                  <td className="px-3 py-3 text-zinc-600">{p.requested_by_name ?? "—"}</td>
                  <td className="px-3 py-3 text-xs text-zinc-500">{p.deletion_requested_at.slice(0, 10)}</td>
                  <td className="px-3 py-3 text-xs text-zinc-600 max-w-xs truncate" title={p.deletion_reason ?? ""}>{p.deletion_reason ?? "—"}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Btn onClick={() => rejectDeletion(p)} disabled={busy === p.id} tone="neutral">Rechazar</Btn>
                      <Btn onClick={() => permanentDelete(p)} disabled={busy === p.id} tone="danger">
                        {busy === p.id ? "…" : "Eliminar definitivamente"}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {/* ── Tab: Tickets a eliminar ── */}
      {tab === "tickets-eliminar" && (
        <div className="mt-4">
          {!pendingTkRes.data && !pendingTkRes.error ? <Spinner /> :
           pendingTkCount === 0 ? (
            <Empty texto="No hay solicitudes de eliminación de tickets pendientes." />
          ) : (
            <Table headers={["Ticket", "Cliente", "Estado actual", "Solicitado por", "Fecha", "Motivo", "Acciones"]}>
              {pendingTkRes.data!.tickets.map(p => (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link href={`/tickets/${p.id}`} className="hover:underline">
                      <span className="font-mono text-xs text-sky-700">{p.code}</span>
                      <span className="ml-1 text-zinc-800 font-medium">{p.title}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-zinc-600">{p.client_name ?? "—"}</td>
                  <td className="px-3 py-3"><Badge className="bg-zinc-100 text-zinc-600">{p.status}</Badge></td>
                  <td className="px-3 py-3 text-zinc-600">{p.requested_by_name ?? "—"}</td>
                  <td className="px-3 py-3 text-xs text-zinc-500">{p.deletion_requested_at.slice(0, 10)}</td>
                  <td className="px-3 py-3 text-xs text-zinc-600 max-w-xs truncate" title={p.deletion_reason ?? ""}>{p.deletion_reason ?? "—"}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Btn onClick={() => rejectTicketDeletion(p)} disabled={busy === p.id} tone="neutral">Rechazar</Btn>
                      <Btn onClick={() => permanentDeleteTicket(p)} disabled={busy === p.id} tone="danger">
                        {busy === p.id ? "…" : "Eliminar definitivamente"}
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {/* ── Tab: Proyectos cerrados ── */}
      {tab === "proyectos" && (
        <div className="mt-4">
          {!closedPrRes.data && !closedPrRes.error ? <Spinner /> :
           closedPrCount === 0 ? (
            <Empty texto="No hay proyectos cerrados." />
          ) : (
            <Table headers={["Proyecto", "Cliente", "Coordinador", "Cerrado el", "Estado anterior", "Acciones"]}>
              {closedPrRes.data!.projects.map(p => (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3"><ProjLink id={p.id} code={p.code} name={p.name} /></td>
                  <td className="px-3 py-3 text-zinc-600">{p.client_name ?? "—"}</td>
                  <td className="px-3 py-3 text-zinc-600">{p.coordinator_name ?? "—"}</td>
                  <td className="px-3 py-3 text-xs text-zinc-500">
                    {(p.actual_end_date ?? p.updated_at ?? "").slice(0, 10)}
                  </td>
                  <td className="px-3 py-3">
                    {p.prev_status
                      ? <Badge className="bg-zinc-100 text-zinc-600">{p.prev_status}</Badge>
                      : <span className="text-zinc-400 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Btn onClick={() => restoreProject(p)} disabled={busy === p.id} tone="safe">
                      {busy === p.id ? "…" : "Restaurar proyecto"}
                    </Btn>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {/* ── Tab: Tickets cerrados ── */}
      {tab === "tickets" && (
        <div className="mt-4">
          {!closedTkRes.data && !closedTkRes.error ? <Spinner /> :
           closedTkCount === 0 ? (
            <Empty texto="No hay tickets cerrados." />
          ) : (
            <Table headers={["Ticket", "Cliente", "Coordinador", "Tipo", "Cerrado el", "Estado anterior", "Acciones"]}>
              {closedTkRes.data!.tickets.map(t => (
                <tr key={t.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <Link href={`/tickets/${t.id}`} className="hover:underline">
                      <span className="font-mono text-xs text-sky-700">{t.code}</span>
                      <span className="ml-1 text-zinc-800 font-medium">{t.title}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-zinc-600">{t.client_name ?? "—"}</td>
                  <td className="px-3 py-3 text-zinc-600">{t.coordinator_name ?? "—"}</td>
                  <td className="px-3 py-3">
                    <Badge className={t.ticket_type === "external" ? "bg-sky-100 text-sky-700" : "bg-zinc-100 text-zinc-600"}>
                      {t.ticket_type === "external" ? "Externo" : "Interno"}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-xs text-zinc-500">
                    {(t.closed_at ?? t.updated_at ?? "").slice(0, 10)}
                  </td>
                  <td className="px-3 py-3">
                    {t.prev_status
                      ? <Badge className="bg-zinc-100 text-zinc-600">{t.prev_status}</Badge>
                      : <span className="text-zinc-400 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Btn onClick={() => reopenTicket(t)} disabled={busy === t.id} tone="safe">
                      {busy === t.id ? "…" : "Reabrir ticket"}
                    </Btn>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Helpers de UI ───────────────────────────────── */

function Empty({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-10 text-center text-zinc-500">
      {texto}
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            {headers.map(h => (
              <th key={h} className={`px-3 py-2 ${h === "Acciones" ? "text-right" : "text-left"} first:px-4`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">{children}</tbody>
      </table>
    </div>
  );
}

function ProjLink({ id, code, name }: { id: string; code: string; name: string }) {
  return (
    <Link href={`/proyectos/${id}`} className="hover:underline">
      <span className="font-mono text-xs text-sky-700">{code}</span>
      <span className="ml-1 font-medium text-zinc-800">{name}</span>
    </Link>
  );
}

function Btn({ onClick, disabled, tone, children }: {
  onClick: () => void; disabled?: boolean; tone: "neutral" | "danger" | "safe"; children: React.ReactNode;
}) {
  const cls = {
    neutral: "border-zinc-300 text-zinc-600 hover:bg-zinc-100",
    danger:  "border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
    safe:    "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  }[tone];
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded border px-2 py-1 text-xs ${cls} disabled:opacity-50`}>
      {children}
    </button>
  );
}