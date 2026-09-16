"use client";

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
  Select,
  Spinner,
  TextInput,
} from "@/app/components/ui";
import type { Client, ClientsResponse, Location, LocationsResponse } from "@/app/lib/types";

export default function LocationsPage() {
  const { data, error, reload } = useResource<LocationsResponse>("/api/locations");
  const [selected, setSelected] = useState<Location | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const locations = data?.locations ?? [];
  const loading = !data && !error;

  async function send(method: "PATCH" | "DELETE", l: Location, body?: object) {
    try {
      await fetchJson(`/api/locations/${l.id}`, { method, body: body ? JSON.stringify(body) : undefined });
      reload();
    } catch (e) {
      window.alert(String(e));
    }
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Ubicaciones</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sucursales y sitios donde se realizan instalaciones y servicios.
          </p>
        </div>
        <PrimaryButton onClick={() => { setSelected(null); setModalOpen(true); }}>Nueva ubicación</PrimaryButton>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6">
        {loading ? (
          <Spinner />
        ) : locations.length === 0 ? (
          <EmptyState title="No hay ubicaciones registradas" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">Nombre</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Dirección</th>
                  <th className="px-4 py-3 text-left">Ciudad</th>
                  <th className="px-4 py-3 text-left">Contacto en sitio</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {locations.map((l) => (
                  <tr key={l.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-medium text-zinc-800">{l.name}</td>
                    <td className="px-4 py-3 text-zinc-600">{l.client_name ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-600">{l.address ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-600">{l.city ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-600">{l.site_contact ?? "—"}</td>
                    <td className="px-4 py-3">
                      {l.active ? (
                        <Badge className="bg-emerald-100 text-emerald-700">Activo</Badge>
                      ) : (
                        <Badge className="bg-zinc-100 text-zinc-500">Inactivo</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <SecondaryButton onClick={() => { setSelected(l); setModalOpen(true); }} className="px-2 py-1 text-xs">
                          Editar
                        </SecondaryButton>
                        <SecondaryButton onClick={() => send("PATCH", l, { active: !l.active })} className="px-2 py-1 text-xs">
                          {l.active ? "Desactivar" : "Activar"}
                        </SecondaryButton>
                        <DangerButton
                          onClick={() => {
                            if (window.confirm(`¿Desactivar la ubicación "${l.name}"?`)) send("DELETE", l);
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
        <LocationModal
          key={selected?.id ?? "new"}
          location={selected}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); reload(); }}
        />
      )}
    </div>
  );
}

function LocationModal({
  location,
  onClose,
  onSaved,
}: {
  location: Location | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(location?.client_id ?? "");
  const [name, setName] = useState(location?.name ?? "");
  const [address, setAddress] = useState(location?.address ?? "");
  const [city, setCity] = useState(location?.city ?? "");
  const [siteContact, setSiteContact] = useState(location?.site_contact ?? "");
  const [active, setActive] = useState(location?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJson<ClientsResponse>("/api/clients")
      .then((d) => {
        if (!cancelled) setClients(d.clients);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const url = location ? `/api/locations/${location.id}` : "/api/locations";
      await fetchJson(url, {
        method: location ? "PATCH" : "POST",
        body: JSON.stringify({
          client_id: clientId || null,
          name,
          address: address || null,
          city: city || null,
          site_contact: siteContact || null,
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
      title={location ? "Editar ubicación" : "Nueva ubicación"}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : location ? "Guardar" : "Crear"}
          </PrimaryButton>
        </>
      }
      wide
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre de la ubicación">
            <TextInput value={name} onChange={setName} placeholder="P. ej. Sucursal Reforma" />
          </Field>
          <Field label="Cliente">
            <Select
              value={clientId}
              onChange={setClientId}
              placeholder="— Sin cliente —"
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>
        </div>
        <Field label="Dirección">
          <TextInput value={address} onChange={setAddress} placeholder="Calle, número, colonia" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ciudad">
            <TextInput value={city} onChange={setCity} placeholder="Ciudad" />
          </Field>
          <Field label="Contacto en sitio">
            <TextInput value={siteContact} onChange={setSiteContact} placeholder="Nombre y teléfono" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
          Activo
        </label>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}