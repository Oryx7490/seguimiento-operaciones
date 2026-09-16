"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Agenda" },
  { href: "/gantt", label: "Gantt" },
  { href: "/tecnico", label: "Mi agenda móvil" },
  { href: "/proyectos", label: "Proyectos" },
  { href: "/tickets", label: "Tickets" },
  { href: "/admin", label: "Configuración" },
] as const;

const ADMIN_SUB = [
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/tecnicos", label: "Técnicos" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/ubicaciones", label: "Ubicaciones" },
  { href: "/admin/catalogos", label: "Catálogos" },
] as const;

export default function AppNav() {
  const path = usePathname();

  return (
    <div className="flex h-full min-h-screen w-52 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-4">
        <h1 className="text-sm font-bold tracking-tight text-zinc-800">
          <Link href="/">Seguimiento Ops</Link>
        </h1>
        <p className="mt-0.5 text-[10px] text-zinc-400">Operaciones técnicas</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {NAV.map(({ href, label }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`block rounded-md px-2.5 py-1.5 text-sm transition ${
                    active
                      ? "bg-zinc-900 font-medium text-white"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 border-t border-zinc-100 pt-3">
          <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Administración
          </p>
          <ul className="space-y-0.5">
            {ADMIN_SUB.map(({ href, label }) => {
              const active = path === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`block rounded-md px-2.5 py-1.5 text-sm transition ${
                      active
                        ? "bg-zinc-900 font-medium text-white"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div className="border-t border-zinc-100 px-4 py-3 text-[10px] text-zinc-400">
        v0.1.0
      </div>
    </div>
  );
}
