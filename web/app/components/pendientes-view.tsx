"use client";

import Link from "next/link";
import { useResource } from "@/app/lib/client";
import { formatDate, formatDateTime } from "@/app/lib/format";
import { Badge } from "@/app/components/ui";

interface PendientesData {
  bloqueados: Bloqueado[];
  vencimientos: Vencimiento[];
  sin_planificar: SinPlanificar[];
  actividades_vencidas: ActividadVencida[];
  tickets_nuevos: TicketItem[];
  tickets_sin_tecnico: TicketItem[];
  tickets_sin_actualizacion: TicketItem[];
  resoluciones_por_validar: TicketItem[];
}

interface Bloqueado {
  id: string;
  code: string;
  name: string;
  health_status: string;
  project_status: string;
  coordinator_name: string | null;
  phase_blocked_name: string | null;
  reason: string | null;
  next_action: string | null;
  next_action_date: string | null;
  age_days: number;
}

interface Vencimiento {
  kind: "project" | "phase";
  id: string;
  project_id: string;
  label: string;
  title: string;
  due_date: string;
  status: string;
  overdue_days: number;
  responsible: string | null;
}

interface SinPlanificar {
  project_id: string;
  project_code: string;
  phase_name: string;
  phase_status: string;
}

interface ActividadVencida {
  id: string;
  date: string;
  description: string | null;
  planned_hours: string;
  ticket_code: string | null;
  ticket_title: string | null;
  technicians: string[] | null;
}

interface TicketItem {
  id: string;
  code: string;
  title: string;
  client_name: string | null;
  location_name?: string | null;
  priority_name?: string | null;
  opened_at?: string;
  age_days?: number;
  idle_days?: number;
  last_activity_at?: string;
  status?: string;
  resolved_at?: string;
  next_action?: string | null;
  next_action_date?: string | null;
}

