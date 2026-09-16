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
import type { CatalogItem, CatalogsResponse } from "@/app/lib/types";

type CatalogKey = "priorities" | "phases" | "internal-activity-types" | "channels";

const TABS: { key: CatalogKey; label: string }[] = [
  { key: "priorities", label: "Prioridades" },
  { key: "phases", label: "Fases" },
  { key: "internal-activity-types", label: "Actividades internas" },
  { key: "channels", label: "Canales" },
];

export default function CatalogsPage() {
  const [tab, setTab] = useState<CatalogKey>("priorities");
  const { data, error, reload } = useResource<CatalogsResponse>("/api/catalogs");
  const [editing, setEditing] = useState<{ item: CatalogItem | null; mode: "edit" | "toggle" } | null>(null);

  const items: CatalogItem[] =
    data && tab === "priorities"
      ? data.priorities
      : tab === "phases"
        ? (data?.phases ?? [])
        : tab === "channels"
          ? (data?.ticket_channels ?? [])
          : (data?.internal_activity_types ?? []);
  const loading = !data && !error;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-900">Catálogos</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Opciones de prioridades, fases de proyecto, actividades internas y canales de reporte.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6">
        <div className="flex flex-wrap gap-1 border-b border-zinc-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-t-md px-3 py-2 text-sm font-medium ${
                tab === t.key
                  ? "border border-b-0 border-zinc-200 bg-white text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {loading ? (
            <Spinner />
          ) : items.length === 0 ? (
            <EmptyState title="Este catálogo está vacío" />
          ) : (
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Nombre</th>
                    <th className="px-4 py-3 text-left">Orden</th>
                    {tab === "internal-activity-types" && <th className="px-4 py-3 text-left">Requiere aprobación</th>}
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {items.map((it) => (
                    <tr key={it.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-medium text-zinc-800">{it.name}</td>
                      <td className="px-4 py-3 text-zinc-500">{it.sort_order ?? "—"}</td>
                      {tab === "internal-activity-types" && (
                        <td className="px-4 py-3">
                          {(it as CatalogItem & { requires_approval?: boolean }).requires_approval ? (
                            <Badge className="bg-amber-100 text-amber-700">Sí</Badge>
                          ) : (
                            <span className="text-zinc-400">No</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        {it.active ? (
                          <Badge className="bg-emerald-100 text-emerald-700">Activo</Badge>
                        ) : (
                          <Badge className="bg-zinc-100 text-zinc-500">Inactivo</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <SecondaryButton onClick={() => setEditing({ item: it, mode: "edit" })} className="px-2 py-1 text-xs">
                            Editar
                          </SecondaryButton>
                          <SecondaryButton onClick={() => setEditing({ item: it, mode: "toggle" })} className="px-2 py-1 text-xs">
                            {it.active ? "Desactivar" : "Activar"}
                          </SecondaryButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <PrimaryButton onClick={() => setEditing({ item: null, mode: "edit" })}>
          Agregar {tab === "priorities" ? "prioridad" : tab === "phases" ? "fase" : tab === "channels" ? "canal" : "tipo de actividad"}
        </PrimaryButton>
      </div>

      {editing && (
        <ItemModal
          key={`${tab}-${editing.item?.id ?? "new"}-${editing.mode}`}
          catalog={tab}
          item={editing.item}
          mode={editing.mode}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function ItemModal({
  catalog,
  item,
  mode,
  onClose,
  onSaved,
}: {
  catalog: CatalogKey;
  item: CatalogItem | null;
  mode: "edit" | "toggle";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [sortOrder, setSortOrder] = useState(item?.sort_order != null ? String(item.sort_order) : "1");
  const [requiresApproval, setRequiresApproval] = useState(
    Boolean((item as CatalogItem & { requires_approval?: boolean })?.requires_approval)
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isNew = !item;

  const toggleActive = async () => {
    if (!item) return onClose();
    if (!window.confirm(`¿${item.active ? "Desactivar" : "Activar"} "${item.name}"?`)) return;
    setSaving(true);
    setErr(null);
    try {
      await fetchJson(`/api/catalogs/${catalog}/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active }),
      });
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      if (isNew) {
        await fetchJson(`/api/catalogs/${catalog}`, {
          method: "POST",
          body: JSON.stringify({
            name,
            sort_order: sortOrder ? Number(sortOrder) : undefined,
            requires_approval: requiresApproval,
          }),
        });
      } else {
        await fetchJson(`/api/catalogs/${catalog}/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name,
            sort_order: sortOrder ? Number(sortOrder) : undefined,
            requires_approval: requiresApproval,
          }),
        });
      }
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
      title={isNew ? "Agregar elemento" : mode === "edit" ? "Editar" : "Cambiar estado"}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          {mode === "edit" && <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</PrimaryButton>}
        </>
      }
    >
      {mode === "edit" ? (
        <div className="space-y-4">
          <Field label="Nombre">
            <TextInput value={name} onChange={setName} placeholder="Nombre" />
          </Field>
          <Field label="Orden">
            <TextInput value={sortOrder} onChange={setSortOrder} placeholder="1, 2, 3…" type="number" />
          </Field>
          {catalog === "internal-activity-types" && (
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
              Requiere aprobación
            </label>
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            ¿Deseas {item?.active ? "desactivar" : "activar"} <strong>{item?.name}</strong>? Los elementos
            existentes que lo usen conservan su vigencia.
          </p>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
            <DangerButton onClick={toggleActive} disabled={saving}>
              {saving ? "Guardando…" : item?.active ? "Desactivar" : "Activar"}
            </DangerButton>
          </div>
        </div>
      )}
    </Modal>
  );
}