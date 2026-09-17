"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  TextInput,
} from "@/app/components/ui";
import type {
  Technician,
  TechniciansResponse,
  Specialty,
  TechnicianDetailResponse,
} from "@/app/lib/types";

export default function TechniciansPage() {
  const [showInactive, setShowInactive] = useState(false);
  const { data, error, reload } = useResource<TechniciansResponse>(
    `/api/technicians${showInactive ? "?inactive=true" : ""}`
  );
  const catalogRes = useResource<{ specialties: Specialty[] }>("/api/specialties");
  const [selected, setSelected] = useState<Technician | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const techs = data?.technicians ?? [];
  const catalog = catalogRes.data?.specialties ?? [];
  const loading = !data && !error;

  async function send(method: "PATCH" | "DELETE", t: Technician, body?: object) {
    try {
      await fetchJson(`/api/technicians/${t.id}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
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
            Personal de campo. Cada técnico tiene una cuenta de usuario y un expediente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SecondaryButton onClick={() => setShowInactive((v) => !v)} className="px-3 py-2 text-sm">
            {showInactive ? "Ocultar inactivos" : "Ver inactivos"}
          </SecondaryButton>
          <PrimaryButton onClick={() => { setSelected(null); setModalOpen(true); }}>
            Nuevo técnico
          </PrimaryButton>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
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
                  <th className="px-4 py-3 text-left">Correo / Usuario</th>
                  <th className="px-4 py-3 text-left">Teléfono</th>
                  <th className="px-4 py-3 text-left">Habilidades</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {techs.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-medium text-zinc-800">{t.display_name}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {t.email ?? (t.username ? `@${t.username}` : "—")}
                    </td>
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
                      {t.pending_specialties > 0 && (
                        <Badge className="ml-1 bg-amber-100 text-amber-700">
                          {t.pending_specialties} por aprobar
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.technician_active && t.user_active ? (
                        <Badge className="bg-emerald-100 text-emerald-700">Activo</Badge>
                      ) : (
                        <Badge className="bg-zinc-100 text-zinc-500">Inactivo</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/tecnicos/${t.id}`}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
                        >
                          Expediente
                        </Link>
                        <SecondaryButton
                          onClick={() => { setSelected(t); setModalOpen(true); }}
                          className="px-2 py-1 text-xs"
                        >
                          Editar
                        </SecondaryButton>
                        <SecondaryButton
                          onClick={() => send("PATCH", t, { active: !t.technician_active })}
                          className="px-2 py-1 text-xs"
                        >
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
          catalog={catalog}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); reload(); }}
        />
      )}
    </div>
  );
}

function TechnicianModal({
  tech,
  catalog,
  onClose,
  onSaved,
}: {
  tech: Technician | null;
  catalog: Specialty[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [displayName, setName] = useState(tech?.display_name ?? "");
  const [email, setEmail] = useState(tech?.email ?? "");
  const [username, setUsername] = useState(tech?.username ?? "");
  const [phone, setPhone] = useState(tech?.phone ?? "");
  const [nss, setNss] = useState(tech?.nss ?? "");
  const [curp, setCurp] = useState(tech?.curp ?? "");
  const [address, setAddress] = useState(tech?.address ?? "");
  const [emergencyName, setEmergencyName] = useState(tech?.emergency_contact_name ?? "");
  const [emergencyPhone, setEmergencyPhone] = useState(tech?.emergency_contact_phone ?? "");
  const [adminNotes, setAdminNotes] = useState(tech?.admin_notes ?? "");
  const [active, setActive] = useState(tech?.technician_active ?? true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newSkills, setNewSkills] = useState<string[]>([]);
  const [pendingSkills, setPendingSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!tech) return;
    let cancelled = false;
    fetchJson<TechnicianDetailResponse>(`/api/technicians/${tech.id}`)
      .then((d) => {
        if (!cancelled) {
          setSelectedIds(
            d.specialties.filter((s) => s.status === "approved").map((s) => s.specialty_id)
          );
          setPendingSkills(d.specialties.filter((s) => s.status === "pending").map((s) => s.name));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tech]);

  const toggleSkill = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const addNewSkill = () => {
    const value = newSkill.trim();
    if (!value) return;
    if (!newSkills.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setNewSkills((prev) => [...prev, value]);
    }
    setNewSkill("");
  };

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const url = tech ? `/api/technicians/${tech.id}` : "/api/technicians";
      await fetchJson(url, {
        method: tech ? "PATCH" : "POST",
        body: JSON.stringify({
          display_name: displayName,
          email,
          username,
          phone,
          nss,
          curp,
          address,
          emergency_contact_name: emergencyName,
          emergency_contact_phone: emergencyPhone,
          admin_notes: adminNotes,
          active,
          specialty_ids: selectedIds,
          specialty_names: newSkills,
        }),
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
      wide
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Correo electrónico (opcional)"
            hint="Si no tiene correo, asigna un usuario."
          >
            <TextInput value={email} onChange={setEmail} placeholder="correo@empresa.com" type="email" />
          </Field>
          <Field label="Usuario (opcional)" hint="3-30: letras, números, . _ -">
            <TextInput value={username} onChange={setUsername} placeholder="juan.perez" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teléfono">
            <TextInput value={phone} onChange={setPhone} placeholder="55 1234 5678" />
          </Field>
          <Field label="CURP">
            <TextInput value={curp} onChange={setCurp} placeholder="CURP" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="NSS">
            <TextInput value={nss} onChange={setNss} placeholder="Número de seguridad social" />
          </Field>
          <Field label="Dirección">
            <TextInput value={address} onChange={setAddress} placeholder="Calle, número, colonia, ciudad" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contacto de emergencia">
            <TextInput value={emergencyName} onChange={setEmergencyName} placeholder="Nombre" />
          </Field>
          <Field label="Teléfono de emergencia">
            <TextInput value={emergencyPhone} onChange={setEmergencyPhone} placeholder="55 1234 5678" />
          </Field>
        </div>

        <div>
          <p className="text-xs font-medium text-zinc-600">Habilidades</p>
          <p className="text-[11px] text-zinc-400">Toca para asignar o quitar del catálogo.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {catalog.map((s) => {
              const on = selectedIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSkill(s.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    on
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
            {catalog.length === 0 && <span className="text-xs text-zinc-400">Catálogo vacío</span>}
          </div>

          {newSkills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {newSkills.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => setNewSkills((prev) => prev.filter((x) => x !== s))}
                    className="text-amber-600 hover:text-amber-900"
                    aria-label={`Quitar ${s}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-2 flex gap-2">
            <TextInput
              value={newSkill}
              onChange={setNewSkill}
              placeholder="Agregar habilidad nueva"
            />
            <SecondaryButton onClick={addNewSkill}>Agregar</SecondaryButton>
          </div>

          {pendingSkills.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2">
              <p className="text-[11px] font-medium text-amber-800">
                Propuestas del técnico pendientes de aprobación
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {pendingSkills.map((s) => (
                  <Badge key={s} className="bg-amber-200 text-amber-800">{s}</Badge>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-amber-700">
                Apruébalas o recházalas desde el expediente del técnico.
              </p>
            </div>
          )}
        </div>

        <Field label="Notas internas (solo admin)">
          <TextInput value={adminNotes} onChange={setAdminNotes} placeholder="Notas del expediente" />
        </Field>

        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Activo
        </label>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}
