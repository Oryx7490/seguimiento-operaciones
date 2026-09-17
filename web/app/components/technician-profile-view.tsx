"use client";

import Link from "next/link";
import { useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import {
  Badge,
  EmptyState,
  Field,
  PrimaryButton,
  SecondaryButton,
  Select,
  Spinner,
  TextInput,
} from "@/app/components/ui";
import type { Specialty } from "@/app/lib/types";

interface TechRef {
  id: string;
  display_name: string;
}

interface ProfileData {
  id: string;
  display_name: string;
  phone: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  email: string | null;
  username: string | null;
  timezone: string;
}

interface ProfileSpecialty {
  specialty_id: string;
  name: string;
  status: "approved" | "pending";
}

interface ProfileResponse {
  profile: ProfileData;
  specialties: ProfileSpecialty[];
}

export default function TechnicianProfileView({
  initialTechId,
  technicians,
}: {
  initialTechId: string;
  technicians: TechRef[];
}) {
  const [techId, setTechId] = useState(initialTechId);

  return (
    <div className="mx-auto max-w-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href={`/tecnico?t=${techId}`} className="text-xs text-zinc-500 hover:text-zinc-800">
            ← Mi agenda
          </Link>
          <h1 className="text-xl font-semibold text-zinc-900">Mi perfil</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Actualiza tus datos de contacto y tus habilidades.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <Field label="Técnico">
          <Select
            value={techId}
            onChange={setTechId}
            options={technicians.map((x) => ({ value: x.id, label: x.display_name }))}
            placeholder="Seleccionar técnico…"
          />
        </Field>
      </div>

      {techId ? <ProfileCard key={techId} techId={techId} /> : <EmptyState title="Sin técnicos" />}
    </div>
  );
}

function ProfileCard({ techId }: { techId: string }) {
  const { data, error, reload } = useResource<ProfileResponse>(`/api/technicians/${techId}/profile`);
  const catalogRes = useResource<{ specialties: Specialty[] }>("/api/specialties");

  if (error) {
    return (
      <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        No se pudo cargar el perfil: {error}
      </div>
    );
  }
  if (!data) return <Spinner className="py-10" />;

  return (
    <ProfileDetails
      profile={data.profile}
      specialties={data.specialties}
      catalog={catalogRes.data?.specialties ?? []}
      onReload={reload}
    />
  );
}

function ProfileDetails({
  profile,
  specialties,
  catalog,
  onReload,
}: {
  profile: ProfileData;
  specialties: ProfileSpecialty[];
  catalog: Specialty[];
  onReload: () => void;
}) {
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [emergencyName, setEmergencyName] = useState(profile.emergency_contact_name ?? "");
  const [emergencyPhone, setEmergencyPhone] = useState(profile.emergency_contact_phone ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [pickId, setPickId] = useState("");
  const [newSkill, setNewSkill] = useState("");
  const [skillError, setSkillError] = useState<string | null>(null);

  const assignedIds = new Set(specialties.map((s) => s.specialty_id));
  const available = catalog.filter((s) => !assignedIds.has(s.id));
  const approved = specialties.filter((s) => s.status === "approved");
  const pending = specialties.filter((s) => s.status === "pending");

  const saveContact = async () => {
    setSaving(true);
    setErr(null);
    setSaved(false);
    try {
      await fetchJson(`/api/technicians/${profile.id}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          phone,
          address,
          emergency_contact_name: emergencyName,
          emergency_contact_phone: emergencyPhone,
        }),
      });
      setSaved(true);
      onReload();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  const addExisting = async () => {
    if (!pickId) return;
    setSkillError(null);
    try {
      await fetchJson(`/api/technicians/${profile.id}/specialties`, {
        method: "POST",
        body: JSON.stringify({ specialty_id: pickId }),
      });
      setPickId("");
      onReload();
    } catch (e) {
      setSkillError(String(e instanceof Error ? e.message : e));
    }
  };

  const propose = async () => {
    const value = newSkill.trim();
    if (!value) return;
    setSkillError(null);
    try {
      await fetchJson(`/api/technicians/${profile.id}/specialties`, {
        method: "POST",
        body: JSON.stringify({ name: value }),
      });
      setNewSkill("");
      onReload();
    } catch (e) {
      setSkillError(String(e instanceof Error ? e.message : e));
    }
  };

  const removeSkill = async (s: ProfileSpecialty) => {
    setSkillError(null);
    try {
      await fetchJson(`/api/technicians/${profile.id}/specialties?specialty_id=${s.specialty_id}`, {
        method: "DELETE",
      });
      onReload();
    } catch (e) {
      setSkillError(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-700">Datos de contacto</h2>
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Teléfono">
              <TextInput value={phone} onChange={setPhone} placeholder="55 1234 5678" />
            </Field>
            <Field label="Contacto de emergencia">
              <TextInput value={emergencyName} onChange={setEmergencyName} placeholder="Nombre" />
            </Field>
          </div>
          <Field label="Teléfono de emergencia">
            <TextInput value={emergencyPhone} onChange={setEmergencyPhone} placeholder="55 1234 5678" />
          </Field>
          <Field label="Dirección">
            <TextInput value={address} onChange={setAddress} placeholder="Calle, número, colonia, ciudad" />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <PrimaryButton onClick={saveContact} disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </PrimaryButton>
          {saved && <span className="text-xs text-emerald-600">Guardado</span>}
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-700">Mis habilidades</h2>

        {approved.length === 0 && pending.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">Aún no tienes habilidades registradas.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {approved.map((s) => (
              <span
                key={s.specialty_id}
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700"
              >
                {s.name}
                <button
                  type="button"
                  onClick={() => removeSkill(s)}
                  className="text-zinc-400 hover:text-red-600"
                  aria-label={`Quitar ${s.name}`}
                >
                  ×
                </button>
              </span>
            ))}
            {pending.map((s) => (
              <span
                key={s.specialty_id}
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800"
              >
                {s.name}
                <Badge className="bg-amber-200 text-amber-800">en revisión</Badge>
                <button
                  type="button"
                  onClick={() => removeSkill(s)}
                  className="text-amber-600 hover:text-amber-900"
                  aria-label={`Quitar ${s.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="Agregar del catálogo">
            <Select
              value={pickId}
              onChange={setPickId}
              options={available.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="Elegir habilidad…"
            />
          </Field>
          <SecondaryButton onClick={addExisting} disabled={!pickId}>Agregar</SecondaryButton>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field label="Proponer una nueva" hint="El administrador la revisará antes de aprobarla.">
            <TextInput value={newSkill} onChange={setNewSkill} placeholder="p. ej. Videowall" />
          </Field>
          <SecondaryButton onClick={propose} disabled={!newSkill.trim()}>Proponer</SecondaryButton>
        </div>
        {skillError && <p className="mt-2 text-xs text-red-600">{skillError}</p>}
      </section>
    </div>
  );
}
