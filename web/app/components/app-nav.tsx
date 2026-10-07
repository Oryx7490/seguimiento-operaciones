"use client";

import Link from "next/link";
import { UiMark } from "@/app/components/ui";
import PresenceBadge from "@/app/components/presence-badge";
import UserSwitcher from "@/app/components/user-switcher";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import pkg from "../../package.json";

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/agenda", label: "Agenda" },
  { href: "/gantt", label: "Gantt" },
  { href: "/gantt-tickets", label: "Gantt tickets" },
  { href: "/proyectos", label: "Proyectos" },
  { href: "/tickets", label: "Tickets" },
  { href: "/pendientes", label: "Pendientes" },
  { href: "/notificaciones", label: "Notificaciones" },
  { href: "/tecnico", label: "Mi agenda móvil" },
  { href: "/ayuda", label: "Ayuda" },
  { href: "/admin", label: "Configuración" },
] as const;

type NavItem = {
  href: string;
  label: string;
  children?: readonly { href: string; label: string }[];
};

const ADMIN_SUB: readonly NavItem[] = [
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/tecnicos", label: "Técnicos" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/ubicaciones", label: "Ubicaciones" },
  {
    href: "/admin/catalogos",
    label: "Catálogos",
    children: [
      { href: "/admin/controladores", label: "Controladores" },
      { href: "/admin/catalogo-pantallas", label: "Pantallas" },
    ],
  },
  { href: "/admin/especialidades", label: "Especialidades" },
  { href: "/admin/calendario", label: "Calendario" },
  {
    href: "/admin/inventario",
    label: "Inventario",
    children: [{ href: "/admin/planeacion", label: "Planeación" }],
  },
  { href: "/admin/cierre", label: "Cierre" },
  { href: "/admin/horas-extra", label: "Horas extra" },
  { href: "/admin/notificaciones", label: "Notificaciones" },
  { href: "/bitacora", label: "Bitácora" },
  { href: "/admin/agentes", label: "Agentes CLI" },
];

export default function AppNav() {
  const path = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/notifications")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d) setUnread(d.unread ?? 0);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="relative flex h-full min-h-screen w-52 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <PresenceBadge />
      <div className="border-b border-zinc-200 px-4 py-4">
        <h1 className="text-sm font-bold tracking-tight text-zinc-800">
          <Link href="/">Seguimiento Ops</Link>
        </h1>
        <p className="mt-0.5 text-[10px] text-zinc-400">Operaciones técnicas</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {NAV.map(({ href, label }) => {
            const active = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition ${
                    active
                      ? "bg-zinc-900 font-medium text-white"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  <span>{label}</span>
                  {href === "/notificaciones" && unread > 0 && (
                    <span className="rounded-full bg-blue-500 px-1.5 text-[10px] font-bold leading-4 text-white">
                      {unread}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 border-t border-zinc-100 pt-3">
          <p className="mb-1 flex items-center justify-between px-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Administración
            <UiMark id="N2" />
          </p>
          <ul className="space-y-0.5">
            {ADMIN_SUB.map((item) => {
              const selfActive = path === item.href;
              const childActive = item.children?.some((c) => path === c.href) ?? false;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block rounded-md px-2.5 py-1.5 text-sm transition ${
                      selfActive
                        ? "bg-zinc-900 font-medium text-white"
                        : childActive
                          ? "bg-zinc-100 font-medium text-zinc-900"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                  {item.children?.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`mt-0.5 block rounded-md py-1.5 pl-6 pr-2.5 text-sm transition ${
                        path === child.href
                          ? "bg-zinc-900 font-medium text-white"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      }`}
                    >
                      {child.label}
                    </Link>
                  ))}
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div className="border-t border-zinc-100 px-2 py-2">
        <UserSwitcher />
        <p className="px-2 pb-1 pt-0.5 text-[10px] text-zinc-400">v{pkg.version}</p>
      </div>
    </div>
  );
}
