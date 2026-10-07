"use client";

import Link from "next/link";
import { useResource } from "@/app/lib/client";
import { Spinner } from "@/app/components/ui";

interface DashboardResponse {
  generated_at: string;
  agenda: { today: number; overdue: number; upcoming: number; technicians: number };
  projects: { active: number; blocked: number; installation: number; total_m2: number };
  tickets: { open: number; unassigned: number; in_progress: number; waiting: number; overdue_actions: number };
  admin: { users: number; clients: number; pending_deletions: number; unread_notifications: number; available_modules: number; incoming_modules: number };
}

function fmt(value: number) {
  return value.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

export default function DashboardView() {
  const { data, error } = useResource<DashboardResponse>("/api/dashboard");

  return (
    <div className="min-h-screen bg-[#f5f3ef] px-4 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <header className="border-b border-zinc-300 pb-6">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-zinc-500">Centro de operaciones</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Seguimiento operativo</h1>
              <p className="mt-2 max-w-2xl text-sm text-zinc-600">Resumen general y acceso a las cuatro áreas principales del sistema.</p>
            </div>
            <p className="font-mono text-xs text-zinc-400">CDMX · información actual</p>
          </div>
        </header>

        {error && <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {!data && !error && <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-10"><Spinner /></div>}

        {data && (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <DashboardCard
              href="/agenda"
              index="01"
              title="Agenda"
              description="Actividades, técnicos y trabajo programado."
              accent="bg-sky-500"
              headline={String(data.agenda.today)}
              headlineLabel="actividades hoy"
              metrics={[
                ["Vencidas", data.agenda.overdue],
                ["Próximos 7 días", data.agenda.upcoming],
                ["Técnicos activos", data.agenda.technicians],
              ]}
            />
            <DashboardCard
              href="/proyectos"
              index="02"
              title="Proyectos"
              description="Proyectos activos, instalación y metraje."
              accent="bg-indigo-500"
              headline={String(data.projects.active)}
              headlineLabel="proyectos corriendo"
              metrics={[
                ["Bloqueados", data.projects.blocked],
                ["En instalación", data.projects.installation],
                ["m² activos", fmt(data.projects.total_m2)],
              ]}
            />
            <DashboardCard
              href="/tickets"
              index="03"
              title="Tickets"
              description="Atención, programación y acciones pendientes."
              accent="bg-amber-500"
              headline={String(data.tickets.open)}
              headlineLabel="tickets abiertos"
              metrics={[
                ["Sin asignar", data.tickets.unassigned],
                ["En progreso", data.tickets.in_progress],
                ["Acciones vencidas", data.tickets.overdue_actions],
              ]}
            />
            <DashboardCard
              href="/admin"
              index="04"
              title="Administración"
              description="Configuración, inventario y revisión administrativa."
              accent="bg-emerald-500"
              headline={String(data.admin.users)}
              headlineLabel="usuarios activos"
              metrics={[
                ["Clientes activos", data.admin.clients],
                ["Revisiones pendientes", data.admin.pending_deletions],
                ["Notificaciones sin leer", data.admin.unread_notifications],
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardCard({
  href,
  index,
  title,
  description,
  accent,
  headline,
  headlineLabel,
  metrics,
}: {
  href: string;
  index: string;
  title: string;
  description: string;
  accent: string;
  headline: string;
  headlineLabel: string;
  metrics: Array<[string, string | number]>;
}) {
  return (
    <Link href={href} className="group relative overflow-hidden rounded-xl border border-zinc-300 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-md">
      <span className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-zinc-400">{index}</p>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-900">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        </div>
        <span className="text-xl text-zinc-300 transition group-hover:translate-x-1 group-hover:text-zinc-700">→</span>
      </div>
      <div className="mt-7 flex items-end gap-3 border-b border-zinc-100 pb-5">
        <span className="text-4xl font-semibold tabular-nums text-zinc-950">{headline}</span>
        <span className="pb-1 text-sm text-zinc-500">{headlineLabel}</span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] leading-tight text-zinc-400">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-800">{value}</dd>
          </div>
        ))}
      </dl>
    </Link>
  );
}
