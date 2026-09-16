import Link from "next/link";

const ORDER: { title: string; body: string; href: string; cta: string }[] = [
  {
    title: "1. Clientes primero",
    body: "Un proyecto siempre se liga a un cliente. Da de alta los clientes antes de crear proyectos.",
    href: "/admin/clientes",
    cta: "Configuración → Clientes",
  },
  {
    title: "2. Proyectos",
    body: "Con clientes listos, crea el proyecto: genera código PR-### y sus fases automáticamente.",
    href: "/proyectos",
    cta: "Proyectos → Nuevo proyecto",
  },
  {
    title: "3. Tickets",
    body: "Registra fallas o solicitudes. Un ticket puede ir sin cliente (interno).",
    href: "/tickets",
    cta: "Tickets → Nuevo ticket",
  },
  {
    title: "4. Técnicos y usuarios",
    body: "Da de alta técnicos en Configuración; cada técnico crea su cuenta de acceso.",
    href: "/admin/tecnicos",
    cta: "Configuración → Técnicos",
  },
];

const PLACES: { label: string; href: string; desc: string }[] = [
  { label: "Agenda", href: "/", desc: "Semana de operaciones por técnico, con horas y filtros." },
  { label: "Mi agenda móvil", href: "/tecnico", desc: "Vista simple para el técnico en su celular." },
  { label: "Proyectos", href: "/proyectos", desc: "Seguimiento por fases, estado y salud." },
  { label: "Tickets", href: "/tickets", desc: "Solicitudes de servicio con su historial." },
  { label: "Gantt", href: "/gantt", desc: "Cronograma visual de proyectos y fases." },
  { label: "Configuración", href: "/admin", desc: "Usuarios, técnicos, clientes, ubicaciones y catálogos." },
];

export default function AyudaPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold text-zinc-900">Ayuda rápida</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Orden recomendado para usar el sistema y dónde encontrar cada cosa.
      </p>

      <section className="mt-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Orden recomendado</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {ORDER.map((s) => (
            <Link
              key={s.title}
              href={s.href}
              className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition hover:shadow"
            >
              <h3 className="text-sm font-semibold text-zinc-900">{s.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">{s.body}</p>
              <p className="mt-2 text-xs font-medium text-sky-700">{s.cta} →</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Dónde está cada cosa</h2>
        <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          {PLACES.map((p, i) => (
            <Link
              key={p.href}
              href={p.href}
              className={`flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-zinc-50 ${
                i > 0 ? "border-t border-zinc-100" : ""
              }`}
            >
              <div>
                <p className="text-sm font-medium text-zinc-800">{p.label}</p>
                <p className="text-xs text-zinc-500">{p.desc}</p>
              </div>
              <span className="text-sm text-zinc-300">→</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}