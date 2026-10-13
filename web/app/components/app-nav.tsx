"use client";

import Link from "next/link";
import { UiMark } from "@/app/components/ui";
import PresenceBadge from "@/app/components/presence-badge";
import UserSwitcher from "@/app/components/user-switcher";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ADMIN_SUB, NAV } from "@/app/lib/nav";
import pkg from "../../package.json";

export default function AppNav() {
  const path = usePathname();
  const [unread, setUnread] = useState(0);
  const [sections, setSections] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/notifications")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d) setUnread(d.unread ?? 0);
        })
        .catch(() => {});
    }
    load();
    const timer = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setSections(Array.isArray(d.sections) ? d.sections : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const allowed = (section: string) =>
    sections === null || sections.includes("*") || sections.includes(section);

  const navItems = NAV.filter((n) => allowed(n.section));
  const adminItems = ADMIN_SUB.filter((a) => allowed(a.section));
  const showAdmin =
    adminItems.length > 0 || (sections !== null && (sections.includes("*") || sections.includes("admin")));

  return (
    <div className="relative flex h-full min-h-screen w-52 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <PresenceBadge />
      <div className="border-b border-zinc-200 px-4 py-4">
        <h1 className="text-sm font-bold tracking-tight text-zinc-800">
          <Link href="/">Seguimiento Ops</Link>
        </h1>
        <p className="mt-0.5 text-[10px] text-zinc-400">Operaciones técnicas</p>
      </div>

      <div className="px-2 pt-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("sg:open-palette"))}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-200 px-2.5 py-1.5 text-left text-xs text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-700"
        >
          <span className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" />
            </svg>
            Buscar…
          </span>
          <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 text-[10px] font-medium text-zinc-400">Ctrl K</kbd>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {navItems.map(({ href, label }) => {
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

        {showAdmin && (
          <div className="mt-5 border-t border-zinc-100 pt-3">
            <p className="mb-1 flex items-center justify-between px-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Administración
              <UiMark id="N2" />
            </p>
            <ul className="space-y-0.5">
              {adminItems.map((item) => {
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
                    {item.children
                      ?.filter((c) => allowed(c.section))
                      .map((child) => (
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
        )}
      </nav>

      <div className="border-t border-zinc-100 px-2 py-2">
        <UserSwitcher />
        <p className="px-2 pb-1 pt-0.5 text-[10px] text-zinc-400">v{pkg.version}</p>
      </div>
    </div>
  );
}
