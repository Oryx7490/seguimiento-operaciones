"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchJson, useResource } from "@/app/lib/client";
import { formatDateTime } from "@/app/lib/format";
import { Badge, EmptyState, SecondaryButton, Spinner } from "@/app/components/ui";

interface Notification {
  id: string;
  title: string | null;
  body: string;
  template: string | null;
  entity_type: "project" | "ticket" | "activity" | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  unread: number;
}

const TEMPLATE_LABEL: Record<string, string> = {
  ticket_unassigned: "Ticket sin responsable",
  ticket_no_update: "Ticket sin actualización",
  project_blocked_no_next_action: "Proyecto bloqueado",
  activity_overdue: "Actividad vencida",
  installation_no_delivery_sheet: "Instalación sin hoja",
  ticket_resolved_unvalidated: "Resolución sin validar",
  next_action_overdue: "Próxima acción vencida",
  hours_over_planned: "Horas sobre planeadas",
};

const TEMPLATE_TONE: Record<string, string> = {
  ticket_unassigned: "bg-violet-100 text-violet-700",
  ticket_no_update: "bg-sky-100 text-sky-700",
  project_blocked_no_next_action: "bg-rose-100 text-rose-700",
  activity_overdue: "bg-amber-100 text-amber-700",
  installation_no_delivery_sheet: "bg-yellow-100 text-yellow-700",
  ticket_resolved_unvalidated: "bg-teal-100 text-teal-700",
  next_action_overdue: "bg-orange-100 text-orange-700",
  hours_over_planned: "bg-cyan-100 text-cyan-700",
};

function entityHref(n: Notification): string | null {
  if (!n.entity_id) return null;
  if (n.entity_type === "project") return `/proyectos/${n.entity_id}`;
  if (n.entity_type === "ticket") return `/tickets/${n.entity_id}`;
  return "/";
}

export default function NotificationsView() {
  const { data, error, reload } = useResource<NotificationsResponse>("/api/notifications");
  const [busy, setBusy] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  async function markRead(id: string) {
    await fetchJson(`/api/notifications/${id}`, { method: "PATCH" });
    reload();
  }

  async function markAll() {
    setBusy(true);
    try {
      await fetchJson("/api/notifications/read-all", { method: "POST" });
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    setBusy(true);
    setScanMsg(null);
    try {
      const r = await fetchJson<{ validated: number; removed: number }>("/api/notifications/validate", { method: "POST" });
      setScanMsg(`Validación completa: ${r.validated} revisadas, ${r.removed} obsoletas eliminadas.`);
      reload();
    } catch (e) {
      setScanMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function scan() {
    setBusy(true);
    setScanMsg(null);
    try {
      const r = await fetchJson<{ alerts: number }>("/api/notifications/scan", { method: "POST" });
      setScanMsg(
        r.alerts > 0 ? `Se generaron ${r.alerts} avisos nuevos.` : "Sin novedades por ahora."
      );
      reload();
    } catch (e) {
      setScanMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  const unread = data?.unread ?? 0;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Notificaciones</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Alertas internas de pendientes críticos: {unread > 0 ? `${unread} sin leer` : "todo al día"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={scan} disabled={busy}>
            {busy ? "…" : "Generar alertas ahora"}
          </SecondaryButton>
          <SecondaryButton onClick={validate} disabled={busy}>
            Validar notificaciones
          </SecondaryButton>
          <SecondaryButton onClick={markAll} disabled={busy || unread === 0}>
            Marcar todo como leído
          </SecondaryButton>
        </div>
      </div>

      {scanMsg && (
        <div className="mt-4 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
          {scanMsg}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6">
        {!data && !error ? (
          <Spinner />
        ) : (data?.notifications.length ?? 0) === 0 ? (
          <EmptyState title="No hay notificaciones">Cuando haya pendientes críticos aparecerán aquí.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {data!.notifications.map((n) => {
              const href = entityHref(n);
              const isUnread = !n.read_at;
              return (
                <li
                  key={n.id}
                  className={`rounded-lg border bg-white p-4 shadow-sm ${
                    isUnread ? "border-zinc-300" : "border-zinc-200 opacity-70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {isUnread && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                        <Badge className={TEMPLATE_TONE[n.template ?? ""] ?? "bg-zinc-100 text-zinc-600"}>
                          {TEMPLATE_LABEL[n.template ?? ""] ?? "Aviso"}
                        </Badge>
                        <span className="text-[11px] text-zinc-400">{formatDateTime(n.created_at)}</span>
                      </div>
                      <p className="mt-2 text-sm text-zinc-800">{n.body}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {href && (
                        <Link href={href} className="text-xs font-medium text-blue-600 hover:underline">
                          Ver
                        </Link>
                      )}
                      {isUnread && (
                        <button
                          type="button"
                          onClick={() => markRead(n.id)}
                          className="text-xs text-zinc-400 hover:text-zinc-700"
                        >
                          Marcar leída
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
