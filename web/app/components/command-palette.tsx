"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ADMIN_SUB, NAV } from "@/app/lib/nav";

interface Command {
  id: string;
  label: string;
  group: "Ir a" | "Crear" | "Acciones";
  hint?: string;
  keywords?: string;
  section?: string;
  run: () => void;
}

const GOTO_MAP: Record<string, { href: string; section: string; hint: string }> = {
  i: { href: "/", section: "inicio", hint: "G I" },
  a: { href: "/agenda", section: "agenda", hint: "G A" },
  g: { href: "/gantt", section: "gantt", hint: "G G" },
  p: { href: "/proyectos", section: "proyectos", hint: "G P" },
  t: { href: "/tickets", section: "tickets", hint: "G T" },
  d: { href: "/pendientes", section: "pendientes", hint: "G D" },
  n: { href: "/notificaciones", section: "notificaciones", hint: "G N" },
  u: { href: "/admin/usuarios", section: "admin.usuarios", hint: "G U" },
  c: { href: "/admin/clientes", section: "admin.clientes", hint: "G C" },
  s: { href: "/pantallas-pendientes", section: "pantallas_pendientes", hint: "G S" },
};

const CREATE_ACTIONS: { href: string; kind: string; label: string; section: string; keywords: string }[] = [
  { href: "/proyectos", kind: "proyecto", label: "Nuevo proyecto", section: "proyectos", keywords: "crear alta alta de proyecto" },
  { href: "/tickets", kind: "ticket", label: "Nuevo ticket", section: "tickets", keywords: "incidencia soporte crear" },
  { href: "/agenda", kind: "actividad", label: "Nueva actividad", section: "agenda", keywords: "agenda tarea evento" },
  { href: "/admin/usuarios", kind: "usuario", label: "Nuevo usuario", section: "admin.usuarios", keywords: "perfil persona alta" },
  { href: "/admin/clientes", kind: "cliente", label: "Nuevo cliente", section: "admin.clientes", keywords: "cuenta empresa" },
  { href: "/admin/tecnicos", kind: "tecnico", label: "Nuevo técnico", section: "admin.tecnicos", keywords: "personal" },
  { href: "/admin/ubicaciones", kind: "ubicacion", label: "Nueva ubicación", section: "admin.ubicaciones", keywords: "sitio direccion" },
];

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [sections, setSections] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const gRef = useRef(false);
  const gTimer = useRef<number | null>(null);

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

  const allowed = (section?: string) => {
    if (!section) return true;
    if (sections === null) return true;
    return sections.includes("*") || sections.includes(section);
  };

  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };

  function openNew(href: string, kind: string) {
    if (pathname === href) {
      window.dispatchEvent(new CustomEvent("sg:new", { detail: kind }));
    } else {
      router.push(`${href}?new=1`);
    }
    close();
  }

  const commands = useMemo<Command[]>(() => {
    const navCmds: Command[] = [];
    const seen = new Set<string>();
    const push = (item: { href: string; label: string; section: string; keywords?: string }) => {
      if (seen.has(item.href)) return;
      seen.add(item.href);
      const g = G_MAP_ENTRIES.find(([, v]) => v.href === item.href)?.[1].hint;
      navCmds.push({
        id: `go:${item.href}`,
        label: item.label,
        group: "Ir a",
        hint: g,
        keywords: item.keywords,
        section: item.section,
        run: () => {
          router.push(item.href);
          close();
        },
      });
    };
    [...NAV, ...ADMIN_SUB].forEach((item) => {
      push(item);
      item.children?.forEach((c) => push(c));
    });

    const createCmds: Command[] = CREATE_ACTIONS.map((c) => ({
      id: `new:${c.kind}`,
      label: c.label,
      group: "Crear",
      keywords: c.keywords,
      section: c.section,
      run: () => openNew(c.href, c.kind),
    }));

    const actionCmds: Command[] = [
      {
        id: "act:shortcuts",
        label: "Ver atajos de teclado",
        group: "Acciones",
        keywords: "ayuda teclas commands",
        run: () => {
          close();
          setHelp(true);
        },
      },
      {
        id: "act:help",
        label: "Abrir Ayuda",
        group: "Acciones",
        keywords: "documentacion manual",
        section: "ayuda",
        run: () => {
          router.push("/ayuda");
          close();
        },
      },
      {
        id: "act:switch",
        label: "Cambiar de perfil",
        group: "Acciones",
        keywords: "usuario identidad sesion salir",
        run: () => {
          close();
          document.cookie = "sg_uid=; path=/; max-age=0";
          window.location.reload();
        },
      },
    ];

    return [...navCmds, ...createCmds, ...actionCmds].filter((c) => allowed(c.section));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, pathname]);

  const results = useMemo(() => {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    const scored = commands
      .map((c) => {
        const hay = norm(`${c.label} ${c.group} ${c.keywords ?? ""} ${c.hint ?? ""}`);
        if (!tokens.every((t) => hay.includes(t))) return null;
        const label = norm(c.label);
        const q = norm(query).trim();
        const score = q && (label === q ? 3 : label.startsWith(q) ? 2 : label.includes(q) ? 1 : 0);
        return { c, score };
      })
      .filter((x): x is { c: Command; score: number } => x !== null);
    scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.c);
  }, [commands, query]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open || help) return;
    const el = listRef.current?.querySelectorAll("li")[active];
    (el as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [active, open, results, help]);

  useEffect(() => {
    const onOpen = () => {
      setHelp(false);
      setOpen(true);
    };
    const onShortcuts = () => setHelp(true);
    window.addEventListener("sg:open-palette", onOpen);
    window.addEventListener("sg:show-shortcuts", onShortcuts);
    return () => {
      window.removeEventListener("sg:open-palette", onOpen);
      window.removeEventListener("sg:show-shortcuts", onShortcuts);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setHelp(false);
        setOpen((o) => !o);
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setHelp(false);
        setOpen(true);
        return;
      }
      if (mod && e.key === "/") {
        e.preventDefault();
        setHelp(true);
        return;
      }
      if (help) {
        if (e.key === "Escape") setHelp(false);
        return;
      }
      if (open) return;
      if (isTyping(e.target)) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelp(true);
        return;
      }
      if (gRef.current) {
        gRef.current = false;
        if (gTimer.current) window.clearTimeout(gTimer.current);
        const target = G_MAP_ENTRIES.find(([key]) => key === e.key.toLowerCase())?.[1];
        if (target && allowed(target.section)) {
          e.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (e.key.toLowerCase() === "g") {
        gRef.current = true;
        gTimer.current = window.setTimeout(() => {
          gRef.current = false;
        }, 900);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, help, sections]);

  if (!open && !help) return null;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]">
          <div className="absolute inset-0 bg-zinc-900/40" onClick={close} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Paleta de comandos"
            className="relative z-10 w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-zinc-100 px-3.5 py-3">
              <svg className="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="7" cy="7" r="4.5" />
                <path d="M10.5 10.5L14 14" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((i) => Math.min(i + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    results[active]?.run();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    close();
                  }
                }}
                placeholder="Buscar secciones, acciones o crear…"
                className="w-full bg-transparent text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                Esc
              </kbd>
            </div>

            <ul ref={listRef} className="max-h-80 overflow-y-auto py-1.5">
              {results.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-zinc-400">Sin resultados</li>
              )}
              {results.map((c, i) => {
                const showGroup = i === 0 || results[i - 1].group !== c.group;
                return (
                  <li key={c.id}>
                    {showGroup && (
                      <p className="px-3.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                        {c.group}
                      </p>
                    )}
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => c.run()}
                      className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-sm ${
                        i === active ? "bg-zinc-900 text-white" : "text-zinc-700"
                      }`}
                    >
                      <span className="truncate">{c.label}</span>
                      {c.hint && (
                        <kbd
                          className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                            i === active
                              ? "border-zinc-600 text-zinc-300"
                              : "border-zinc-200 bg-zinc-50 text-zinc-400"
                          }`}
                        >
                          {c.hint}
                        </kbd>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center justify-between border-t border-zinc-100 px-3.5 py-2 text-[10px] text-zinc-400">
              <span className="flex items-center gap-2">
                <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1">↑↓</kbd> navegar
                <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1">↵</kbd> abrir
              </span>
              <button type="button" onClick={() => { close(); setHelp(true); }} className="hover:text-zinc-600">
                Ver todos los atajos
              </button>
            </div>
          </div>
        </div>
      )}

      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
    </>
  );
}

