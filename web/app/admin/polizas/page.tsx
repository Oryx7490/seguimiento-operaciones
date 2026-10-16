"use client";

import { useMemo, useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { Badge, EmptyState, Field, Modal, PrimaryButton, SecondaryButton, Select, Spinner, TextInput } from "@/app/components/ui";
import ClientSelect from "@/app/components/client-select";

interface Policy {
  id: string;
  client_id: string;
  client_name: string;
  location_id: string | null;
  location_name: string | null;
  name: string;
  policy_type: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  notes: string | null;
  activity_count: number;
}

interface Client {
  id: string;
  name: string;
}
interface Location {
  id: string;
  name: string | null;
  client_id: string;
  active: boolean;
}

const POLICY_TYPES = [
  { value: "content_changes", label: "Cambios de contenido" },
  { value: "corrective_preventive", label: "Mantenimiento correctivo y preventivo" },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(POLICY_TYPES.map((t) => [t.value, t.label]));
const STATUS_LABEL: Record<string, string> = { active: "Activa", paused: "Pausada", ended: "Terminada" };
const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  ended: "bg-zinc-100 text-zinc-500",
};

export default function MaintenancePoliciesPage() {
  const [status, setStatus] = useState("all");
  const { data, error, reload } = useResource<{ policies: Policy[] }>(`/api/maintenance-policies?status=${status}`);
  const [editing, setEditing] = useState<Policy | "new" | null>(null);

  const policies = data?.policies ?? [];
  const loading = !data && !error;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Pólizas de mantenimiento</h1>
          <p className="mt-1 text-sm text-zinc-500">Contratos de servicio recurrente por cliente (contenido o mantenimiento).</p>
        </div>
        <PrimaryButton onClick={() => setEditing("new")}>Nueva póliza</PrimaryButton>
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-4 flex gap-1">
        {[["all", "Todas"], ["active", "Activas"], ["paused", "Pausadas"], ["ended", "Terminadas"]].map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setStatus(v)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${status === v ? "bg-zinc-900 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-4"><Spinner /></div>
        ) : policies.length === 0 ? (
          <div className="p-4"><EmptyState title="No hay pólizas en este filtro" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2 text-left">Cliente</th>
                  <th className="px-4 py-2 text-left">Póliza</th>
                  <th className="px-4 py-2 text-left">Tipo</th>
                  <th className="px-4 py-2 text-left">Vigencia</th>
                  <th className="px-4 py-2 text-center">Estado</th>
                  <th className="px-4 py-2 text-center">Actividades</th>
                  <th className="px-4 py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {policies.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-2 font-medium text-zinc-800">{p.client_name}</td>
                    <td className="px-4 py-2 text-zinc-700">
                      {p.name}
                      {p.location_name && <div className="text-[11px] text-zinc-400">{p.location_name}</div>}
                    </td>
                    <td className="px-4 py-2 text-zinc-600">{TYPE_LABEL[p.policy_type] ?? p.policy_type}</td>
                    <td className="px-4 py-2 text-zinc-500">{p.start_date ?? "—"} {p.end_date ? `→ ${p.end_date}` : ""}</td>
                    <td className="px-4 py-2 text-center">
                      <Badge className={STATUS_STYLE[p.status] ?? ""}>{STATUS_LABEL[p.status] ?? p.status}</Badge>
                    </td>
                    <td className="px-4 py-2 text-center text-zinc-500">{p.activity_count}</td>
                    <td className="px-4 py-2 text-right">
                      <SecondaryButton className="px-2 py-1 text-xs" onClick={() => setEditing(p)}>Editar</SecondaryButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <PolicyModal
          policy={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function PolicyModal({ policy, onClose, onSaved }: { policy: Policy | null; onClose: () => void; onSaved: () => void }) {
  const locationsRes = useResource<{ locations: Location[] }>("/api/locations");

  const [clientId, setClientId] = useState(policy?.client_id ?? "");
  const [locationId, setLocationId] = useState(policy?.location_id ?? "");
  const [name, setName] = useState(policy?.name ?? "");
  const [policyType, setPolicyType] = useState(policy?.policy_type ?? "content_changes");
  const [description, setDescription] = useState(policy?.description ?? "");
  const [startDate, setStartDate] = useState(policy?.start_date ?? "");
  const [endDate, setEndDate] = useState(policy?.end_date ?? "");
  const [status, setStatus] = useState(policy?.status ?? "active");
  const [notes, setNotes] = useState(policy?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const locationOptions = useMemo(
    () => (locationsRes.data?.locations ?? []).filter((l) => l.active && (!clientId || l.client_id === clientId)).map((l) => ({ value: l.id, label: l.name ?? "(sin nombre)" })),
    [locationsRes.data, clientId]
  );

  async function submit() {
    if (!clientId) return setErr("Selecciona el cliente");
    if (!name.trim()) return setErr("El nombre es obligatorio");
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        client_id: clientId,
        location_id: locationId || null,
        name,
        policy_type: policyType,
        description: description || null,
        start_date: startDate || null,
        end_date: endDate || null,
        status,
        notes: notes || null,
      };
      if (policy) {
        await fetchJson(`/api/maintenance-policies/${policy.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await fetchJson(`/api/maintenance-policies`, { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={policy ? "Editar póliza" : "Nueva póliza"}
      mark="W63"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</PrimaryButton>
        </>
      }
      wide
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente">
            <ClientSelect value={clientId} onChange={(v) => { setClientId(v); setLocationId(""); }} placeholder="Buscar cliente…" />
          </Field>
          <Field label="Ubicación (opcional)">
            <Select value={locationId} onChange={setLocationId} placeholder="— Sin ubicación —" options={locationOptions} />
          </Field>
        </div>
        <Field label="Nombre de la póliza">
          <TextInput value={name} onChange={setName} placeholder="P. ej. Póliza de contenido 2026" />
        </Field>
        <Field label="Tipo de póliza">
          <Select value={policyType} onChange={setPolicyType} options={POLICY_TYPES} />
        </Field>
        <Field label="Descripción">
          <TextInput value={description} onChange={setDescription} placeholder="Alcance del servicio" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Inicio">
            <TextInput type="date" value={startDate} onChange={setStartDate} />
          </Field>
          <Field label="Fin (opcional)">
            <TextInput type="date" value={endDate} onChange={setEndDate} />
          </Field>
          <Field label="Estado">
            <Select value={status} onChange={setStatus} options={[{ value: "active", label: "Activa" }, { value: "paused", label: "Pausada" }, { value: "ended", label: "Terminada" }]} />
          </Field>
        </div>
        <Field label="Notas">
          <TextInput value={notes} onChange={setNotes} placeholder="Notas internas" />
        </Field>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}
