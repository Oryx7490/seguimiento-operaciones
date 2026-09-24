"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchJson, useResource } from "@/app/lib/client";
import { formatDate, formatDateTime, projectStatusLabel, healthStatusLabel, phaseStatusLabel } from "@/app/lib/format";
import {
  Badge,
  Field,
  Modal,
  PrimaryButton,
  SecondaryButton,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
  TextInput,
} from "@/app/components/ui";
import CommentSection from "@/app/components/comment-section";
import AttachmentsSection from "@/app/components/attachments-section";
import ProjectClosure from "@/app/components/project-closure";
import type {
  ProjectAttachment,
  ProjectDetail,
  ProjectPhase,
  ProjectScreen,
  Technician,
  TechniciansResponse,
} from "@/app/lib/types";

const PROJECT_TRANSITIONS: Record<string, string[]> = {
  new: ["planning"],
  planning: ["waiting_authorization", "waiting_materials"],
  waiting_authorization: ["planning", "waiting_materials"],
  waiting_materials: ["planning", "assembly"],
  assembly: ["ready_install"],
  ready_install: ["installation"],
  installation: ["pending_docs", "closed"],
  pending_docs: ["closed"],
  closed: [],
  cancelled: [],
};

const HEALTH_OPTIONS = ["on_time", "at_risk", "blocked", "no_update"];

