"use client";

import { useEffect } from "react";

/**
 * Abre una acción "nuevo" cuando se llega con `?new=1` o cuando la paleta de
 * comandos dispara `sg:new` con el mismo `kind`. Limpia el parámetro de la URL
 * para no reabrir el modal al refrescar.
 */
export function useNewQuery(kind: string, onNew: () => void) {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("new") === "1") {
        onNew();
        url.searchParams.delete("new");
        window.history.replaceState({}, "", `${url.pathname}${url.search}`);
      }
    } catch {
      /* noop */
    }
    function handler(e: Event) {
      if ((e as CustomEvent).detail === kind) onNew();
    }
    window.addEventListener("sg:new", handler);
    return () => window.removeEventListener("sg:new", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
