"use client";

import { useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { Badge, PrimaryButton, SecondaryButton, Spinner, Select, TextInput, Textarea, Modal, Field } from "@/app/components/ui";

const PRIORITY_LABEL: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};
const PRIORITY_TONE: Record<string, string> = {
  low: "bg-zinc-100 text-zinc-600",
  medium: "bg-sky-100 text-sky-700",
  high: "bg-amber-100 text-amber-700",
  critical: "bg-rose-100 text-rose-700",
};
const CATEGORY_LABEL: Record<string, string> = {
  feature: "Función",
  bug: "Error",
  ux: "UX",
  other: "Otro",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Abierta",
  in_progress: "En progreso",
  done: "Resuelta",
  wontfix: "No se hará",
};
const STATUS_TONE: Record<string, string> = {
  open: "bg-sky-100 text-sky-700",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
  wontfix: "bg-zinc-100 text-zinc-500",
};

interface Improvement {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  reporter_name: string | null;
  reporter_email: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  resolution: string | null;
}

interface ImprovementsResponse {
  improvements: Improvement[];
}

export default function MejorasPage() {
  const { data, error } = useResource<ImprovementsResponse>("/api/improvements");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Improvement | null>(null);

  // Apply filters client-side for simplicity (could be server-side)
  const filtered = data?.improvements.filter((i) => {
    if (statusFilter && i.status !== statusFilter) return false;
    if (categoryFilter && i.category !== categoryFilter) return false;
    if (priorityFilter && i.priority !== priorityFilter) return false;
    return true;
  }) ?? [];

  const unreadCount = data?.improvements.filter((i) => i.status === "open").length ?? 0;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Mejoras y feedback</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {data?.improvements.length ?? 0} items · {unreadCount} abiertas
          </p>
        </div>
        <PrimaryButton onClick={() => setShowCreate(true)}>Nueva mejora</PrimaryButton>
      </div>

      {/* Filtros */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Select value={statusFilter} onChange={setStatusFilter} placeholder="Estado" options={[
          { value: "", label: "Todos los estados" },
          { value: "open", label: "Abierta" },
          { value: "in_progress", label: "En progreso" },
          { value: "done", label: "Resuelta" },
          { value: "wontfix", label: "No se hará" },
        ]} />
        <Select value={categoryFilter} onChange={setCategoryFilter} placeholder="Categoría" options={[
          { value: "", label: "Todas" },
          { value: "feature", label: "Función" },
          { value: "bug", label: "Error" },
          { value: "ux", label: "UX" },
          { value: "other", label: "Otro" },
        ]} />
        <Select value={priorityFilter} onChange={setPriorityFilter} placeholder="Prioridad" options={[
          { value: "", label: "Todas" },
          { value: "critical", label: "Crítica" },
          { value: "high", label: "Alta" },
          { value: "medium", label: "Media" },
          { value: "low", label: "Baja" },
        ]} />
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mt-4">
        {!data && !error ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-zinc-500">
            No hay mejoras que coincidan con los filtros.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">Título</th>
                  <th className="px-3 py-2 text-left">Categoría</th>
                  <th className="px-3 py-2 text-left">Prioridad</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-left">Asignado</th>
                  <th className="px-3 py-2 text-left">Reporter</th>
                  <th className="px-3 py-2 text-left">Creado</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map((imp) => (
                  <tr key={imp.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-2 font-medium text-zinc-800 max-w-xs truncate" title={imp.title}>
                      {imp.title}
                    </td>
                    <td className="px-3 py-2">
                      <Badge className="bg-zinc-100 text-zinc-600">{CATEGORY_LABEL[imp.category] ?? imp.category}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={PRIORITY_TONE[imp.priority] ?? "bg-zinc-100 text-zinc-600"}>
                        {PRIORITY_LABEL[imp.priority] ?? imp.priority}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={STATUS_TONE[imp.status] ?? "bg-zinc-100 text-zinc-600"}>
                        {STATUS_LABEL[imp.status] ?? imp.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-zinc-600">{imp.assigned_to_name ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600">
                      {imp.reporter_name ?? "Anónimo"}
                      {imp.reporter_email && <span className="ml-1 text-xs text-zinc-400">({imp.reporter_email})</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500">{imp.created_at.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setEditing(imp)}
                        className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <Modal open={true} onClose={() => setShowCreate(false)} title="Nueva mejora">
          <CreateForm onClose={() => setShowCreate(false)} />
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal open={true} onClose={() => setEditing(null)} title={`Editar: ${editing.title}`}>
          <EditForm improvement={editing} onClose={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}

/* ── Create form ─────────────────────────────────────── */

function CreateForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("feature");
  const [priority, setPriority] = useState("medium");
  const [reporter_name, setReporterName] = useState("");
  const [reporter_email, setReporterEmail] = useState("");

  async function handleSubmit() {
    if (!title.trim()) { alert("Título obligatorio"); return; }
    try {
      await fetchJson("/api/improvements", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null, category, priority, reporter_name: reporter_name.trim() || null, reporter_email: reporter_email.trim() || null }),
      });
      onClose();
      window.location.reload();
    } catch (e) {
      alert(String(e));
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Título">
        <TextInput value={title} onChange={setTitle} placeholder="Título de la mejora" />
      </Field>
      <Field label="Descripción">
        <Textarea value={description} onChange={setDescription} rows={4} placeholder="Detalle..." />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría">
          <Select value={category} onChange={setCategory} options={[
            { value: "feature", label: "Función" },
            { value: "bug", label: "Error" },
            { value: "ux", label: "UX" },
            { value: "other", label: "Otro" },
          ]} />
        </Field>
        <Field label="Prioridad">
          <Select value={priority} onChange={setPriority} options={[
            { value: "low", label: "Baja" },
            { value: "medium", label: "Media" },
            { value: "high", label: "Alta" },
            { value: "critical", label: "Crítica" },
          ]} />
        </Field>
      </div>
      <Field label="Tu nombre (opcional)">
        <TextInput value={reporter_name} onChange={setReporterName} placeholder="Tu nombre" />
      </Field>
      <Field label="Tu email (opcional)">
        <TextInput type="email" value={reporter_email} onChange={setReporterEmail} placeholder="tu@email.com" />
      </Field>
      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
        <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
        <PrimaryButton onClick={handleSubmit}>Guardar</PrimaryButton>
      </div>
    </div>
  );
}

/* ── Edit form ───────────────────────────────────────── */

function EditForm({
  improvement,
  onClose,
}: {
  improvement: Improvement;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(improvement.title);
  const [description, setDescription] = useState(improvement.description ?? "");
  const [category, setCategory] = useState(improvement.category);
  const [priority, setPriority] = useState(improvement.priority);
  const [status, setStatus] = useState(improvement.status);
  const [resolution, setResolution] = useState(improvement.resolution ?? "");
  const [closeFlag, setCloseFlag] = useState(false);

  async function handleSubmit() {
    if (!title.trim()) { alert("Título obligatorio"); return; }
    if (closeFlag && !resolution.trim()) { alert("Resolución obligatoria al cerrar"); return; }
    try {
      await fetchJson(`/api/improvements/${improvement.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          category,
          priority,
          status: closeFlag ? (status === "wontfix" ? "wontfix" : "done") : status,
          resolution: closeFlag ? resolution.trim() : null,
          close_improvement: closeFlag,
        }),
      });
      onClose();
      window.location.reload();
    } catch (e) {
      alert(String(e));
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Título"><TextInput value={title} onChange={setTitle} placeholder="Título" /></Field>
      <Field label="Descripción"><Textarea value={description} onChange={setDescription} rows={4} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría">
          <Select value={category} onChange={setCategory} options={[
            { value: "feature", label: "Función" },
            { value: "bug", label: "Error" },
            { value: "ux", label: "UX" },
            { value: "other", label: "Otro" },
          ]} />
        </Field>
        <Field label="Prioridad">
          <Select value={priority} onChange={setPriority} options={[
            { value: "low", label: "Baja" },
            { value: "medium", label: "Media" },
            { value: "high", label: "Alta" },
            { value: "critical", label: "Crítica" },
          ]} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Estado">
          <Select value={status} onChange={setStatus} options={[
            { value: "open", label: "Abierta" },
            { value: "in_progress", label: "En progreso" },
            { value: "done", label: "Resuelta" },
            { value: "wontfix", label: "No se hará" },
          ]} />
        </Field>
        <Field label="Cerrar (requiere resolución)">
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={closeFlag} onChange={(e) => setCloseFlag(e.target.checked)} className="h-4 w-4" />
            <label className="text-sm text-zinc-700 cursor-pointer">Marcar como cerrada</label>
          </div>
        </Field>
      </div>
      {closeFlag && (
        <Field label="Resolución (obligatoria)">
          <Textarea value={resolution} onChange={setResolution} rows={3} placeholder="Qué se hizo, decisión, etc." />
        </Field>
      )}
      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
        <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
        <PrimaryButton onClick={handleSubmit}>Guardar</PrimaryButton>
      </div>
    </div>
  );
}