const G_MAP_ENTRIES: [string, { href: string; section: string; hint: string }][] = Object.entries(GOTO_MAP);

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["Ctrl K", "Abrir/cerrar el menú de comandos"],
    ["Ctrl ⇧ P", "Abrir el menú de comandos"],
    ["Ctrl /", "Ver atajos de teclado"],
    ["?", "Ver atajos de teclado"],
    ["↑ ↓", "Navegar resultados"],
    ["↵", "Ejecutar la opción seleccionada"],
    ["Esc", "Cerrar menú o ventana"],
    ["G luego I", "Ir a Inicio"],
    ["G luego A", "Ir a Agenda"],
    ["G luego P", "Ir a Proyectos"],
    ["G luego T", "Ir a Tickets"],
    ["G luego D", "Ir a Pendientes"],
    ["G luego N", "Ir a Notificaciones"],
    ["G luego S", "Ir a Pantallas por instalar"],
    ["G luego U", "Ir a Usuarios"],
    ["G luego C", "Ir a Clientes"],
  ];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-zinc-900/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Atajos de teclado"
        className="relative z-10 max-h-[85vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg border border-zinc-200 bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">Atajos de teclado</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:text-zinc-700" aria-label="Cerrar">
            <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <ul className="mt-4 divide-y divide-zinc-100 text-sm">
          {rows.map(([k, d]) => (
            <li key={k} className="flex items-center justify-between gap-4 py-2">
              <span className="text-zinc-600">{d}</span>
              <kbd className="shrink-0 rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                {k}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] text-zinc-400">
          Los atajos no se activan mientras escribes en un campo. Ctrl K funciona en cualquier momento.
        </p>
      </div>
    </div>
  );
}
