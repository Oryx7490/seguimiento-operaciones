"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { fetchJson } from "@/app/lib/client";
import { PrimaryButton, SecondaryButton } from "@/app/components/ui";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-zinc-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
}

interface Permission {
  id: string;
  role_id: string;
  section_key: string;
  can_view: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_export: boolean;
}

const SECTIONS: Array<{ key: string; label: string; group: string }> = [
  { key: "inicio", label: "Inicio/Dashboard", group: "General" },
  { key: "agenda", label: "Agenda", group: "Operación" },
  { key: "gantt", label: "Gantt proyectos", group: "Operación" },
  { key: "gantt_tickets", label: "Gantt tickets", group: "Operación" },
  { key: "proyectos", label: "Proyectos", group: "Operación" },
  { key: "tickets", label: "Tickets", group: "Operación" },
  { key: "pendientes", label: "Pendientes", group: "Operación" },
  { key: "notificaciones", label: "Notificaciones", group: "General" },
  { key: "tecnico_movil", label: "Técnico móvil", group: "Técnico" },
  { key: "ayuda", label: "Ayuda", group: "General" },
  { key: "admin", label: "Configuración", group: "Admin" },
  { key: "admin.usuarios", label: "Admin: Usuarios", group: "Admin" },
  { key: "admin.tecnicos", label: "Admin: Técnicos", group: "Admin" },
  { key: "admin.clientes", label: "Admin: Clientes", group: "Admin" },
  { key: "admin.ubicaciones", label: "Admin: Ubicaciones", group: "Admin" },
  { key: "admin.catalogos", label: "Admin: Catálogos", group: "Admin" },
  { key: "admin.controladores", label: "Admin: Controladores", group: "Admin" },
  { key: "admin.catalogo_pantallas", label: "Admin: Catálogo pantallas", group: "Admin" },
  { key: "admin.especialidades", label: "Admin: Especialidades", group: "Admin" },
  { key: "admin.calendario", label: "Admin: Calendario", group: "Admin" },
  { key: "admin.revision_pantallas", label: "Auditoría pantallas", group: "Admin" },
  { key: "admin.inventario", label: "Inventario", group: "Admin" },
  { key: "admin.planeacion", label: "Planeación", group: "Admin" },
  { key: "admin.cierre", label: "Cierre", group: "Admin" },
  { key: "admin.horas_extra", label: "Horas extra", group: "Admin" },
  { key: "admin.notificaciones", label: "Admin: Notificaciones", group: "Admin" },
  { key: "bitacora", label: "Bitácora", group: "Admin" },
  { key: "admin.agentes", label: "Agentes CLI", group: "Admin" },
  { key: "admin.kpis_semanales", label: "KPIs semanales", group: "Admin" },
  { key: "pantallas_pendientes", label: "Pantallas por instalarse", group: "Operación" },
  { key: "admin.roles", label: "Roles y permisos", group: "Admin" },
];

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selected, setSelected] = useState<Role | null>(null);
  const [perms, setPerms] = useState<Record<string, Permission>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetchJson<{ roles: Role[] }>("/api/roles");
      setRoles(res.roles);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    async function loadPerms() {
      if (!selected) return;
      const res = await fetchJson<{ permissions: Permission[] }>(`/api/admin/roles/${selected.id}/permissions`);
      const m: Record<string, Permission> = {};
      for (const p of res.permissions) m[p.section_key] = p;
      setPerms(m);
    }
    loadPerms();
  }, [selected]);

  function toggle(key: keyof Permission, section: string) {
    if (!selected) return;
    const base = perms[section] || {
      id: "",
      role_id: selected.id,
      section_key: section,
      can_view: false,
      can_create: false,
      can_update: false,
      can_delete: false,
      can_export: false,
    } as Permission;
    (base as any)[key] = !(base as any)[key];
    setPerms((prev) => ({ ...prev, [section]: base }));
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setMsg(null);
    const permissions = SECTIONS.map((s) => {
      const p = perms[s.key] || {
        section_key: s.key,
        can_view: false,
        can_create: false,
        can_update: false,
        can_delete: false,
        can_export: false,
      };
      return p;
    });
    await fetchJson(`/api/admin/roles/${selected.id}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissions }),
    });
    setMsg("Permisos guardados");
    setSaving(false);
    setTimeout(() => setMsg(null), 2000);
  }

  const groups = Array.from(new Set(SECTIONS.map((s) => s.group)));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Roles y permisos</h1>
          <p className="text-sm text-zinc-500">Define permisos por sección para cada perfil.</p>
        </div>
        <Link href="/admin/usuarios" className="text-sm text-zinc-600 hover:underline">
          Volver a usuarios
        </Link>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className={`rounded-md px-3 py-1.5 text-sm border ${
                selected?.id === r.id
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {r.name} ({r.code})
            </button>
          ))}
        </div>
      </Card>

      {selected && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-medium text-zinc-900">{selected.name}</h2>
              <p className="text-xs text-zinc-500">{selected.code}</p>
            </div>
            <div className="flex gap-2">
              <SecondaryButton onClick={() => setSelected(null)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={save} disabled={saving}>
                {saving ? "Guardando..." : "Guardar permisos"}
              </PrimaryButton>
            </div>
          </div>
          {msg && <div className="mb-3 text-xs text-emerald-700">{msg}</div>}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-zinc-600">Sección</th>
                  <th className="px-3 py-2 text-center font-medium text-zinc-600">Ver</th>
                  <th className="px-3 py-2 text-center font-medium text-zinc-600">Crear</th>
                  <th className="px-3 py-2 text-center font-medium text-zinc-600">Editar</th>
                  <th className="px-3 py-2 text-center font-medium text-zinc-600">Borrar</th>
                  <th className="px-3 py-2 text-center font-medium text-zinc-600">Exportar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {groups.map((g) => (
                  <Fragment key={g}>
                    <tr>
                      <td colSpan={6} className="px-3 py-1.5 bg-zinc-100 text-xs font-medium text-zinc-700">
                        {g}
                      </td>
                    </tr>
                    {SECTIONS.filter((s) => s.group === g).map((s) => {
                      const p = perms[s.key] || {
                        section_key: s.key,
                        can_view: false,
                        can_create: false,
                        can_update: false,
                        can_delete: false,
                        can_export: false,
                      };
                      return (
                        <tr key={s.key}>
                          <td className="px-3 py-1.5 text-zinc-700">{s.label}</td>
                          <td className="px-3 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={p.can_view}
                              onChange={() => toggle("can_view", s.key)}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={p.can_create}
                              onChange={() => toggle("can_create", s.key)}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={p.can_update}
                              onChange={() => toggle("can_update", s.key)}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={p.can_delete}
                              onChange={() => toggle("can_delete", s.key)}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={p.can_export}
                              onChange={() => toggle("can_export", s.key)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
