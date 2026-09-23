"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/* ── Status badge colors ─────────────────────────── */

const PROJECT_BADGE: Record<string, string> = {
  new: "bg-slate-100 text-slate-700",
  planning: "bg-blue-100 text-blue-700",
  waiting_authorization: "bg-amber-100 text-amber-700",
  waiting_materials: "bg-orange-100 text-orange-700",
  assembly: "bg-sky-100 text-sky-700",
  ready_install: "bg-teal-100 text-teal-700",
  installation: "bg-indigo-100 text-indigo-700",
  pending_docs: "bg-yellow-100 text-yellow-700",
  closed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-zinc-100 text-zinc-500",
};

const TICKET_BADGE: Record<string, string> = {
  new: "bg-slate-100 text-slate-700",
  to_review: "bg-blue-100 text-blue-700",
  unassigned: "bg-violet-100 text-violet-700",
  scheduled: "bg-cyan-100 text-cyan-700",
  in_progress: "bg-sky-100 text-sky-700",
  waiting_client: "bg-amber-100 text-amber-700",
  waiting_material: "bg-orange-100 text-orange-700",
  waiting_access: "bg-rose-100 text-rose-700",
  resolved_pending_validation: "bg-teal-100 text-teal-700",
  closed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-zinc-100 text-zinc-500",
};

const HEALTH_BADGE: Record<string, string> = {
  on_time: "bg-emerald-100 text-emerald-700",
  at_risk: "bg-amber-100 text-amber-700",
  blocked: "bg-rose-100 text-rose-700",
  no_update: "bg-zinc-100 text-zinc-500",
};

const PHASE_BADGE: Record<string, string> = {
  planned: "bg-sky-100 text-sky-700",
  not_started: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  blocked: "bg-rose-100 text-rose-700",
  not_applicable: "bg-zinc-100 text-zinc-500",
};

const PHASE_LABEL: Record<string, string> = {
  planned: "Planeado",
  not_started: "No iniciado",
  in_progress: "En progreso",
  completed: "Completado",
  blocked: "Bloqueado",
  not_applicable: "No aplica",
};

export function StatusBadge({
  status,
  kind = "project",
}: {
  status: string;
  kind?: "project" | "ticket" | "health" | "phase";
}) {
  const map =
    kind === "project"
      ? PROJECT_BADGE
      : kind === "ticket"
        ? TICKET_BADGE
        : kind === "health"
          ? HEALTH_BADGE
          : PHASE_BADGE;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight ${map[status] ?? "bg-zinc-100 text-zinc-600"}`}
    >
      {kind === "phase" ? (PHASE_LABEL[status] ?? status) : status.replace(/_/g, " ")}
    </span>
  );
}

export function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight ${className}`}>
      {children}
    </span>
  );
}

/* ── Buttons ─────────────────────────────────────── */

export function PrimaryButton({
  onClick,
  disabled,
  children,
  className = "",
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-700 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  onClick,
  disabled,
  children,
  className = "",
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function DangerButton({
  onClick,
  disabled,
  children,
  className = "",
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

/* ── Modal ───────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  footer,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  footer?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`fixed left-1/2 top-1/2 m-0 max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-0 shadow-xl ${wide ? "max-w-2xl" : "max-w-md"} backdrop:backdrop-blur-sm`}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          onClose();
        }}
        className="p-5"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:text-zinc-700"
            aria-label="Cerrar"
          >
            <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div className="mt-4 text-sm text-zinc-700">{children}</div>
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-4">{footer}</div>}
      </form>
    </dialog>
  );
}

/* ── Form fields ─────────────────────────────────── */

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-zinc-600">{label}</label>
      {hint && <p className="text-[11px] text-zinc-400">{hint}</p>}
      {children}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

const inputBase = "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50";

export function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
  type = "text",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`${inputBase} ${className}`}
    />
  );
}

export function Textarea({
  value,
  onChange,
  rows = 3,
  placeholder,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      disabled={disabled}
      className={`${inputBase} resize-y ${className}`}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`${inputBase} ${className}`}
    >
      {placeholder && (
        <option value="">
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ── Loading / empty ─────────────────────────────── */

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800" />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-600">{title}</p>
      {children && <div className="mt-2 text-sm text-zinc-400">{children}</div>}
    </div>
  );
}

/* ── Tag input (for specialties) ─────────────────── */

export function TagInput({
  tags,
  onChange,
  placeholder = "Agregar…",
  suggestions = [],
}: {
  tags: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  function add(tag: string) {
    const t = tag.trim().toLowerCase();
    if (t && !tags.includes(t)) onChange([...tags, t]);
  }
  function remove(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }
  return (
    <div className="space-y-1">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700"
            >
              {t}
              <button type="button" onClick={() => remove(t)} className="ml-0.5 text-zinc-400 hover:text-red-600">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).value = "";
            }
          }}
          className={`${inputBase} pr-2`}
        />
        {suggestions.length > 0 && (
          <div className="absolute inset-x-0 top-full z-10 mt-1 hidden max-h-40 overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg peer-focus:block" />
        )}
      </div>
    </div>
  );
}

/* ── Searchable select (top frecuentes + búsqueda) ─ */

function normText(s: string): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function SearchableSelect({
  value,
  onChange,
  placeholder,
  options,
  topN = 5,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string; frequency?: number }[];
  topN?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const selected = options.find((o) => o.value === value);
  const q = normText(query);

  const frecuentes = [...options]
    .filter((o) => (o.frequency ?? 0) > 0)
    .sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));
  const matches = q
    ? options.filter((o) => normText(o.label).includes(q))
    : frecuentes.slice(0, topN);

  const shown = selected && !matches.some((o) => o.value === value) ? [selected, ...matches] : matches;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        className={`${inputBase} flex items-center justify-between gap-1 text-left`}
      >
        <span className={`truncate ${selected ? "text-zinc-800" : "text-zinc-400"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="text-[10px] text-zinc-400">▼</span>
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={q ? "Escribe para buscar…" : `Buscar en ${placeholder}…`}
            className="w-full border-b border-zinc-200 px-2.5 py-1.5 text-sm outline-none focus:bg-zinc-50"
          />
          <div className="max-h-64 overflow-y-auto">
            {!q && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                  setQuery("");
                }}
                title="Quitar filtro"
                className={`block w-full truncate px-2.5 py-1.5 text-left text-sm hover:bg-zinc-50 ${value === "" ? "bg-zinc-100 font-medium text-zinc-800" : "text-zinc-400"}`}
              >
                {value === "" ? "— Todos —" : "Quitar filtro"}
              </button>
            )}
            {shown.length === 0 && q && (
              <p className="px-2.5 py-2 text-sm text-zinc-400">Sin coincidencias</p>
            )}
            {q && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                  setQuery("");
                }}
                title="Quitar filtro"
                className="block w-full truncate px-2.5 py-1.5 text-left text-sm text-zinc-400 hover:bg-zinc-50"
              >
                — Todos —
              </button>
            )}
            {shown.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQuery("");
                }}
                className={`block w-full truncate px-2.5 py-1.5 text-left text-sm hover:bg-zinc-50 ${o.value === value ? "bg-zinc-100 font-medium text-zinc-800" : "text-zinc-800"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
