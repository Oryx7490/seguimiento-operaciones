"use client";

import { useEffect, useRef, useState } from "react";
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

/**
 * Selector "Quién eres".
 *
 * La aplicación no tiene login: sin esto el servidor no sabe qué persona
 * está operando y la bitácora ni el contador de usuarios concurrentes pueden
 * atribuírselas. La elección se guarda en la cookie `sg_uid` y la usa
 * `lib/session.ts` en toda la API.
 */
export default function UserSwitcher() {
  const [data, setData] = useState<SessionResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchJson<SessionResponse>("/api/session")
      .then(setData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  async function choose(id: string) {
    setSaving(id);
    setErr(null);
    try {
      const res = await fetchJson<{ user: SessionUser }>("/api/session", {
        method: "POST",
        body: JSON.stringify({ user_id: id }),
      });
      setData((prev) => (prev ? { ...prev, user: res.user } : prev));
      setOpen(false);
      // La bitácora y la presencia dependen del usuario: recargamos para que
      // todas las vistasetonitrile las acciones de la persona elegida.
      window.location.reload();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(null);
    }
  }

  const me = data?.user ?? null;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-100"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-semibold uppercase text-white">
          {me ? me.name.trim().charAt(0) : "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-zinc-800">{me ? me.name : "Quién eres…"}</span>
          <span className="block truncate text-[10px] text-zinc-400">
            {me ? ROLE_LABEL[me.role] ?? me.role : "Elige tu usuario"}
          </span>
        </span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-1 w-full rounded-md border border-zinc-200 bg-white p-1 shadow-xl">
          <p className="px-2 py-1 text-[10px] text-zinc-400">
            La bitácora y los usuarios en línea usan esta identidad.
          </p>
          <ul role="listbox" className="max-h-64 overflow-y-auto">
            {(data?.users ?? []).map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={u.id === me?.id}
                  disabled={saving !== null}
                  onClick={() => void choose(u.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-zinc-100 disabled:opacity-50 ${
                    u.id === me?.id ? "font-medium text-zinc-900" : "text-zinc-700"
                  }`}
                >
                  <span className="truncate">{u.name}</span>
                  <span className="shrink-0 text-[10px] text-zinc-400">{ROLE_LABEL[u.role] ?? u.role}</span>
                </button>
              </li>
            ))}
            {!data && <li className="px-2 py-1 text-xs text-zinc-400">Cargando usuarios…</li>}
          </ul>
          {err && <p className="px-2 py-1 text-[10px] text-red-600">{err}</p>}
        </div>
      )}
    </div>
  );
}
