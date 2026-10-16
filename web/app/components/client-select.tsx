"use client";

import { useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { Field, Modal, PrimaryButton, SearchableSelect, SecondaryButton, TextInput } from "@/app/components/ui";

export interface ClientRow {
  id: string;
  name: string;
  active?: boolean;
  activity_count?: number | string;
}

/**
 * Selector de cliente reutilizable: busca, muestra los 5 más usados (por actividad)
 * y, si la búsqueda no coincide, permite dar de alta un cliente nuevo sin salir del flujo.
 */
export default function ClientSelect({
  value,
  onChange,
  placeholder = "Buscar cliente…",
  clearLabel = "— Sin cliente —",
  mark,
  onlyActive = true,
  onCreated,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  clearLabel?: string;
  mark?: string;
  onlyActive?: boolean;
  onCreated?: (client: ClientRow) => void;
}) {
  const { data, reload } = useResource<{ clients: ClientRow[] }>("/api/clients");
  const [draft, setDraft] = useState<string | null>(null);
  const clients = data?.clients ?? [];

  return (
    <>
      <SearchableSelect
        mark={mark}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        clearLabel={clearLabel}
        topN={5}
        options={clients
          .filter((c) => !onlyActive || c.active !== false)
          .map((c) => ({ value: c.id, label: c.name, frequency: Number(c.activity_count) || 0 }))}
        onCreate={(query) => setDraft(query)}
      />
      {draft !== null && (
        <NewClientModal
          initialName={draft}
          onClose={() => setDraft(null)}
          onCreated={(client) => {
            setDraft(null);
            reload();
            onChange(client.id);
            onCreated?.(client);
          }}
        />
      )}
    </>
  );
}

export function NewClientModal({
  initialName,
  onClose,
  onCreated,
}: {
  initialName: string;
  onClose: () => void;
  onCreated: (client: ClientRow) => void;
}) {
  const [name, setName] = useState(initialName);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return setErr("El nombre es obligatorio");
    setSaving(true);
    setErr(null);
    try {
      const { client } = await fetchJson<{ client: ClientRow }>("/api/clients", {
        method: "POST",
        body: JSON.stringify({
          name,
          contact_name: contactName || undefined,
          contact_email: contactEmail || undefined,
          contact_phone: contactPhone || undefined,
        }),
      });
      onCreated(client);
    } catch (e) {
      setErr(String(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Nuevo cliente"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Creando…" : "Crear cliente"}</PrimaryButton>
        </>
      }
      wide
    >
      <div className="space-y-4">
        <Field label="Nombre del cliente">
          <TextInput value={name} onChange={setName} placeholder="Nombre o razón social" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contacto">
            <TextInput value={contactName} onChange={setContactName} placeholder="Nombre del contacto" />
          </Field>
          <Field label="Teléfono">
            <TextInput value={contactPhone} onChange={setContactPhone} placeholder="Teléfono" />
          </Field>
        </div>
        <Field label="Correo">
          <TextInput value={contactEmail} onChange={setContactEmail} placeholder="correo@ejemplo.com" />
        </Field>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}
