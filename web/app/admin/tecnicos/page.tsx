"use client";

import { useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import {
  Badge,
  DangerButton,
  EmptyState,
  Field,
  Modal,
  PrimaryButton,
  SecondaryButton,
  Spinner,
  TagInput,
  TextInput,
} from "@/app/components/ui";
import type { Technician, TechniciansResponse } from "@/app/lib/types";

const SPECIALTY_SUGGESTIONS = ["LED", "Cronometraje", "Audio", "Video", "Iluminación", "Pantallas", "Generador", "UPS"];

export default function TechniciansPage() {
  const [showInactive, setShowInactive] = useState(false);
  const { data, error, reload } = useResource<TechniciansResponse>(`/api/technicians${showInactive ? "?inactive=true" : ""}`);
  const [selected, setSelected] = useState<Technician | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const techs = data?.technicians ?? [];
  const loading = !data && !error;

  async function send(method: "PATCH" | "DELETE", t: Technician, body?: object) {
    try {
      await fetchJson(`/api/technicians/${t.id}`, { method, body: body ? JSON.stringify(body) : undefined });
      reload();
    } catch (e) {
      window.alert(String(e));
    }
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Técnicos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Personal de campo. Cada técnico tiene una cuenta de usuario asignada.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SecondaryButton onClick={() => setShowInactive((v) => !v)} className="px-3 py-2 text-sm">
            {showInactive ? "Ocultar inactivos" : "Ver inactivos"}
          </SecondaryButton>
          <PrimaryButton onClick={() => { setSelected(null); setModalOpen(true); }}>Nuevo técnico</PrimaryButton>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6">
        {loading ? (
          <Spinner />
        ) : techs.length === 0 ? (
          <EmptyState title="No hay técnicos registrados" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">Nombre</th>
                  <th className="px-4 py-3 text-left">Correo</th>
                  <th className="px-4 py-3 text-left">Teléfono</th>
                  <th className="px-4 py-3 text-left">Especialidades</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Zona horaria</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {techs.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-medium text-zinc-800">{t.display_name}</td>
                    <td className="px-4 py-3 text-zinc-600">{t.email}</td>
                    <td className="px-4 py-3 text-zinc-600">{t.phone ?? "—"}</td>
                    <td className="px-4 py-3">
                      {t.specialties.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {t.specialties.slice(0, 3).map((s) => (
                            <Badge key={s} className="bg-zinc-100 text-zinc-600">{s}</Badge>
                          ))}
                          {t.specialties.length > 3 && (
                            <span className="text-xs text-zinc-400">+{t.specialties.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.technician_active && t.user_active ? (
                        <Badge className="bg-emerald-100 text-emerald-700">Activo</Badge>
                      ) : (
                        <Badge className="bg-zinc-100 text-zinc-500">Inactivo</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{t.timezone}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <SecondaryButton onClick={() => { setSelected(t); setModalOpen(true); }} className="px-2 py-1 text-xs">
                          Editar
                        </SecondaryButton>
                        <SecondaryButton onClick={() => send("PATCH", t, { active: !t.technician_active })} className="px-2 py-1 text-xs">
                          {t.technician_active ? "Suspender" : "Activar"}
                        </SecondaryButton>
                        <DangerButton
                          onClick={() => {
                            if (window.confirm(`¿Desactivar al técnico "${t.display_name}"?`)) send("DELETE", t);
                          }}
                          className="px-2 py-1 text-xs"
                        >
                          Eliminar
                        </DangerButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <TechnicianModal
          key={selected?.id ?? "new"}
          tech={selected}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); reload(); }}
        />
      )}
    </div>
  );
}

function TechnicianModal({
  tech,
  onClose,
  onSaved,
}: {
  tech: Technician | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [displayName, setName] = useState(tech?.display_name ?? "");
  const [email, setEmail] = useState(tech?.email ?? "");
  const [phone, setPhone] = useState(tech?.phone ?? "");
  const [specialties, setSpecialties] = useState<string[]>(tech?.specialties ?? []);
  const [active, setActive] = useState(tech?.technician_active ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const url = tech ? `/api/technicians/${tech.id}` : "/api/technicians";
      await fetchJson(url, {
        method: tech ? "PATCH" : "POST",
        body: JSON.stringify({ display_name: displayName, email, phone, specialties, active }),
      });
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={tech ? "Editar técnico" : "Nuevo técnico"}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : tech ? "Guardar" : "Crear"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre visible">
          <TextInput value={displayName} onChange={setName} placeholder="Nombre completo" />
        </Field>
        <Field label="Correo electrónico" hint="Se usa como cuenta de acceso del técnico.">
          <TextInput value={email} onChange={setEmail} placeholder="correo@empresa.com" type="email" />
        </Field>
        <Field label="Teléfono">
          <TextInput value={phone} onChange={setPhone} placeholder="55 1234 5678" />
        </Field>
        <Field label="Especialidades" hint="Presiona Enter o coma para agregar cada una.">
          <TagInput tags={specialties} onChange={setSpecialties} suggestions={SPECIALTY_SUGGESTIONS} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
          Activo
        </label>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}