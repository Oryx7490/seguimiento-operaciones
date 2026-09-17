"use client";

import { useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { formatDateTime } from "@/app/lib/format";
import {
  Badge,
  EmptyState,
  Field,
  Modal,
  PrimaryButton,
  SecondaryButton,
  Spinner,
  TextInput,
} from "@/app/components/ui";
import type { Specialty, SpecialtyProposal } from "@/app/lib/types";

export default function SpecialtiesPage() {
  const { data, error, reload } = useResource<{ specialties: Specialty[] }>("/api/specialties?all=true");
  const proposalsRes = useResource<{ proposals: SpecialtyProposal[] }>("/api/specialties?pending=true");

  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Specialty | null>(null);

  const specialties = data?.specialties ?? [];
  const proposals = proposalsRes.data?.proposals ?? [];

  const reloadAll = () => {
    reload();
    proposalsRes.reload();
  };

  const create = async () => {
    if (!name.trim()) {
      setErr("Escribe el nombre de la habilidad");
      return;
    }
    setErr(null);
    try {
      await fetchJson("/api/specialties", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      setName("");
      reload();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    }
  };

  const toggle = async (s: Specialty) => {
    try {
      await fetchJson(`/api/specialties/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !s.active }),
      });
      reload();
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    }
  };

  const approve = async (p: SpecialtyProposal) => {
    try {
      await fetchJson(`/api/technicians/${p.technician_id}/specialties`, {
        method: "PATCH",
        body: JSON.stringify({ specialty_id: p.specialty_id, status: "approved" }),
      });
      reloadAll();
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    }
  };

  const reject = async (p: SpecialtyProposal) => {
    if (!confirm(`¿Rechazar la propuesta "${p.name}" de ${p.display_name}?`)) return;
    try {
      await fetchJson(`/api/technicians/${p.technician_id}/specialties?specialty_id=${p.specialty_id}`, {
        method: "DELETE",
      });
      reloadAll();
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-900">Especialidades y habilidades</h1>
      <p className="mt-1 max-w-2xl text-sm text-zinc-500">
        Catálogo que los técnicos eligen en su perfil. Cuando proponen una habilidad nueva, aparece
        aquí para que la apruebes o la rechaces.
      </p>

      <div className="mt-5 max-w-xl rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <Field label="Nueva habilidad" hint="Si ya existe (sin importar mayúsculas) se reactiva.">
          <div className="flex gap-2">
            <TextInput value={name} onChange={setName} placeholder="p. ej. Videowall" />
            <PrimaryButton onClick={create}>Agregar</PrimaryButton>
          </div>
        </Field>
        {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      </div>

      {proposals.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-zinc-700">
            Propuestas por aprobar ({proposals.length})
          </h2>
          <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-amber-700">
                <tr>
                  <th className="px-4 py-2 font-medium">Técnico</th>
                  <th className="px-4 py-2 font-medium">Habilidad</th>
                  <th className="px-4 py-2 font-medium">Solicitada</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100 bg-white">
                {proposals.map((p) => (
                  <tr key={`${p.technician_id}-${p.specialty_id}`}>
                    <td className="px-4 py-2 font-medium text-zinc-800">{p.display_name}</td>
                    <td className="px-4 py-2 text-zinc-700">{p.name}</td>
                    <td className="px-4 py-2 text-zinc-500">{formatDateTime(p.requested_at)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <PrimaryButton onClick={() => approve(p)}>Aprobar</PrimaryButton>
                        <SecondaryButton onClick={() => reject(p)}>Rechazar</SecondaryButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar el catálogo: {error}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        {!data ? (
          <Spinner className="py-10" />
        ) : specialties.length === 0 ? (
          <EmptyState title="Aún no hay habilidades en el catálogo" />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Habilidad</th>
                <th className="px-4 py-2 font-medium">Técnicos</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {specialties.map((s) => (
                <tr key={s.id} className={s.active ? "" : "bg-zinc-50 text-zinc-400"}>
                  <td className="px-4 py-2 font-medium text-zinc-800">{s.name}</td>
                  <td className="px-4 py-2 text-zinc-600">{s.technician_count}</td>
                  <td className="px-4 py-2">
                    {s.active ? (
                      <Badge className="bg-emerald-100 text-emerald-700">Activa</Badge>
                    ) : (
                      <Badge className="bg-zinc-200 text-zinc-600">Inactiva</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <SecondaryButton onClick={() => setEditing(s)}>Editar</SecondaryButton>
                      <SecondaryButton onClick={() => toggle(s)}>
                        {s.active ? "Desactivar" : "Activar"}
                      </SecondaryButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <EditModal
          specialty={editing}
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

function EditModal({
  specialty,
  onClose,
  onSaved,
}: {
  specialty: Specialty;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(specialty.name);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await fetchJson(`/api/specialties/${specialty.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      onSaved();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Editar habilidad"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </PrimaryButton>
        </>
      }
    >
      <Field label="Nombre">
        <TextInput value={name} onChange={setName} />
      </Field>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </Modal>
  );
}
