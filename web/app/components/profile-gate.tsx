"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/app/lib/client";

interface SessionUser {
  id: string;
  name: string;
  role: string;
}

interface SessionResponse {
  user: SessionUser | null;
  users: SessionUser[];
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  coordinator: "Coordinador",
  technician: "Técnico",
};

function hasSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith("sg_uid="));
}

/**
 * Puerta de selección de perfil.
 *
 * No hay login con contraseña: cada persona elige una vez su perfil y la
 * elección queda en la cookie `sg_uid`. Mientras no exista esa cookie, la
 * aplicación muestra el selector a pantalla completa y no deja entrar.
 */
export default function ProfileGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const hasCookie = document.cookie.split("; ").some((c) => c.startsWith("sg_uid=") && c.length > 7);
    setReady(hasCookie);
    if (!hasCookie) {
      fetchJson<{ users: SessionUser[] }>("/api/session")
        .then((r) => setUsers(r.users))
        .catch((e) => setErr(String(e)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose(id: string) {
    setSaving(id);
    setErr(null);
    try {
      await fetchJson("/api/session", { method: "POST", body: JSON.stringify({ user_id: id }) });
      window.location.reload();
    } catch (e) {
      setErr(String(e));
      setSaving(null);
    }
  }

  if (ready === null) return null;
  if (ready) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">¿Quién eres?</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Elige tu perfil para entrar. Tu identidad define lo que puedes ver y hacer en el sistema.
        </p>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              disabled={saving !== null}
              onClick={() => void choose(u.id)}
              className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 text-left transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold uppercase text-white">
                {u.name.trim().charAt(0)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-zinc-800">{u.name}</span>
                <span className="block truncate text-xs text-zinc-400">{u.role}</span>
              </span>
            </button>
          ))}
          {users.length === 0 && !err && (
            <p className="text-sm text-zinc-400">Cargando perfiles…</p>
          )}
        </div>

        {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
      </div>
    </div>
  );
}
