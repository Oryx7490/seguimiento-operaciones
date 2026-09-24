"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchJson, useResource } from "@/app/lib/client";
import { Badge, Spinner } from "@/app/components/ui";
import {
  projectStatusLabel,
  ticketStatusLabel,
  formatCurrency,
} from "@/app/lib/format";

/* ── Tipos ───────────────────────────────────────── */
interface PipeProject {
  id: string;
  code: string;
  name: string;
  status: string;
  planned_end_date: string | null;
  actual_end_date: string | null;
  client_name: string | null;
  coordinator_name: string | null;
  installation_done: boolean;
  mandatory_activities_completed: boolean;
  hours_justified: boolean;
  delivery_sheet_present: boolean;
  receiver_name: string | null;
  reception_date: string | null;
  closed_at: string | null;
  cobro: boolean;
  facturacion: boolean;
  evidencias: boolean;
  finiquito: boolean;
  complemento_fiscal: boolean;
  note: string | null;
  admin_updated_at: string | null;
}

interface PipeTicket {
  id: string;
  code: string;
  title: string;
  ticket_type: string;
  status: string;
  client_name: string | null;
  coordinator_name: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  updated_at: string;
  billable: boolean;
  warranty: boolean;
  client_resolved: boolean;
  billing_authorized: boolean;
  charge_amount: number | null;
  charge_description: string | null;
  invoice_generated: boolean;
  invoice_id: string | null;
  authorized_at: string | null;
  pending_close: boolean;
}

const TECH_ITEMS: Array<{ key: keyof PipeProject; label: string }> = [
  { key: "installation_done", label: "Instalación realizada" },
  { key: "mandatory_activities_completed", label: "Actividades obligatorias" },
  { key: "hours_justified", label: "Horas justificadas" },
  { key: "delivery_sheet_present", label: "Hoja de entrega" },
];

const ADMIN_ITEMS = [
  { key: "cobro", label: "Cobro iniciado" },
  { key: "facturacion", label: "Facturación" },
  { key: "evidencias", label: "Evidencias" },
  { key: "finiquito", label: "Finiquito" },
  { key: "complemento_fiscal", label: "Complemento fiscal" },
] as const;

type AdminKey = (typeof ADMIN_ITEMS)[number]["key"];

function techReady(p: PipeProject) {
  return TECH_ITEMS.every((i) => Boolean(p[i.key as keyof PipeProject]));
}
function adminDone(p: PipeProject) {
  return ADMIN_ITEMS.every((i) => p[i.key]);
}

/* ── Tab component ───────────────────────────────── */
type Tab = "proyectos" | "tickets";

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

/* ── Página ──────────────────────────────────────── */
export default function CierrePage() {
  const [tab, setTab] = useState<Tab>("proyectos");
  return (
    <div className="p-6">
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-zinc-900">Cierre de proyectos</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pre-cierre: proyectos y tickets listos para pasar a la etapa administrativa
          (cobros, facturación, evidencias).
        </p>
      </div>

      <div className="mt-4 flex border-b border-zinc-200">
        <TabBtn active={tab === "proyectos"} onClick={() => setTab("proyectos")}>
          📁 Proyectos
        </TabBtn>
        <TabBtn active={tab === "tickets"} onClick={() => setTab("tickets")}>
          🎫 Tickets con cobro
        </TabBtn>
      </div>

      {tab === "proyectos" ? <ProjectsTab /> : <TicketsTab />}
    </div>
  );
}

