"use client";

import { useEffect, useState } from "react";
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
  ProjectDetail,
  ProjectPhase,
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

const PHASE_STATUS_OPTIONS = ["not_started", "in_progress", "completed", "blocked", "not_applicable"];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: detail, error, reload } = useResource<ProjectDetail>(`/api/projects/${id}`);

  if (!detail) return <div className="p-6">{error ? <p className="text-red-600">Error: {error}</p> : <Spinner />}</div>;
  const p = detail.project;

  return (
    <div className="max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-zinc-700">{p.code}</span>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900">{p.name}</h1>
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
      <div className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-zinc-400">Estado</p>
          <StatusBadge status={p.status} kind="project" />
        </div>
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
      </div>

      {/* Phases */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-800">Fases</h2>
          <AddPhase detail={detail} onSaved={reload} />
        </div>
        {detail.phases.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No hay fases registradas.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">Fase</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-left">Inicio</th>
                  <th className="px-3 py-2 text-left">Fin</th>
                  <th className="px-3 py-2 text-left">Responsable</th>
                  <th className="px-3 py-2 text-left">Bloqueo</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {detail.phases.map((ph) => (
                  <tr key={ph.id} className={ph.status === "not_applicable" ? "opacity-50" : "hover:bg-zinc-50"}>
                    <td className="px-3 py-2 font-medium text-zinc-800">{ph.name}</td>
                    <td className="px-3 py-2"><StatusBadge status={ph.status} kind="phase" /></td>
                    <td className="px-3 py-2 text-zinc-500">{formatDate(ph.planned_start_date)}</td>
                    <td className="px-3 py-2 text-zinc-500">{formatDate(ph.planned_end_date)}</td>
                    <td className="px-3 py-2 text-zinc-600">{ph.owner_name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-zinc-500">
                      {ph.status === "blocked"
                        ? [ph.blocked_reason, ph.next_action].filter(Boolean).join(" · ") || "—"
                        : "—"}
                    </td>
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