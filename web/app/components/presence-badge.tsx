"use client";

import { useEffect, useRef, useState } from "react";
import { fetchJson } from "@/app/lib/client";
import { UiMark } from "@/app/components/ui";

interface PresenceResponse {
  online: number;
  window_minutes: number;
  users: { id: string; name: string; role: string }[];
  me: { id: string; name: string; role: string } | null;
}

/**
 * Esquina superior derecha: cuántos usuarios están en el sistema ahora mismo.
 *
 * Envía un latido a `/api/presence` al abrir y cada 30 s (mismo ritmo que el
 * badge de notificaciones), y vuelve a enviarlo al recuperar el foco de la
 * pestaña para que la cuenta no se caiga al cambiar de ventana.
 * La presencia se considera activa durante `window_minutes`.
 */
export default function PresenceBadge() {
  const [data, setData] = useState<PresenceResponse | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const beat = () => {
      fetchJson<PresenceResponse>("/api/presence", { method: "POST" })
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch(() => {});
    };
    beat();
    const timer = setInterval(beat, 30000);
    const onFocus = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
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

  const online = data?.online ?? 0;
  const solo = online === 1;
  const others = (data?.users ?? []).filter((u) => u.id !== data?.me?.id);

  return (
    <div ref={boxRef} className="absolute right-2 top-1 z-30">
      <div className="flex items-center gap-1">
        <UiMark id="N1" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={`Usuarios en línea: ${online} (últimos ${data?.window_minutes ?? 5} min)`}
          className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          {online} {solo ? "en línea" : "en línea"}
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-6 w-60 rounded-md border border-zinc-200 bg-white p-2 shadow-xl">
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Usuarios concurrentes
          </p>
          <ul className="space-y-0.5">
            {(data?.users ?? []).map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-xs text-zinc-700">
                <span className="truncate">{u.name}</span>
                <span className="shrink-0 text-[10px] text-zinc-400">
                  {u.id === data?.me?.id ? "tú" : u.role}
                </span>
              </li>
            ))}
            {online === 0 && <li className="px-1 py-1 text-xs text-zinc-400">Sin registro de actividad.</li>}
          </ul>
          <p className="mt-1 border-t border-zinc-100 px-1 pt-1 text-[10px] text-zinc-400">
            {online === 0
              ? `Sin actividad en los últimos ${data?.window_minutes ?? 5} minutos.`
              : `${others.length === 0 ? "Solo tú" : `${others.length} más`} en los últimos ${data?.window_minutes ?? 5} min.`}
          </p>
        </div>
      )}
    </div>
  );
}