const PHASE_STATUS_OPTIONS = ["planned", "not_started", "in_progress", "completed", "blocked", "not_applicable"];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: detail, error, reload } = useResource<ProjectDetail>(`/api/projects/${id}`);

  // Columnas visibles en tabla de fases
  const [phaseCols, setPhaseCols] = useState<Record<string, boolean>>({
    estado: true,
    inicio: true,
    fin: true,
    responsable: true,
    bloqueo: true,
    m2total: false,
  });
  const [showColMenu, setShowColMenu] = useState(false);

  function togglePhaseCol(key: string) {
    setPhaseCols((c) => ({ ...c, [key]: !c[key] }));
  }

  if (!detail) return <div className="p-6">{error ? <p className="text-red-600">Error: {error}</p> : <Spinner />}</div>;
  const p = detail.project;

  const totalM2 = detail.screens.reduce((sum, s) => sum + (s.m2 || 0) * (s.quantity || 0), 0);

  return (
    <div className="max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-zinc-700">{p.code}</span>
          <div className="mt-2 flex items-center gap-2">
            <h1 className="text-xl font-semibold text-zinc-900">{p.name}</h1>
            <EditProjectName projectId={id} currentName={p.name} onSaved={reload} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
            <span>{p.client_name ?? "Sin cliente"}</span>
            {p.location_name && <span>· {p.location_name}{p.city ? `, ${p.city}` : ""}</span>}
            {p.priority_name && <span>· {p.priority_name}</span>}
            {p.coordinator_name && <span>· Coord: {p.coordinator_name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
            ← Volver
          </button>
        </div>
      </div>

      {/* Status / health / dates */}
      <div className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-zinc-400">Salud</p>
          <StatusBadge status={p.health_status} kind="health" />
        </div>
        <div>
          <p className="text-xs text-zinc-400">Inicio plan.</p>
          <p className="text-sm font-medium text-zinc-800">{formatDate(p.planned_start_date)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-400">Fin plan.</p>
          <p className="text-sm font-medium text-zinc-800">{formatDate(p.planned_end_date)}</p>
        </div>
      </div>

      {p.blocked_reason && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <strong>Bloqueo:</strong> {p.blocked_reason}
          {p.next_action && <span className="ml-2">→ {p.next_action}</span>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <StatusChanger detail={detail} onSaved={reload} />
        <HealthChanger detail={detail} onSaved={reload} />
        <DeletionRequest detail={detail} onSaved={reload} />
      </div>

      {/* Alerta: eliminación pendiente */}
      {p.deletion_requested_at && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <strong>Eliminación solicitada</strong> — pendiente de aprobación por administrador.
          {p.deletion_reason && <span className="ml-2 text-red-700">Motivo: {p.deletion_reason}</span>}
        </div>
      )}

      {/* Phases */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-800">Fases</h2>
          <div className="flex gap-2">
            <NotApplicableChecklist detail={detail} onSaved={reload} />
            <AddPhase detail={detail} onSaved={reload} />
            <div className="relative">
              <button
                onClick={() => setShowColMenu((s) => !s)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                Columnas
              </button>
              {showColMenu && (
                <div className="absolute right-0 mt-1 z-10 rounded-md border border-zinc-200 bg-white shadow-lg py-1 min-w-[160px]">
                  {([
                    { key: "estado", label: "Estado" },
                    { key: "inicio", label: "Inicio" },
                    { key: "fin", label: "Fin" },
                    { key: "responsable", label: "Responsable" },
                    { key: "bloqueo", label: "Bloqueo" },
                    { key: "m2total", label: "m² total (pantallas)" },
                  ] as const).map((col) => (
                    <label key={col.key} className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={phaseCols[col.key]}
                        onChange={() => togglePhaseCol(col.key)}
                        className="h-4 w-4 accent-zinc-900"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        {detail.phases.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No hay fases registradas.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">Fase</th>
                  {phaseCols.estado && <th className="px-3 py-2 text-left">Estado</th>}
                  {phaseCols.inicio && <th className="px-3 py-2 text-left">Inicio</th>}
                  {phaseCols.fin && <th className="px-3 py-2 text-left">Fin</th>}
                  {phaseCols.responsable && <th className="px-3 py-2 text-left">Responsable</th>}
                  {phaseCols.bloqueo && <th className="px-3 py-2 text-left">Bloqueo</th>}
                  {phaseCols.m2total && <th className="px-3 py-2 text-right">m² total</th>}
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {detail.phases.map((ph) => (
                  <tr key={ph.id} className={ph.status === "not_applicable" ? "opacity-50" : "hover:bg-zinc-50"}>
                    <td className="px-3 py-2 font-medium text-zinc-800">{ph.name}</td>
                    {phaseCols.estado && <td className="px-3 py-2"><StatusBadge status={ph.status} kind="phase" /></td>}
                    {phaseCols.inicio && <td className="px-3 py-2 text-zinc-500">{formatDate(ph.planned_start_date)}</td>}
                    {phaseCols.fin && <td className="px-3 py-2 text-zinc-500">{formatDate(ph.planned_end_date)}</td>}
                    {phaseCols.responsable && <td className="px-3 py-2 text-zinc-600">{ph.owner_name ?? "—"}</td>}
                    {phaseCols.bloqueo && (
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {ph.status === "blocked"
                          ? [ph.blocked_reason, ph.next_action].filter(Boolean).join(" · ") || "—"
                          : "—"}
                      </td>
                    )}
                    {phaseCols.m2total && <td className="px-3 py-2 text-right font-medium text-zinc-800">{totalM2 > 0 ? `${formatNum(totalM2)} m²` : "—"}</td>}
                    <td className="px-3 py-2 text-right">
                      <EditPhase detail={detail} phase={ph} onSaved={reload} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Assignments */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-800">Asignaciones</h2>
          <AddAssignment projectId={id} onSaved={reload} />
        </div>
        {detail.assignments.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">Sin técnicos asignados.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {detail.assignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-zinc-800">
                  {a.technician_name}
                  <span className="ml-1 text-xs text-zinc-400">{a.role}</span>
                </span>
                <span className="text-xs text-zinc-400">{formatDateTime(a.assigned_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pantallas */}
      <ScreensSection projectId={id} detail={detail} onSaved={reload} />

      {/* History */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-800">Historial</h2>
        {detail.history.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">Sin cambios de estado.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {detail.history.map((h) => (
              <li key={h.id} className="flex items-start gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-zinc-300" />
                <div>
                  <p className="text-sm text-zinc-800">
                    <span className="font-medium">{h.changed_by_name}</span>{" "}
                    cambió de <Badge className="bg-zinc-100 text-zinc-600">{h.from_status ?? "Inicio"}</Badge> a{" "}
                    <Badge className="bg-zinc-100 text-zinc-600">{h.to_status}</Badge>
                    {h.reason && <span className="ml-1 text-zinc-500">— {h.reason}</span>}
                  </p>
                  <p className="text-xs text-zinc-400">{formatDateTime(h.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Cierre */}
      <ProjectClosure
        projectId={id}
        status={detail.project.status}
        closure={detail.closure as never}
        attachments={detail.attachments}
        onChanged={reload}
      />

      {/* Adjuntos */}
      <AttachmentsSection projectId={id} initial={detail.attachments} onChanged={reload} />

      {/* Comments */}
      <CommentSection kind="project" entityId={id} comments={detail.comments} onSaved={reload} />
    </div>
  );
}

/* ── Status changer ──────────────────────────────── */

function StatusChanger({ detail, onSaved }: { detail: ProjectDetail; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const p = detail.project;
  const next = PROJECT_TRANSITIONS[p.status] ?? [];
  if (next.length === 0) return null;

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      await fetchJson(`/api/projects/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason: reason || undefined }),
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PrimaryButton onClick={() => { setStatus(next[0]); setOpen(true); }}>Cambiar estado</PrimaryButton>
      {open && (
        <Modal open={true} onClose={() => setOpen(false)} title="Cambiar estado"
          footer={
            <>
              <SecondaryButton onClick={() => setOpen(false)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Confirmar"}</PrimaryButton>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Nuevo estado">
              <Select value={status} onChange={setStatus} options={next.map((s) => ({ value: s, label: projectStatusLabel(s) }))} />
            </Field>
            <Field label="Motivo / notas (opcional)">
              <TextInput value={reason} onChange={setReason} placeholder="Motivo del cambio" />
            </Field>
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

/* ── Health changer ──────────────────────────────── */

function HealthChanger({ detail, onSaved }: { detail: ProjectDetail; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<string>(detail.project.health_status);
  const [reason, setReason] = useState(detail.project.blocked_reason ?? "");
  const [nextAction, setNextAction] = useState(detail.project.next_action ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function openModal() {
    setHealth(detail.project.health_status);
    setReason(detail.project.blocked_reason ?? "");
    setNextAction(detail.project.next_action ?? "");
    setErr(null);
    setOpen(true);
  }

  async function submit() {
    setErr(null);
    if (health === "blocked" && (!reason.trim() || !nextAction.trim())) {
      setErr("Indica el motivo del bloqueo y la próxima acción.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { health_status: health };
      if (health === "blocked") {
        payload.blocked_reason = reason.trim();
        payload.next_action = nextAction.trim();
      }
      await fetchJson(`/api/projects/${detail.project.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SecondaryButton onClick={openModal}>Cambiar salud</SecondaryButton>
      {open && (
        <Modal open={true} onClose={() => setOpen(false)} title="Actualizar salud"
          footer={
            <>
              <SecondaryButton onClick={() => setOpen(false)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</PrimaryButton>
            </>
          }
        >
          <Field label="Estado de salud">
            <Select value={health} onChange={setHealth} options={HEALTH_OPTIONS.map((h) => ({ value: h, label: healthStatusLabel(h) }))} />
          </Field>
          {health === "blocked" && (
            <div className="mt-4 space-y-4">
              <Field label="Motivo del bloqueo">
                <Textarea value={reason} onChange={setReason} rows={2} placeholder="¿Por qué está bloqueado?" />
              </Field>
              <Field label="Próxima acción">
                <TextInput value={nextAction} onChange={setNextAction} placeholder="Siguiente paso concreto" />
              </Field>
            </div>
          )}
          {err && <p className="mt-3 text-xs text-red-600">{err}</p>}
        </Modal>
      )}
    </>
  );
}

/* ── Add phase ───────────────────────────────────── */

function AddPhase({ detail, onSaved }: { detail: ProjectDetail; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState(String(detail.phases.length + 1));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const phases = [
        ...detail.phases.map((ph) => ({ id: ph.id, name: ph.name, catalog_phase_id: ph.catalog_phase_id, sort_order: ph.sort_order, owner_id: ph.owner_id })),
        { name, sort_order: Number(sortOrder) || detail.phases.length + 1, planned_start_date: startDate || null, planned_end_date: endDate || null },
      ];
      await fetchJson(`/api/projects/${detail.project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ phases }),
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SecondaryButton onClick={() => setOpen(true)} className="text-xs px-2 py-1">Agregar fase</SecondaryButton>
      {open && (
        <Modal open={true} onClose={() => setOpen(false)} title="Nueva fase"
          footer={
            <>
              <SecondaryButton onClick={() => setOpen(false)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Agregar"}</PrimaryButton>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Nombre de la fase">
              <TextInput value={name} onChange={setName} placeholder="P. ej. Armado" />
            </Field>
            <Field label="Orden">
              <TextInput value={sortOrder} onChange={setSortOrder} type="number" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inicio planificado"><TextInput value={startDate} onChange={setStartDate} type="date" /></Field>
              <Field label="Fin planificado"><TextInput value={endDate} onChange={setEndDate} type="date" /></Field>
            </div>
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

/* ── Mark phases not applicable ──────────────────── */

function NotApplicableChecklist({ detail, onSaved }: { detail: ProjectDetail; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [origStatus, setOrigStatus] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function openModal() {
    const initial: Record<string, boolean> = {};
    const orig: Record<string, string> = {};
    for (const ph of detail.phases) {
      initial[ph.id] = ph.status === "not_applicable";
      orig[ph.id] = ph.status;
    }
    setChecked(initial);
    setOrigStatus(orig);
    setErr(null);
    setOpen(true);
  }

  function handleCheck(id: string, checked: boolean) {
    setChecked((c) => ({ ...c, [id]: checked }));
    if (checked) {
      // Al marcar N/A, guardamos el estado actual como el que se restaurará al desmarcar
      setOrigStatus((o) => ({ ...o, [id]: detail.phases.find((p) => p.id === id)?.status ?? "not_started" }));
    }
  }

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      const phases = detail.phases
        .filter((ph) => (checked[ph.id] ?? false) !== (ph.status === "not_applicable"))
        .map((ph) => ({
          id: ph.id,
          status: checked[ph.id] ? "not_applicable" : (origStatus[ph.id] ?? "not_started"),
        }));
      if (phases.length === 0) {
        setOpen(false);
        onSaved();
        return;
      }
      await fetchJson(`/api/projects/${detail.project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ phases }),
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SecondaryButton onClick={openModal} className="px-2 py-1 text-xs">Marcar no aplican</SecondaryButton>
      {open && (
        <Modal open={true} onClose={() => setOpen(false)} title="Fases que no aplican"
          footer={
            <>
              <SecondaryButton onClick={() => setOpen(false)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</PrimaryButton>
            </>
          }
        >
          <p className="mb-3 text-[11px] text-zinc-400">
            Marca las fases que no aplican para este proyecto. Al guardar se marcan como «No aplica»; al desmarcarlas recuperan su estado anterior.
          </p>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {detail.phases.length === 0 ? (
              <p className="text-sm text-zinc-400">No hay fases registradas.</p>
            ) : (
              detail.phases.map((ph) => (
                <label key={ph.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-zinc-200 px-3 py-2 hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    checked={checked[ph.id] ?? false}
                    onChange={(e) => handleCheck(ph.id, e.target.checked)}
                    className="h-4 w-4 accent-zinc-900"
                  />
                  <span className="flex-1 text-sm text-zinc-800">{ph.name}</span>
                  {ph.status === "not_applicable" && <Badge className="bg-zinc-100 text-zinc-500">No aplica</Badge>}
                </label>
              ))
            )}
          </div>
          {err && <p className="mt-3 text-xs text-red-600">{err}</p>}
        </Modal>
      )}
    </>
  );
}

/* ── Edit phase status ───────────────────────────── */

function EditPhase({ detail, phase, onSaved }: { detail: ProjectDetail; phase: ProjectPhase; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string>(phase.status);
  const [startDate, setStartDate] = useState<string>(phase.planned_start_date ?? "");
  const [endDate, setEndDate] = useState<string>(phase.planned_end_date ?? "");
  const [reason, setReason] = useState(phase.blocked_reason ?? "");
  const [nextAction, setNextAction] = useState(phase.next_action ?? "");
  const [nextActionDate, setNextActionDate] = useState(phase.next_action_date ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function ymd(v: string | null | undefined): string {
    return v ? String(v).slice(0, 10) : "";
  }

  function openModal() {
    setStatus(phase.status);
    setStartDate(ymd(phase.planned_start_date));
    setEndDate(ymd(phase.planned_end_date));
    setReason(phase.blocked_reason ?? "");
    setNextAction(phase.next_action ?? "");
    setNextActionDate(ymd(phase.next_action_date));
    setErr(null);
    setOpen(true);
  }

  async function submit() {
    setErr(null);
    if (status === "blocked" && (!reason.trim() || !nextAction.trim())) {
      setErr("Indica el motivo del bloqueo y la próxima acción.");
      return;
    }
    setSaving(true);
    try {
      const phases = detail.phases.map((ph) => ({
        id: ph.id,
        name: ph.name,
        catalog_phase_id: ph.catalog_phase_id,
        sort_order: ph.sort_order,
        owner_id: ph.owner_id,
        ...(ph.id === phase.id
          ? {
              status,
              planned_start_date: startDate || null,
              planned_end_date: endDate || null,
              blocked_reason: status === "blocked" ? reason.trim() : null,
              next_action: status === "blocked" ? nextAction.trim() : null,
              next_action_date: status === "blocked" ? nextActionDate || null : null,
            }
          : {}),
      }));
      await fetchJson(`/api/projects/${detail.project.id}`, {
        method: "PATCH",
        body: JSON.stringify({ phases }),
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SecondaryButton onClick={openModal} className="px-2 py-1 text-xs">
        Actualizar
      </SecondaryButton>
      {open && (
        <Modal open={true} onClose={() => setOpen(false)} title={`Editar fase: ${phase.name}`}
          footer={
            <>
              <SecondaryButton onClick={() => setOpen(false)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</PrimaryButton>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Estado de la fase">
              <Select value={status} onChange={setStatus} options={PHASE_STATUS_OPTIONS.map((s) => ({ value: s, label: phaseStatusLabel(s) }))} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Inicio planificado">
                <TextInput value={startDate} onChange={setStartDate} type="date" />
              </Field>
              <Field label="Fin planificado">
                <TextInput value={endDate} onChange={setEndDate} type="date" />
              </Field>
            </div>
            <p className="text-[11px] text-zinc-400">Las fases pueden traslaparse: define fechas propias por fase aunque otra aún siga activa.</p>
            {status === "blocked" && (
              <div className="space-y-4">
                <Field label="Motivo del bloqueo">
                  <Textarea value={reason} onChange={setReason} rows={2} placeholder="¿Por qué está bloqueada esta fase?" />
                </Field>
                <Field label="Próxima acción">
                  <TextInput value={nextAction} onChange={setNextAction} placeholder="Siguiente paso concreto" />
                </Field>
                <Field label="Fecha de la próxima acción">
                  <TextInput value={nextActionDate} onChange={setNextActionDate} type="date" />
                </Field>
              </div>
            )}
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

/* ── Add assignment ──────────────────────────────── */

function AddAssignment({ projectId, onSaved }: { projectId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [techId, setTechId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchJson<TechniciansResponse>("/api/technicians")
        .then((d) => setTechs(d.technicians))
        .catch(() => {});
    }
  }, [open]);

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      await fetchJson("/api/assignments", {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, technician_id: techId }),
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SecondaryButton onClick={() => setOpen(true)} className="text-xs px-2 py-1">Asignar técnico</SecondaryButton>
      {open && (
        <Modal open={true} onClose={() => setOpen(false)} title="Asignar técnico"
          footer={
            <>
              <SecondaryButton onClick={() => setOpen(false)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={submit} disabled={saving || !techId}>{saving ? "Guardando…" : "Asignar"}</PrimaryButton>
            </>
          }
        >
          <Field label="Técnico">
            <Select
              value={techId}
              onChange={setTechId}
              placeholder="Seleccionar técnico…"
              options={techs.map((t) => ({ value: t.id, label: `${t.display_name} (${t.email ?? (t.username ? "@" + t.username : "sin correo")})` }))}
            />
          </Field>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <p className="mt-2 text-[11px] text-zinc-400">
            Si el técnico ya tiene una asignación activa en este proyecto, se reemplazará.
          </p>
        </Modal>
      )}
    </>
  );
}
/* ── Pantallas a instalar ─────────────────── */

interface ScreenPatchInput {
  id?: string;
  screen_type: string;
  environment: string | null;
  quantity: number;
  width_m: number | null;
  height_m: number | null;
  is_irregular: boolean;
  area_m2: number | null;
  pitch_mm: number | null;
  _deleted?: boolean;
}

function ScreensSection({ projectId, detail, onSaved }: { projectId: string; detail: ProjectDetail; onSaved: () => void }) {
  const [editing, setEditing] = useState<ProjectScreen | "new" | null>(null);

  function buildPayload(update?: { id: string; patch: Omit<ScreenPatchInput, "id" | "_deleted"> }): ScreenPatchInput[] {
    return detail.screens.map((s): ScreenPatchInput =>
      update && s.id === update.id
        ? { id: s.id, ...update.patch }
        : {
            id: s.id,
            screen_type: s.screen_type,
            environment: s.environment,
            quantity: s.quantity,
            width_m: s.width_m,
            height_m: s.height_m,
            is_irregular: s.is_irregular,
            area_m2: s.area_m2,
            pitch_mm: s.pitch_mm,
          }
    );
  }

  async function save(screen: ProjectScreen | null, patch: Omit<ScreenPatchInput, "id" | "_deleted">) {
    const screens = screen ? buildPayload({ id: screen.id, patch }) : [...buildPayload(), { ...patch }];
    await fetchJson(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ screens }),
    });
    onSaved();
  }

  async function remove(screen: ProjectScreen) {
    if (!confirm(`¿Eliminar la pantalla "${screen.screen_type}"?`)) return;
    const screens = buildPayload().map((s) =>
      s.id === screen.id ? { ...s, _deleted: true } : s
    );
    await fetchJson(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ screens }),
    });
    onSaved();
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-800">Pantallas a instalar</h2>
        <ScreenForm
          editing={editing}
          setEditing={setEditing}
          onSaved={save}
        />
      </div>
      {detail.screens.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">No hay pantallas registradas.</p>
      ) : (
        <div className="mt-3 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Descripción</th>
                <th className="px-3 py-2 text-center">Cantidad</th>
                <th className="px-3 py-2 text-left">Dimensiones</th>
                <th className="px-3 py-2 text-right">Pitch (mm)</th>
                <th className="px-3 py-2 text-right">m² (total)</th>
                <th className="px-3 py-2 text-left">Ficha PDF</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {detail.screens.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50 align-top">
                  <td className="px-3 py-2">
                    {s.environment === "exterior" ? (
                      <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Exterior</span>
                    ) : s.environment === "interior" ? (
                      <span className="inline-block rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">Interior</span>
                    ) : s.environment === "semi_exterior" ? (
                      <span className="inline-block rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">Semi Exterior</span>
                    ) : s.environment === "interior_flexible" ? (
                      <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">Interior Flexible</span>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-zinc-800">{s.screen_type}</td>
                  <td className="px-3 py-2 text-center text-zinc-700">{s.quantity}</td>
                  <td className="px-3 py-2 text-zinc-600">
                    {s.is_irregular
                      ? (s.area_m2 ? `${formatNum(s.area_m2)} m²` : "Irregular —")
                      : s.width_m && s.height_m
                        ? `${formatNum(s.width_m)} × ${formatNum(s.height_m)} m`
                        : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-600">
                    {s.pitch_mm ? `${formatNum(s.pitch_mm)} mm` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-zinc-800">
                    {s.m2 > 0 ? `${formatNum(s.m2 * s.quantity)} m²` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <ScreenPdf screen={s} onChanged={onSaved} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditing(s)}
                        className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => remove(s)}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatNum(v: number): string {
  return String(Number.isInteger(v) ? v : Math.round(v * 100) / 100);
}

function ScreenForm({
  editing,
  setEditing,
  onSaved,
}: {
  editing: ProjectScreen | "new" | null;
  setEditing: (s: ProjectScreen | "new" | null) => void;
  onSaved: (screen: ProjectScreen | null, patch: Omit<ScreenPatchInput, "id" | "_deleted">) => Promise<void>;
}) {
  return (
    <>
      <SecondaryButton onClick={() => setEditing("new")} className="text-xs px-2 py-1">Agregar pantalla</SecondaryButton>
      {editing && (
        <ScreenModal
          key={editing === "new" ? "new" : editing.id}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

function ScreenModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: ProjectScreen | "new";
  onClose: () => void;
  onSaved: (screen: ProjectScreen | null, patch: Omit<ScreenPatchInput, "id" | "_deleted">) => Promise<void>;
}) {
  const [screenType, setScreenType] = useState(editing === "new" ? "" : editing.screen_type);
  const [environment, setEnvironment] = useState(editing === "new" ? "" : editing.environment ?? "");
  const [quantity, setQuantity] = useState(editing === "new" ? "1" : String(editing.quantity));
  const [irregular, setIrregular] = useState<boolean>(editing !== "new" && editing.is_irregular);
  const [width, setWidth] = useState(editing === "new" ? "" : editing.width_m ? String(editing.width_m) : "");
  const [height, setHeight] = useState(editing === "new" ? "" : editing.height_m ? String(editing.height_m) : "");
  const [area, setArea] = useState(editing === "new" ? "" : editing.area_m2 ? String(editing.area_m2) : "");
  const [pitch, setPitch] = useState(editing === "new" ? "" : editing.pitch_mm ? String(editing.pitch_mm) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (environment !== "exterior" && environment !== "interior" && environment !== "semi_exterior" && environment !== "interior_flexible") {
      setErr("Selecciona el tipo: Exterior, Interior, Semi Exterior o Interior Flexible");
      return;
    }
    if (!screenType.trim()) {
      setErr("Indica la descripción de la pantalla");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setErr("Cantidad debe ser un número > 0");
      return;
    }
    const patch: Omit<ScreenPatchInput, "id" | "_deleted"> = {
      screen_type: screenType.trim(),
      environment: environment === "exterior" || environment === "interior" ? environment : null,
      quantity: qty,
      width_m: null,
      height_m: null,
      is_irregular: irregular,
      area_m2: null,
      pitch_mm: null,
    };
    if (irregular) {
      const a = Number(area);
      if (Number.isFinite(a) && a > 0) patch.area_m2 = a;
      else {
        setErr("Para pantalla irregular indica el área total (m²)");
        return;
      }
    } else {
      const w = Number(width);
      const h = Number(height);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        setErr("Indica ancho y alto (m) de la pantalla");
        return;
      }
      patch.width_m = w;
      patch.height_m = h;
    }
    const p = Number(pitch);
    if (pitch.trim() && (Number.isFinite(p) && p >= 0)) {
      patch.pitch_mm = p;
    } else if (pitch.trim() && (!Number.isFinite(p) || p < 0)) {
      setErr("Pitch debe ser un número ≥ 0");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const item = editing === "new" ? null : editing;
      await onSaved(item, patch);
      onClose();
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose}
      title={editing === "new" ? "Nueva pantalla" : "Editar pantalla"}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Tipo">
          <Select
            value={environment}
            onChange={setEnvironment}
            placeholder="Selecciona…"
            options={[
              { value: "exterior", label: "Exterior" },
              { value: "interior", label: "Interior" },
              { value: "semi_exterior", label: "Semi Exterior" },
              { value: "interior_flexible", label: "Interior Flexible" },
            ]}
          />
        </Field>
        <Field label="Descripción">
          <TextInput value={screenType} onChange={setScreenType} placeholder="P. ej. LED interior" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cantidad">
            <TextInput value={quantity} onChange={setQuantity} type="number" />
          </Field>
          <Field label="Forma">
            <div className="flex overflow-hidden rounded-md border border-zinc-300 text-sm">
              <button
                type="button"
                onClick={() => setIrregular(false)}
                className={`flex-1 px-2 py-1.5 ${!irregular ? "bg-sky-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
              >
                Regular
              </button>
              <button
                type="button"
                onClick={() => setIrregular(true)}
                className={`flex-1 px-2 py-1.5 ${irregular ? "bg-sky-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
              >
                Irregular
              </button>
            </div>
          </Field>
        </div>
        {irregular ? (
          <Field label="Área total (m²)">
            <TextInput value={area} onChange={setArea} type="number" placeholder="P. ej. 12.5" />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ancho (m)">
              <TextInput value={width} onChange={setWidth} type="number" placeholder="P. ej. 2.5" />
            </Field>
            <Field label="Alto (m)">
              <TextInput value={height} onChange={setHeight} type="number" placeholder="P. ej. 1.5" />
            </Field>
          </div>
        )}
        <Field label="Pitch (mm)">
          <TextInput value={pitch} onChange={setPitch} type="number" placeholder="P. ej. 1.5" />
        </Field>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}

// Mutex global para evitar subidas concurrentes (reloads múltiples)
let uploadMutex = Promise.resolve();

function ScreenPdf({ screen, onChanged }: { screen: ProjectScreen; onChanged: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const MAX_BYTES = 25 * 1024 * 1024;

  async function upload(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setErr("Solo se permiten archivos PDF");
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr(`El archivo supera 25 MB (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
      return;
    }
    if (uploading) return;

    // Serializa subidas para evitar reloads concurrentes
    setUploading(true);
    setErr(null);
    try {
      await uploadMutex;
      const form = new FormData();
      form.append("file", file);
      form.append("screen_id", screen.id);
      await uploadFetch(`/api/attachments`, form);
      onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      setUploading(false);
      uploadMutex = Promise.resolve(); // libera mutex
    }
  }

  async function remove(a: ProjectAttachment) {
    if (!confirm(`¿Eliminar el documento "${a.file_name}"?`)) return;
    await fetchJson(`/api/attachments/${a.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="space-y-1">
      {screen.attachment.length === 0 ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="rounded border border-dashed border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50"
        >
          {uploading ? "Subiendo…" : "+ Ficha PDF"}
        </button>
      ) : (
        <ul className="space-y-1">
          {screen.attachment.map((a) => (
            <li key={a.id} className="flex items-center gap-1 text-xs">
              <a
                href={`/api/attachments/${a.id}/download`}
                className="max-w-[140px] truncate text-sky-700 underline-offset-2 hover:underline"
                title={a.file_name}
              >
                {a.file_name}
              </a>
              <button
                onClick={() => remove(a)}
                className="text-red-600 hover:underline"
                title="Eliminar documento"
              >
                ✕
              </button>
            </li>
          ))}
          <li>
            <button
              onClick={() => inputRef.current?.click()}
              className="text-xs text-sky-700 hover:underline"
            >
              {uploading ? "Subiendo…" : "+ Adjuntar PDF"}
            </button>
          </li>
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

async function uploadFetch(url: string, form: FormData) {
  const res = await fetch(url, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return data;
}

/* ── Edit project name ─────────────────────────────── */

function EditProjectName({ projectId, currentName, onSaved }: { projectId: string; currentName: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function openModal() {
    setName(currentName);
    setErr(null);
    setOpen(true);
  }

  async function submit() {
    if (!name.trim()) {
      setErr("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await fetchJson(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button onClick={openModal} className="text-zinc-400 hover:text-zinc-600 p-1" title="Editar nombre">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
      </button>
      {open && (
        <Modal open={true} onClose={() => setOpen(false)} title="Editar nombre del proyecto"
          footer={
            <>
              <SecondaryButton onClick={() => setOpen(false)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</PrimaryButton>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Nombre del proyecto">
              <TextInput value={name} onChange={setName} placeholder="Nombre del proyecto" />
            </Field>
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

/* ── Solicitar / cancelar eliminación ───────────────── */

function DeletionRequest({ detail, onSaved }: { detail: ProjectDetail; onSaved: () => void }) {
  const p = detail.project;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pending = Boolean(p.deletion_requested_at);

  async function request() {
    if (!reason.trim()) { setErr("El motivo es obligatorio"); return; }
    setSaving(true); setErr(null);
    try {
      await fetchJson(`/api/projects/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ request_deletion: true, deletion_reason: reason.trim() }),
      });
      setOpen(false);
      onSaved();
    } catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  }

  async function cancel() {
    if (!confirm("¿Cancelar la solicitud de eliminación?")) return;
    setSaving(true);
    try {
      await fetchJson(`/api/projects/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ cancel_deletion: true }),
      });
      onSaved();
    } catch (e) { alert(String(e)); }
    finally { setSaving(false); }
  }

  if (pending) {
    return (
      <button
        onClick={cancel}
        disabled={saving}
        className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
      >
        Cancelar solicitud de eliminación
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => { setReason(""); setErr(null); setOpen(true); }}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
      >
        Solicitar eliminación
      </button>
      {open && (
        <Modal
          open={true}
          onClose={() => setOpen(false)}
          title="Solicitar eliminación del proyecto"
          footer={
            <>
              <SecondaryButton onClick={() => setOpen(false)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={request} disabled={saving} className="bg-red-600 hover:bg-red-700 border-red-600">
                {saving ? "Enviando…" : "Solicitar eliminación"}
              </PrimaryButton>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              La solicitud quedará pendiente hasta que un <strong>administrador la apruebe</strong>.
              El proyecto no se eliminará hasta entonces.
            </p>
            <Field label="Motivo (obligatorio)">
              <Textarea
                value={reason}
                onChange={setReason}
                rows={3}
                placeholder="Explica por qué debe eliminarse este proyecto…"
              />
            </Field>
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
