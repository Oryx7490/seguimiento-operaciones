"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import {
  Badge,
  DangerButton,
  EmptyState,
  Field,
  Modal,
  PrimaryButton,
  SearchableSelect,
  SecondaryButton,
  Spinner,
  TextInput,
  Textarea,
} from "@/app/components/ui";

interface Client {
  id: string;
  name: string;
  active: boolean;
}

interface CatalogScreen {
  id: string;
  client_id: string;
  client_name: string;
  name: string;
  width_m: number | null;
  height_m: number | null;
  area_m2: number | null;
  pitch_mm: number | null;
  is_irregular: boolean;
  environment: string | null;
  voltage: string | null;
  notes: string | null;
  active: boolean;
  used_in_projects: number;
}

type Draft = {
  client_id: string;
  name: string;
  width_m: string;
  height_m: string;
  area_m2: string;
  pitch_mm: string;
  is_irregular: boolean;
  environment: string;
  voltage: string;
  notes: string;
};

function emptyDraft(clientId = ""): Draft {
  return {
    client_id: clientId,
    name: "",
    width_m: "",
    height_m: "",
    area_m2: "",
    pitch_mm: "",
    is_irregular: false,
    environment: "",
    voltage: "",
    notes: "",
  };
}

function toDraft(s: CatalogScreen): Draft {
  return {
    client_id: s.client_id,
    name: s.name,
    width_m: s.width_m?.toString() ?? "",
    height_m: s.height_m?.toString() ?? "",
    area_m2: s.area_m2?.toString() ?? "",
    pitch_mm: s.pitch_mm?.toString() ?? "",
    is_irregular: s.is_irregular,
    environment: s.environment ?? "",
    voltage: s.voltage ?? "",
    notes: s.notes ?? "",
  };
}

function m2(s: CatalogScreen): string {
  if (s.is_irregular) return s.area_m2 ? `${s.area_m2} m²` : "—";
  if (s.width_m && s.height_m) return `${(s.width_m * s.height_m).toFixed(2)} m²`;
  return "—";
}

