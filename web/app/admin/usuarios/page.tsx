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
  Select,
  Spinner,
  TextInput,
} from "@/app/components/ui";
import type { User, UsersResponse } from "@/app/lib/types";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  coordinator: "Coordinador",
  technician: "Técnico",
};

export default function UsersPage() {
  const { data, error, reload } = useResource<UsersResponse>("/api/users");
  const [selected, setSelected] = useState<User | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const users = data?.users ?? [];
  const loading = !data && !error;

  async function send(method: "PATCH" | "DELETE", u: User, body?: object) {
    try {
      await fetchJson(`/api/users/${u.id}`, { method, body: body ? JSON.stringify(body) : undefined });
      reload();
    } catch (e) {
      window.alert(String(e));
    }
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Usuarios</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Cuentas de acceso con rol. Los técnicos se crean desde la pestaña Técnicos.
          </p>
        </div>
        <PrimaryButton onClick={() => { setSelected(null); setModalOpen(true); }}>Nuevo usuario</PrimaryButton>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6">
        {loading ? (
          <Spinner />
        ) : users.length === 0 ? (
          <EmptyState title="No hay usuarios todavía" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">Nombre</th>
                  <th className="px-4 py-3 text-left">Correo</th>
                  <th className="px-4 py-3 text-left">Rol</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Creado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-medium text-zinc-800">{u.name}</td>
                    <td className="px-4 py-3 text-zinc-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge className="bg-zinc-100 text-zinc-600">{ROLE_LABEL[u.role] ?? u.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {u.active ? (
                        <Badge className="bg-emerald-100 text-emerald-700">Activo</Badge>
                      ) : (
                        <Badge className="bg-zinc-100 text-zinc-500">Inactivo</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{formatDateTime(u.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <SecondaryButton onClick={() => { setSelected(u); setModalOpen(true); }} className="px-2 py-1 text-xs">
                          Editar
                        </SecondaryButton>
                        <SecondaryButton onClick={() => send("PATCH", u, { active: !u.active })} className="px-2 py-1 text-xs">
                          {u.active ? "Suspender" : "Activar"}
                        </SecondaryButton>
                        <DangerButton
                          onClick={() => {
                            if (window.confirm(`¿Desactivar al usuario "${u.name}"? Sus accesos quedarán suspendidos.`)) {
                              send("DELETE", u);
                            }
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
        <UserModal
          key={selected?.id ?? "new"}
          user={selected}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); reload(); }}
        />
      )}
    </div>
  );
}

function UserModal({
  user,
  onClose,
  onSaved,
}: {
  user: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<string>(user?.role ?? "technician");
  const [active, setActive] = useState(user?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      const url = user ? `/api/users/${user.id}` : "/api/users";
      await fetchJson(url, {
        method: user ? "PATCH" : "POST",
        body: JSON.stringify({ name, email, role, active }),
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
      title={user ? "Editar usuario" : "Nuevo usuario"}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : user ? "Guardar" : "Crear"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nombre">
          <TextInput value={name} onChange={setName} placeholder="Nombre completo" />
        </Field>
        <Field label="Correo electrónico">
          <TextInput value={email} onChange={setEmail} placeholder="correo@empresa.com" type="email" />
        </Field>
        <Field label="Rol">
          <Select
            value={role}
            onChange={setRole}
            options={[
              { value: "technician", label: "Técnico" },
              { value: "coordinator", label: "Coordinador" },
              { value: "admin", label: "Administrador" },
            ]}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
          Activo
        </label>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <p className="text-[11px] text-zinc-400">
          El inicio de sesión se habilitará en una fase posterior; la contraseña se configurará entonces.
        </p>
      </div>
    </Modal>
  );
}