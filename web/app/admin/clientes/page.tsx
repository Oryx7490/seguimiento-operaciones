"use client";

import { useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { formatDateTime } from "@/app/lib/format";
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
import type { Client, ClientsResponse } from "@/app/lib/types";

export default function ClientsPage() {
  const { data, error, reload } = useResource<ClientsResponse>("/api/clients");
  const [selected, setSelected] = useState<Client | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const clients = data?.clients ?? [];
  const loading = !data && !error;

  async function send(method: "PATCH" | "DELETE", c: Client, body?: object) {
    try {
      await fetchJson(`/api/clients/${c.id}`, { method, body: body ? JSON.stringify(body) : undefined });
      reload();
    } catch (e) {
      window.alert(String(e));
    }
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Clientes</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Empresas y personas atendidas. Los proyectos y tickets externos se vinculan a clientes.
          </p>
        </div>
        <PrimaryButton onClick={() => { setSelected(null); setModalOpen(true); }}>Nuevo cliente</PrimaryButton>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6">
        {loading ? (
          <Spinner />
        ) : clients.length === 0 ? (
          <EmptyState title="No hay clientes registrados" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">Nombre</th>
                  <th className="px-4 py-3 text-left">Contacto</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Creado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {clients.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-medium text-zinc-800">{c.name}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {c.contact_name ? (
                        <span className="flex flex-col">
                          <span>{c.contact_name}</span>
                          {(c.contact_email || c.contact_phone) && (
                            <span className="text-xs text-zinc-400">
                              {c.contact_email}
                              {c.contact_email && c.contact_phone ? " · " : ""}
                              {c.contact_phone}
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.active ? (
                        <Badge className="bg-emerald-100 text-emerald-700">Activo</Badge>
                      ) : (
                        <Badge className="bg-zinc-100 text-zinc-500">Inactivo</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{formatDateTime(c.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <SecondaryButton onClick={() => { setSelected(c); setModalOpen(true); }} className="px-2 py-1 text-xs">
                          Editar
                        </SecondaryButton>
                        <SecondaryButton onClick={() => send("PATCH", c, { active: !c.active })} className="px-2 py-1 text-xs">
                          {c.active ? "Desactivar" : "Activar"}
                        </SecondaryButton>
                        <DangerButton
                          onClick={() => {
                            if (window.confirm(`¿Desactivar al cliente "${c.name}"? Los proyectos y ubicaciones existentes se conservan.`)) send("DELETE", c);
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
        <ClientModal
          key={selected?.id ?? "new"}
          client={selected}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); reload(); }}
        />
      )}
    </div>
  );
}

function ClientModal({
  client,
  onClose,
  onSaved,
}: {
  client: Client | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(client?.name ?? "");
  const [contactName, setContactName] = useState(client?.contact_name ?? "");
  const [contactEmail, setContactEmail] = useState(client?.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(client?.contact_phone ?? "");
  const [active, setActive] = useState(client?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const url = client ? `/api/clients/${client.id}` : "/api/clients";
      await fetchJson(url, {
        method: client ? "PATCH" : "POST",
        body: JSON.stringify({
          name,
          contact_name: contactName || null,
          contact_email: contactEmail || null,
          contact_phone: contactPhone || null,
          active,
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
      title={client ? "Editar cliente" : "Nuevo cliente"}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : client ? "Guardar" : "Crear"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre del cliente">
          <TextInput value={name} onChange={setName} placeholder="Razón social o nombre" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre de contacto">
            <TextInput value={contactName} onChange={setContactName} placeholder="Persona encargada" />
          </Field>
          <Field label="Teléfono de contacto">
            <TextInput value={contactPhone} onChange={setContactPhone} placeholder="55 1234 5678" />
          </Field>
        </div>
        <Field label="Correo de contacto">
          <TextInput value={contactEmail} onChange={setContactEmail} placeholder="contacto@cliente.com" type="email" />
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