export default function ScreenCatalogPage() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filterClient, setFilterClient] = useState("");

  // Espera a que el usuario deje de escribir para no pedir el catálogo en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const url = useMemo(() => {
    const qs = new URLSearchParams();
    if (filterClient) qs.set("client_id", filterClient);
    if (debounced) qs.set("q", debounced);
    const s = qs.toString();
    return `/api/screen-catalog${s ? `?${s}` : ""}`;
  }, [filterClient, debounced]);

  const { data, error, reload } = useResource<{ screens: CatalogScreen[] }>(url);
  const clients = useResource<{ clients: Client[] }>("/api/clients");

  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const screens = data?.screens ?? [];
  const searching = debounced !== "" || filterClient !== "";
  const activeClients = (clients.data?.clients ?? []).filter((c) => c.active);

  async function save() {
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    const d = editing.draft;
    const body: Record<string, unknown> = {
      client_id: d.client_id,
      name: d.name,
      is_irregular: d.is_irregular,
    };
    // Los campos numéricos vacíos se mandan como null; los no tocados, undefined,
    // para que el PATCH no los sobre-escriba al editar.
    for (const key of ["width_m", "height_m", "area_m2", "pitch_mm"] as const) {
      body[key] = d[key] === "" ? null : Number(d[key]);
    }
    body.environment = d.environment || null;
    body.voltage = d.voltage || null;
    body.notes = d.notes || null;

    try {
      if (editing.id) {
        await fetchJson(`/api/screen-catalog/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await fetchJson("/api/screen-catalog", { method: "POST", body: JSON.stringify(body) });
      }
      setEditing(null);
      reload();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(s: CatalogScreen) {
    const extra = s.used_in_projects > 0 ? ` ${s.used_in_projects} proyecto(s) lo usan y conservan el enlace.` : "";
    if (!window.confirm(`¿Desactivar "${s.name}"?${extra} Podrás reactivarlo después.`)) return;
    setDeactivating(s.id);
    try {
      await fetchJson(`/api/screen-catalog/${s.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setDeactivating(null);
    }
  }

  async function toggleActive(s: CatalogScreen) {
    setToggling(s.id);
    try {
      await fetchJson(`/api/screen-catalog/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !s.active }),
      });
      reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setToggling(null);
    }
  }

  const d = editing?.draft;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Catálogo de pantallas</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Define una pantalla una sola vez por cuenta y luego relaciónala desde cualquier proyecto de esa cuenta.
          </p>
        </div>
        <PrimaryButton onClick={() => setEditing({ id: null, draft: emptyDraft(filterClient) })}>
          Nueva pantalla
        </PrimaryButton>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Buscar pantalla">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre de la pantalla o de la cuenta…"
              autoFocus
              className="w-72 rounded-md border border-zinc-300 px-2.5 py-1.5 pr-7 text-sm placeholder:text-zinc-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-sm text-zinc-400 hover:bg-zinc-100"
              >
                ×
              </button>
            )}
          </div>
        </Field>

        <Field label="Cuenta">
          <SearchableSelect
            value={filterClient}
            onChange={setFilterClient}
            options={activeClients.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Todas las cuentas"
          />
        </Field>

        <div className="pb-1.5 text-xs text-zinc-500">
          {screens.length === 1 ? "1 pantalla" : `${screens.length} pantallas`}
          {searching && <span className="text-zinc-400"> (filtrando)</span>}
        </div>

        {searching && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilterClient("");
            }}
            className="mb-1.5 rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100"
          >
            Limpiar
          </button>
        )}
      </div>

      {!data && !error && <Spinner />}

      {data && screens.length === 0 && (
        <EmptyState title={searching ? "Sin coincidencias" : "No hay pantallas en el catálogo"}>
          {searching ? (
            <>
              Ninguna pantalla registrada coincide con{" "}
              <span className="font-medium text-zinc-600">
                {debounced ? `“${debounced}”` : "la cuenta elegida"}
              </span>
              .
            </>
          ) : (
            "Empieza con la primera pantalla de la cuenta: así todos sus proyectos toman las mismas medidas."
          )}
        </EmptyState>
      )}

      {screens.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-semibold">Cuenta</th>
                <th className="px-3 py-2 font-semibold">Pantalla</th>
                <th className="px-3 py-2 font-semibold">Medidas</th>
                <th className="px-3 py-2 font-semibold">m²</th>
                <th className="px-3 py-2 font-semibold">Pitch</th>
                <th className="px-3 py-2 font-semibold">Ambiente</th>
                <th className="px-3 py-2 font-semibold">Uso</th>
                <th className="px-3 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {screens.map((s) => (
                <tr key={s.id} className={s.active ? "" : "bg-zinc-50 text-zinc-400"}>
                  <td className="px-3 py-2 whitespace-nowrap">{s.client_name}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-zinc-800">{s.name}</span>
                    {!s.active && (
                      <Badge className="ml-2 bg-zinc-200 text-zinc-600">inactiva</Badge>
                    )}
                    {s.notes && <p className="text-xs text-zinc-400">{s.notes}</p>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-600">
                    {s.is_irregular ? "irregular (m²)" : `${s.width_m ?? "—"} × ${s.height_m ?? "—"} m`}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-600">{m2(s)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-600">{s.pitch_mm ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-600">{s.environment ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-600">
                    {s.used_in_projects > 0 ? `${s.used_in_projects} proyecto(s)` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <SecondaryButton onClick={() => setEditing({ id: s.id, draft: toDraft(s) })}>Editar</SecondaryButton>{" "}
                    <SecondaryButton onClick={() => void toggleActive(s)} disabled={toggling === s.id}>
                      {s.active ? "Desactivar" : "Reactivar"}
                    </SecondaryButton>{" "}
                    {s.active && (
                      <DangerButton onClick={() => void deactivate(s)} disabled={deactivating === s.id}>
                        Borrar
                      </DangerButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && d && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? "Editar pantalla" : "Nueva pantalla"}>
          <div className="space-y-3">
            <Field label="Cuenta" hint="La pantalla pertenece a este cliente: solo se puede relacionar en proyectos de esa cuenta.">
              <SearchableSelect
                value={d.client_id}
                onChange={(v) => setEditing({ ...editing, draft: { ...d, client_id: v } })}
                options={activeClients.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Elige la cuenta"
              />
            </Field>

            <Field label="Nombre de la pantalla" hint="Por ejemplo: AVE Lácteos, Cenefa Recta, Acceso.">
              <TextInput value={d.name} onChange={(v) => setEditing({ ...editing, draft: { ...d, name: v } })} />
            </Field>

            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={d.is_irregular}
                onChange={(e) => setEditing({ ...editing, draft: { ...d, is_irregular: e.target.checked } })}
              />
              Pantalla irregular (se mide en m², sin ancho ni alto)
            </label>

            {!d.is_irregular && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ancho (m)">
                  <TextInput value={d.width_m} onChange={(v) => setEditing({ ...editing, draft: { ...d, width_m: v } })} />
                </Field>
                <Field label="Alto (m)">
                  <TextInput value={d.height_m} onChange={(v) => setEditing({ ...editing, draft: { ...d, height_m: v } })} />
                </Field>
              </div>
            )}

            <Field label={d.is_irregular ? "Superficie (m²)" : "m² (opcional, si no es ancho × alto)"}>
              <TextInput value={d.area_m2} onChange={(v) => setEditing({ ...editing, draft: { ...d, area_m2: v } })} />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Pitch (mm)">
                <TextInput value={d.pitch_mm} onChange={(v) => setEditing({ ...editing, draft: { ...d, pitch_mm: v } })} />
              </Field>
              <Field label="Ambiente">
                <TextInput
                  value={d.environment}
                  onChange={(v) => setEditing({ ...editing, draft: { ...d, environment: v } })}
                  placeholder="interior / exterior"
                />
              </Field>
              <Field label="Voltaje">
                <select
                  value={d.voltage}
                  onChange={(e) => setEditing({ ...editing, draft: { ...d, voltage: e.target.value } })}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  <option value="110ac">110ac</option>
                  <option value="220ac">220ac</option>
                </select>
              </Field>
            </div>

            <Field label="Notas">
              <Textarea value={d.notes} onChange={(v) => setEditing({ ...editing, draft: { ...d, notes: v } })} />
            </Field>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton onClick={() => setEditing(null)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={() => void save()} disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}