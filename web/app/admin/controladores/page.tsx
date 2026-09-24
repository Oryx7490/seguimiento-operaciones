"use client";

import { useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import {
  Badge,
  Field,
  Modal,
  PrimaryButton,
  SecondaryButton,
  Select,
  Spinner,
  TextInput,
} from "@/app/components/ui";

const OWNERSHIP_LABEL: Record<string, string> = {
  propio: "Propio",
  cliente: "Del cliente",
  tercero: "De terceros",
};

const OWNERSHIP_BADGE: Record<string, string> = {
  propio: "bg-emerald-100 text-emerald-700",
  cliente: "bg-sky-100 text-sky-700",
  tercero: "bg-violet-100 text-violet-700",
};

interface CatalogController {
  id: string;
  name: string;
  brand: string | null;
  ownership: string;
  active: boolean;
  created_at: string;
}

export default function ControllersPage() {
  const { data, error, reload } = useResource<{ controllers: CatalogController[] }>("/api/controllers");
  const [editing, setEditing] = useState<{ item: CatalogController | null } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const controllers = data?.controllers ?? [];

  async function handleDelete(c: CatalogController) {
    if (!window.confirm(`¿Eliminar el controlador "${c.name}"? Esta acción desactivará el registro.`)) return;
    setDeleting(c.id);
    try {
      await fetchJson(`/api/controllers/${c.id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-zinc-900">Controladores</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Catálogo de equipos de pantalla (Novastar y otras marcas): propios, del cliente o de terceros.
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {!data && !error && <Spinner />}

      {data && controllers.length === 0 && (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-10 text-center text-zinc-500">
          No hay controladores en el catálogo.
        </div>
      )}

      {data && controllers.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left first:px-4">Modelo</th>
                <th className="px-3 py-2 text-left">Marca</th>
                <th className="px-3 py-2 text-left">Procedencia</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {controllers.map((c) => (
                <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                  <td className="px-3 py-2 font-medium text-zinc-800 first:px-4">{c.name}</td>
                  <td className="px-3 py-2 text-zinc-600">{c.brand ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge className={OWNERSHIP_BADGE[c.ownership] ?? "bg-zinc-100 text-zinc-600"}>
                      {OWNERSHIP_LABEL[c.ownership] ?? c.ownership}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={c.active ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}>
                      {c.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditing({ item: c })}
                        className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setEditing({ item: c })}
                        className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                      >
                        {c.active ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                        disabled={deleting === c.id}
                      >
                        {deleting === c.id ? "…" : "Eliminar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4">
        <PrimaryButton onClick={() => setEditing({ item: null })}>Agregar controlador</PrimaryButton>
      </div>

      {editing && (
        <ControllerModal
          key={editing.item?.id ?? "new"}
          item={editing.item}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function ControllerModal({
  item,
  onClose,
  onSaved,
}: {
  item: CatalogController | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [ownership, setOwnership] = useState(item?.ownership ?? "propio");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isNew = !item;

  async function toggleActive() {
    if (!item) return onClose();
    if (!window.confirm(`¿${item.active ? "Desactivar" : "Activar"} "${item.name}"?`)) return;
    setSaving(true);
    setErr(null);
    try {
      await fetchJson(`/api/controllers/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active }),
      });
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const body = { name: name.trim(), brand: brand.trim() || null, ownership };
      if (isNew) {
        await fetchJson("/api/controllers", { method: "POST", body: JSON.stringify(body) });
      } else {
        await fetchJson(`/api/controllers/${item!.id}`, { method: "PATCH", body: JSON.stringify(body) });
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
      title={isNew ? "Agregar controlador" : "Editar controlador"}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          {isNew && <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</PrimaryButton>}
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Modelo">
          <TextInput value={name} onChange={setName} placeholder="P. ej. MCTRL300" />
        </Field>
        <Field label="Marca">
          <TextInput value={brand} onChange={setBrand} placeholder="P. ej. Novastar" />
        </Field>
        <Field label="Procedencia">
          <Select
            value={ownership}
            onChange={setOwnership}
            options={[
              { value: "propio", label: "Propio" },
              { value: "cliente", label: "Del cliente" },
              { value: "tercero", label: "De terceros" },
            ]}
          />
        </Field>
        {!isNew && (
          <div className="border-t border-zinc-100 pt-3">
            <p className="text-xs text-zinc-500">
              Estado actual: {item!.active ? "activo" : "inactivo"}. Los proyectos que ya lo usan conservan su vigencia.
            </p>
            <button
              type="button"
              onClick={() => void toggleActive()}
              disabled={saving}
              className="mt-2 rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
            >
              {item!.active ? "Desactivar" : "Activar"}
            </button>
          </div>
        )}
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}