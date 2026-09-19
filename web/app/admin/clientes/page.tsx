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
  TextInput,
} from "@/app/components/ui";
import CommentSection from "@/app/components/comment-section";
import type { Client, ClientContact, ClientDetail, ClientsResponse } from "@/app/lib/types";

export default function ClientsPage() {
  const { data, error, reload } = useResource<ClientsResponse>("/api/clients");
  const [selected, setSelected] = useState<Client | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const clients = data?.clients ?? [];
  const loading = !data && !error;

  function norm(s: string | null | undefined): string {
    return (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  const q = norm(query.trim());
  const filtered = q
    ? clients.filter((c) =>
        norm(c.name).includes(q) ||
        norm(c.contact_name).includes(q) ||
        norm(c.contact_email).includes(q) ||
        norm(c.contact_phone).includes(q)
      )
    : clients;

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
        <div className="flex items-center gap-2">
          <TextInput value={query} onChange={setQuery} placeholder="Buscar cliente o contacto…" className="w-64" />
          <PrimaryButton onClick={() => { setSelected(null); setModalOpen(true); }}>Nuevo cliente</PrimaryButton>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6">
        {loading ? (
          <Spinner />
        ) : clients.length === 0 ? (
          <EmptyState title="No hay clientes registrados" />
        ) : filtered.length === 0 ? (
          <EmptyState title={`Sin coincidencias para "${query.trim()}"`} />
        ) : (
          <>
            {q && (
              <p className="mb-2 text-xs text-zinc-500">
                {filtered.length} de {clients.length} clientes
              </p>
            )}
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">Nombre</th>
                  <th className="px-4 py-3 text-left">Contacto</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map((c) => (
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
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <SecondaryButton onClick={() => setDetailId(c.id)} className="px-2 py-1 text-xs">
                          Contactos{Number(c.contacts_count ?? 0) > 0 ? ` (${c.contacts_count})` : ""}
                        </SecondaryButton>
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
          </>
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

      {detailId && (
        <ClientDetailModal
          clientId={detailId}
          onClose={() => { setDetailId(null); reload(); }}
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

function ClientDetailModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { data, error, reload } = useResource<ClientDetail>(`/api/clients/${clientId}`);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientContact | null>(null);

  async function toggleActive(c: ClientContact) {
    try {
      await fetchJson(`/api/clients/${clientId}/contacts/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !c.active }),
      });
      reload();
    } catch (e) {
      window.alert(String(e));
    }
  }

  async function remove(c: ClientContact) {
    if (!window.confirm(`¿Eliminar a "${c.name}" de los contactos?`)) return;
    try {
      await fetchJson(`/api/clients/${clientId}/contacts/${c.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      window.alert(String(e));
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={data ? `Contactos y notas · ${data.client.name}` : "Contactos y notas"}
      wide
      footer={<SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>}
    >
      <div className="space-y-5">
        {error && <p className="text-xs text-red-600">{error}</p>}
        {!data && !error ? (
          <Spinner />
        ) : data && (
          <>
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Personas de contacto ({data.contacts.length})
                </h3>
                <SecondaryButton onClick={() => { setEditing(null); setFormOpen(true); }} className="px-2 py-1 text-xs">
                  + Agregar persona
                </SecondaryButton>
              </div>
              {formOpen && (
                <ContactForm
                  key="new"
                  clientId={clientId}
                  contact={null}
                  onClose={() => setFormOpen(false)}
                  onSaved={() => { setFormOpen(false); reload(); }}
                />
              )}
              {data.contacts.length === 0 && !formOpen ? (
                <p className="mt-2 text-sm text-zinc-400">Sin contactos adicionales. Agrega a las personas por puesto o proyecto.</p>
              ) : (
                <ul className="mt-2 divide-y divide-zinc-100 rounded-md border border-zinc-200">
                  {data.contacts.map((c) => (
                    <li key={c.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${c.active ? "" : "opacity-55"}`}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-800">
                          {c.name}
                          {c.position && <span className="ml-1.5 font-normal text-zinc-500">· {c.position}</span>}
                          {!c.active && <span className="ml-1.5 text-[11px] text-zinc-400">(inactivo)</span>}
                        </p>
                        {(c.email || c.phone) && (
                          <p className="truncate text-xs text-zinc-500">
                            {c.email}
                            {c.email && c.phone ? " · " : ""}
                            {c.phone}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <SecondaryButton onClick={() => setEditing(c)} className="px-2 py-1 text-xs">
                          Editar
                        </SecondaryButton>
                        <SecondaryButton onClick={() => toggleActive(c)} className="px-2 py-1 text-xs">
                          {c.active ? "Desactivar" : "Activar"}
                        </SecondaryButton>
                        <DangerButton onClick={() => remove(c)} className="px-2 py-1 text-xs">
                          Eliminar
                        </DangerButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {editing && (
                <ContactForm
                  key={editing.id}
                  clientId={clientId}
                  contact={editing}
                  onClose={() => setEditing(null)}
                  onSaved={() => { setEditing(null); reload(); }}
                />
              )}
            </div>

            <CommentSection
              kind="client"
              entityId={clientId}
              comments={data.comments}
              onSaved={reload}
            />
          </>
        )}
      </div>
    </Modal>
  );
}

function ContactForm({ clientId, contact, onClose, onSaved }: {
  clientId: string;
  contact: ClientContact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(contact?.name ?? "");
  const [position, setPosition] = useState(contact?.position ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setErr("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const url = contact
        ? `/api/clients/${clientId}/contacts/${contact.id}`
        : `/api/clients/${clientId}/contacts`;
      await fetchJson(url, {
        method: contact ? "PATCH" : "POST",
        body: JSON.stringify({
          name: name.trim(),
          position: position.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
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
    <div className="mt-3 space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre *">
          <TextInput value={name} onChange={setName} placeholder="Nombre de la persona" />
        </Field>
        <Field label="Puesto / rol">
          <TextInput value={position} onChange={setPosition} placeholder="P. ej. Gerente de obra, Residente…" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Correo">
          <TextInput value={email} onChange={setEmail} placeholder="correo@empresa.com" type="email" />
        </Field>
        <Field label="Teléfono">
          <TextInput value={phone} onChange={setPhone} placeholder="55 1234 5678" />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <SecondaryButton onClick={onClose} className="px-2 py-1 text-xs">Cancelar</SecondaryButton>
        <PrimaryButton onClick={submit} disabled={saving} className="px-2 py-1 text-xs">
          {saving ? "Guardando…" : contact ? "Guardar" : "Agregar"}
        </PrimaryButton>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </div>
  );
}