/* ── Tab: Proyectos ──────────────────────────────── */
function ProjectsTab() {
  const { data, error, reload } = useResource<{ projects: PipeProject[] }>(
    "/api/admin/projects/closure-pipeline"
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const projects = data?.projects ?? [];
  const readyCount = projects.filter(techReady).length;
  const doneCount = projects.filter(adminDone).length;

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save(p: PipeProject, patch: Partial<Record<AdminKey | "note", boolean | string | null>>) {
    setBusy(p.id);
    setMsg(null);
    try {
      await fetchJson(`/api/admin/projects/${p.id}/admin-closure`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setMsg({ text: `Checklist de ${p.code} guardado.` });
      reload();
    } catch (e) {
      setMsg({ text: String(e), error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4">
      {msg && (
        <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${
          msg.error
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}>
          {msg.text}
        </div>
      )}

      {/* Resumen */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">En pipeline</p>
          <p className="mt-1 text-3xl font-semibold text-zinc-900">{projects.length}</p>
          <p className="mt-1 text-xs text-zinc-400">instalación en curso o pendiente de docs</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Listos para administrativo</p>
          <p className="mt-1 text-3xl font-semibold text-emerald-800">{readyCount}</p>
          <p className="mt-1 text-xs text-emerald-600">checklist técnico completo</p>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-600">Cierre admin completado</p>
          <p className="mt-1 text-3xl font-semibold text-sky-800">{doneCount}</p>
          <p className="mt-1 text-xs text-sky-600">cobro, factura y evidencias listos</p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {!data && !error && <Spinner />}

      {data && projects.length === 0 && (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-10 text-center text-zinc-500">
          No hay proyectos en pipeline de cierre.
        </div>
      )}

      {data && projects.length > 0 && (
        <div className="mt-4 space-y-3">
          {projects.map((p) => {
            const isOpen = expanded.has(p.id);
            const tReady = techReady(p);
            const aDone = adminDone(p);
            const techCount = TECH_ITEMS.filter((i) => Boolean(p[i.key as keyof PipeProject])).length;
            const adminCount = ADMIN_ITEMS.filter((i) => p[i.key]).length;
            return (
              <div key={p.id} className="rounded-lg border border-zinc-200 bg-white shadow-sm">
                <button
                  onClick={() => toggle(p.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-sky-700">{p.code}</span>
                      <span className="truncate font-medium text-zinc-800">{p.name}</span>
                      <Badge className="bg-zinc-100 text-zinc-600">{projectStatusLabel(p.status)}</Badge>
                      {tReady ? (
                        <Badge className={aDone ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}>
                          {aDone ? "Cierre admin completo" : "Listo para administrativo"}
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700">Instalación en curso</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {p.client_name ?? "—"}
                      {p.coordinator_name ? ` · Coord. ${p.coordinator_name}` : ""}
                      {p.planned_end_date ? ` · Entrega ${p.planned_end_date.slice(0, 10)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-zinc-500">Técnico {techCount}/{TECH_ITEMS.length}</span>
                    <span className="text-xs text-zinc-500">Admin {adminCount}/{ADMIN_ITEMS.length}</span>
                    <svg
                      className={`h-4 w-4 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-zinc-100 p-4">
                    <div className="grid gap-6 md:grid-cols-2">
                      {/* Checklist técnico (solo lectura) */}
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Checklist técnico (proyecto)
                        </p>
                        <ul className="space-y-1.5">
                          {TECH_ITEMS.map((i) => {
                            const ok = Boolean(p[i.key as keyof PipeProject]);
                            return (
                              <li key={i.key} className="flex items-center gap-2 text-sm text-zinc-700">
                                <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                                  ok ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-400"
                                }`}>{ok ? "✓" : "·"}</span>
                                {i.label}
                              </li>
                            );
                          })}
                          <li className="pt-1 text-xs text-zinc-400">
                            Recibe: <strong className="text-zinc-600">{p.receiver_name || "—"}</strong>
                            {p.reception_date ? ` · ${p.reception_date.slice(0, 10)}` : ""}
                          </li>
                        </ul>
                        {!tReady && (
                          <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
                            Aún no está listo para pasar a administrativo.
                          </p>
                        )}
                      </div>

                      {/* Checklist administrativo (editable) */}
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Trámite administrativo
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                          {ADMIN_ITEMS.map((i) => (
                            <label key={i.key} className="flex items-center gap-2 text-sm text-zinc-700">
                              <input
                                type="checkbox"
                                checked={p[i.key]}
                                disabled={busy === p.id}
                                onChange={(e) => save(p, { [i.key]: e.target.checked })}
                                className="rounded border-zinc-300"
                              />
                              {i.label}
                            </label>
                          ))}
                        </div>
                        <NoteEditor
                          initial={p.note ?? ""}
                          disabled={busy === p.id}
                          onSave={(note) => save(p, { note })}
                        />
                        <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                          <Link
                            href={`/proyectos/${p.id}`}
                            className="rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100"
                          >
                            Abrir proyecto
                          </Link>
                          <Link
                            href={`/proyectos/${p.id}#cierre`}
                            className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-100"
                          >
                            Ir al cierre técnico
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Tab: Tickets con cobro ──────────────────────── */
function TicketsTab() {
  const { data, error, reload } = useResource<{ tickets: PipeTicket[] }>(
    "/api/admin/tickets/closure-pipeline"
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const tickets = data?.tickets ?? [];
  const pendingCount = tickets.filter((t) => t.pending_close).length;
  const chargedCount = tickets.filter((t) => t.billable && (t.charge_amount ?? 0) > 0).length;
  const invoicedCount = tickets.filter((t) => t.invoice_generated).length;

  async function toggleInvoice(t: PipeTicket) {
    setBusy(t.id);
    setMsg(null);
    try {
      await fetchJson(`/api/admin/tickets/${t.id}/billing`, {
        method: "PATCH",
        body: JSON.stringify({ invoice_generated: !t.invoice_generated }),
      });
      setMsg({ text: `Facturación del ticket ${t.code} actualizada.` });
      reload();
    } catch (e) {
      setMsg({ text: String(e), error: true });
    } finally {
      setBusy(null);
    }
  }

  // Borrador del ID de factura
  const [draftInvoice, setDraftInvoice] = useState<Record<string, string>>({});
  async function setInvoiceId(t: PipeTicket) {
    const invoiceId = (draftInvoice[t.id] ?? t.invoice_id ?? "").trim();
    setBusy(t.id);
    setMsg(null);
    try {
      await fetchJson(`/api/admin/tickets/${t.id}/billing`, {
        method: "PATCH",
        body: JSON.stringify({ invoice_id: invoiceId }),
      });
      setMsg({ text: `ID de factura del ticket ${t.code} guardado.` });
      reload();
    } catch (e) {
      setMsg({ text: String(e), error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4">
      {msg && (
        <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${
          msg.error
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}>
          {msg.text}
        </div>
      )}

      {/* Resumen */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Por cerrar</p>
          <p className="mt-1 text-3xl font-semibold text-zinc-900">{pendingCount}</p>
          <p className="mt-1 text-xs text-zinc-400">resueltos pendientes de validación</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">Con cobro</p>
          <p className="mt-1 text-3xl font-semibold text-emerald-800">{chargedCount}</p>
          <p className="mt-1 text-xs text-emerald-600">facturables sin facturar todavía</p>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-600">Facturados</p>
          <p className="mt-1 text-3xl font-semibold text-sky-800">{invoicedCount}</p>
          <p className="mt-1 text-xs text-sky-600">con factura generada</p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {!data && !error && <Spinner />}

      {data && tickets.length === 0 && (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-10 text-center text-zinc-500">
          No hay tickets pendientes de cierre ni con cobro sin facturar.
        </div>
      )}

      {data && tickets.length > 0 && (
        <div className="mt-4 space-y-3">
          {tickets.map((t) => {
            const isCharged = t.billable && (t.charge_amount ?? 0) > 0;
            return (
              <div key={t.id} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/tickets/${t.id}`} className="hover:underline">
                        <span className="font-mono text-xs text-sky-700">{t.code}</span>
                        <span className="ml-1 font-medium text-zinc-800">{t.title}</span>
                      </Link>
                      <Badge className={t.ticket_type === "external" ? "bg-sky-100 text-sky-700" : "bg-zinc-100 text-zinc-600"}>
                        {t.ticket_type === "external" ? "Externo" : "Interno"}
                      </Badge>
                      <Badge className="bg-zinc-100 text-zinc-600">{ticketStatusLabel(t.status)}</Badge>
                      {t.pending_close && (
                        <Badge className="bg-amber-100 text-amber-700">Por cerrar</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {t.client_name ?? "—"}
                      {t.coordinator_name ? ` · Coord. ${t.coordinator_name}` : ""}
                      {t.resolved_at ? ` · Resuelto ${t.resolved_at.slice(0, 10)}` : ""}
                      {t.authorized_at ? ` · Cobro autorizado ${t.authorized_at.slice(0, 10)}` : ""}
                    </p>
                    {t.charge_description && (
                      <p className="mt-1 text-xs text-zinc-500">Concepto: {t.charge_description}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {t.warranty ? (
                        <Badge className="bg-violet-100 text-violet-700">Garantía</Badge>
                      ) : t.client_resolved ? (
                        <Badge className="bg-teal-100 text-teal-700">Resuelto por cliente</Badge>
                      ) : isCharged ? (
                        <Badge className="bg-emerald-100 text-emerald-700">Cobro: {formatCurrency(t.charge_amount ?? 0)}</Badge>
                      ) : (
                        <Badge className="bg-zinc-100 text-zinc-600">Sin cargo</Badge>
                      )}
                      {t.billing_authorized && <Badge className="bg-lime-100 text-lime-700">Cobro autorizado</Badge>}
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                        <input
                          type="checkbox"
                          checked={t.invoice_generated}
                          disabled={busy === t.id}
                          onChange={() => toggleInvoice(t)}
                          className="rounded border-zinc-300"
                        />
                        Facturado
                      </label>
                      <input
                        value={draftInvoice[t.id] ?? t.invoice_id ?? ""}
                        disabled={busy === t.id}
                        onChange={(e) => setDraftInvoice((p) => ({ ...p, [t.id]: e.target.value }))}
                        placeholder="ID de factura"
                        className="w-32 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
                      />
                      <button
                        onClick={() => setInvoiceId(t)}
                        disabled={busy === t.id}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                      >
                        {busy === t.id ? "…" : "Guardar"}
                      </button>
                    </div>

                    <Link
                      href={`/tickets/${t.id}`}
                      className="rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100"
                    >
                      Abrir ticket
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Editor de nota ──────────────────────────────── */
function NoteEditor({ initial, disabled, onSave }: {
  initial: string; disabled?: boolean; onSave: (note: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function handle() {
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  }
  const dirty = value !== initial;
  return (
    <div className="mt-3">
      <textarea
        rows={2}
        value={value}
        disabled={disabled || saving}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Notas del cierre (opcional)"
        className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none"
      />
      <button
        onClick={handle}
        disabled={disabled || saving || !dirty}
        className="mt-1 rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
      >
        {saving ? "Guardando…" : "Guardar nota"}
      </button>
    </div>
  );
}