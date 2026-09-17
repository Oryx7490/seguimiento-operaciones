"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchJson } from "@/app/lib/client";
import { Spinner } from "@/app/components/ui";
import type { UsersResponse, TechniciansResponse, ClientsResponse, LocationsResponse } from "@/app/lib/types";

export default function AdminDashboard() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchJson<UsersResponse>("/api/users"),
      fetchJson<TechniciansResponse>("/api/technicians"),
      fetchJson<ClientsResponse>("/api/clients"),
      fetchJson<LocationsResponse>("/api/locations"),
    ])
      .then(([u, t, c, l]) => {
        setCounts({
          usuarios: u.users.length,
          tecnicos: t.technicians.filter((x) => x.technician_active).length,
          clientes: c.clients.filter((x) => x.active).length,
          ubicaciones: l.locations.filter((x) => x.active).length,
        });
      })
      .catch((e) => setError(String(e)));
  }, []);

  const cards = [
    { href: "/admin/usuarios", label: "Usuarios", value: "usuarios" },
    { href: "/admin/tecnicos", label: "Técnicos", value: "tecnicos" },
    { href: "/admin/clientes", label: "Clientes", value: "clientes" },
    { href: "/admin/ubicaciones", label: "Ubicaciones", value: "ubicaciones" },
  ];

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-900">Configuración</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Administra usuarios, técnicos, clientes, ubicaciones y catálogos del sistema.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar la información: {error}
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-300 hover:shadow"
          >
            <p className="text-sm text-zinc-500">{c.label}</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-900">
              {counts ? (counts[c.value] ?? 0) : <Spinner className="py-0" />}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Catálogos</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/admin/catalogos#priorities", label: "Prioridades", desc: "Urgencia y orden" },
            { href: "/admin/catalogos#phases", label: "Fases", desc: "Fases libres de proyecto" },
            { href: "/admin/catalogos#internal-activity-types", label: "Actividades internas", desc: "Tipos de hora interna" },
            { href: "/admin/catalogos#channels", label: "Canales", desc: "Medios de reporte de tickets" },
          ].map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow"
            >
              <p className="text-sm font-medium text-zinc-800">{c.label}</p>
              <p className="mt-1 text-xs text-zinc-500">{c.desc}</p>
            </Link>
          ))}
        </div>
      </div>
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Comunicaciones</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/admin/notificaciones"
            className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow"
          >
            <p className="text-sm font-medium text-zinc-800">Alertas y notificaciones</p>
            <p className="mt-1 text-xs text-zinc-500">Umbrales, plantillas y registro de envíos</p>
          </Link>
        </div>
      </div>
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700">Integraciones</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/admin/agentes"
            className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow"
          >
            <p className="text-sm font-medium text-zinc-800">Agentes CLI</p>
            <p className="mt-1 text-xs text-zinc-500">Tokens para la API /api/agent</p>
          </Link>
        </div>
      </div>
    </div>
  );
}