function Section({
  title,
  count,
  tone = "default",
  children,
  empty,
}: {
  title: string;
  count: number;
  tone?: "default" | "danger" | "warn";
  children: React.ReactNode;
  empty: string;
}) {
  const toneCls =
    tone === "danger"
      ? "bg-rose-600"
      : tone === "warn"
        ? "bg-amber-500"
        : "bg-zinc-900";
  return (
    <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${toneCls}`}>
          {count}
        </span>
      </header>
      {count === 0 ? (
        <p className="px-4 py-3 text-sm text-zinc-400">{empty}</p>
      ) : (
        <ul className="divide-y divide-zinc-100">{children}</ul>
      )}
    </section>
  );
}

function MoveTag({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
      <span className="font-medium text-zinc-400">{label}:</span>
      {children}
    </span>
  );
}

export default function PendientesView() {
  const { data, error } = useResource<PendientesData>("/api/pendientes");

  return (
    <div className="bg-zinc-100 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold leading-tight">Bandeja de control</h1>
        <p className="text-sm text-zinc-500">
          Bloqueos, vencimientos y tickets que necesitan atención
        </p>
      </header>

      <main className="grid gap-4 p-4 lg:grid-cols-2">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {!data && !error && (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
            Cargando bandeja…
          </div>
        )}

        {data && (
          <>
            <Section
              title="Bloqueados"
              count={data.bloqueados.length}
              tone="danger"
              empty="Sin bloqueos activos"
            >
              {data.bloqueados.map((b) => (
                <li key={b.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/proyectos/${b.id}`}
                      className="text-sm font-medium text-zinc-800 hover:underline"
                    >
                      <span className="font-mono text-xs text-zinc-500">{b.code}</span> {b.name}
                    </Link>
                    {b.phase_blocked_name && (
                      <Badge className="bg-rose-100 text-rose-700">Fase: {b.phase_blocked_name}</Badge>
                    )}
                    {b.age_days > 0 && (
                      <Badge className="bg-amber-100 text-amber-700">{b.age_days} d</Badge>
                    )}
                  </div>
                  {b.reason && (
                    <p className="mt-1 text-xs text-zinc-500">Motivo: {b.reason}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                    {b.coordinator_name && <MoveTag label="Responsable">{b.coordinator_name}</MoveTag>}
                    {b.next_action && <MoveTag label="Próxima acción">{b.next_action}</MoveTag>}
                    {b.next_action_date && (
                      <MoveTag label="Fecha">{formatDate(b.next_action_date)}</MoveTag>
                    )}
                  </div>
                </li>
              ))}
            </Section>

            <Section
              title="Vencimientos"
              count={data.vencimientos.length}
              tone="danger"
              empty="Nada vencido por fecha planificada"
            >
              {data.vencimientos.map((v) => (
                <li key={`${v.kind}-${v.id}`} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/proyectos/${v.project_id}`}
                      className="text-sm font-medium text-zinc-800 hover:underline"
                    >
                      <span className="font-mono text-xs text-zinc-500">{v.label}</span> {v.title}
                    </Link>
                    <Badge className="bg-rose-100 text-rose-700">
                      {v.kind === "phase" ? "fase" : "proyecto"} · vence {v.overdue_days} d
                    </Badge>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                    <MoveTag label="Planeado para">{formatDate(v.due_date)}</MoveTag>
                    {v.responsible && <MoveTag label="Responsable">{v.responsible}</MoveTag>}
                  </div>
                </li>
              ))}
            </Section>

            <Section
              title="Fases sin planificar"
              count={data.sin_planificar.length}
              tone="warn"
              empty="Todas las fases tienen fecha planificada"
            >
              {data.sin_planificar.map((sp, i) => (
                <li key={i} className="px-4 py-3">
                  <Link
                    href={`/proyectos/${sp.project_id}`}
                    className="text-sm text-zinc-800 hover:underline"
                  >
                    <span className="font-mono text-xs text-zinc-500">{sp.project_code}</span>{" "}
                    {sp.phase_name}
                  </Link>
                </li>
              ))}
            </Section>

            <Section
              title="Actividades vencidas"
              count={data.actividades_vencidas.length}
              tone="danger"
              empty="Ninguna actividad planeada quedó pendiente"
            >
              {data.actividades_vencidas.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-zinc-800">
                    {a.description ?? a.ticket_title ?? "Actividad"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <MoveTag label="Día">{formatDate(a.date)}</MoveTag>
                    <MoveTag label="Horas planeadas">{a.planned_hours}</MoveTag>
                    {a.ticket_code && <MoveTag label="Ticket">{a.ticket_code}</MoveTag>}
                    {a.technicians && a.technicians.length > 0 && (
                      <MoveTag label="Técnicos">{a.technicians.join(", ")}</MoveTag>
                    )}
                  </div>
                </li>
              ))}
            </Section>

            <Section
              title="Tickets nuevos"
              count={data.tickets_nuevos.length}
              tone="warn"
              empty="Sin tickets nuevos"
            >
              {data.tickets_nuevos.map((t) => (
                <TicketRow key={t.id} t={t} />
              ))}
            </Section>

            <Section
              title="Tickets sin técnico"
              count={data.tickets_sin_tecnico.length}
              tone="warn"
              empty="Todos los tickets tienen responsable"
            >
              {data.tickets_sin_tecnico.map((t) => (
                <TicketRow key={t.id} t={t} />
              ))}
            </Section>

            <Section
              title="Tickets sin actualización"
              count={data.tickets_sin_actualizacion.length}
              tone="warn"
              empty="Sin tickets inactivos"
            >
              {data.tickets_sin_actualizacion.map((t) => (
                <TicketRow key={t.id} t={t} />
              ))}
            </Section>

            <Section
              title="Resoluciones por validar"
              count={data.resoluciones_por_validar.length}
              empty="No hay resoluciones pendientes de validar"
            >
              {data.resoluciones_por_validar.map((t) => (
                <TicketRow key={t.id} t={t} />
              ))}
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

function TicketRow({ t }: { t: TicketItem }) {
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/tickets/${t.id}`}
          className="text-sm font-medium text-zinc-800 hover:underline"
        >
          <span className="font-mono text-xs text-zinc-500">{t.code}</span> {t.title}
        </Link>
        {t.priority_name && (
          <Badge className="bg-zinc-800 text-zinc-100">{t.priority_name}</Badge>
        )}
        {t.age_days != null && t.age_days > 0 && (
          <Badge className="bg-zinc-200 text-zinc-700">{t.age_days} d</Badge>
        )}
        {t.idle_days != null && t.idle_days > 0 && (
          <Badge className="bg-zinc-200 text-zinc-700">{t.idle_days} d sin novedad</Badge>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {t.client_name && <MoveTag label="Cliente">{t.client_name}</MoveTag>}
        {t.location_name && <MoveTag label="Ubicación">{t.location_name}</MoveTag>}
        {t.opened_at && <MoveTag label="Abierto">{formatDateTime(t.opened_at)}</MoveTag>}
        {t.resolved_at && <MoveTag label="Resuelto">{formatDateTime(t.resolved_at)}</MoveTag>}
        {t.next_action && <MoveTag label="Próxima acción">{t.next_action}</MoveTag>}
        {t.next_action_date && (
          <MoveTag label="Fecha">{formatDate(t.next_action_date)}</MoveTag>
        )}
      </div>
    </li>
  );
}