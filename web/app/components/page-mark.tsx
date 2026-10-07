"use client";

import { usePathname } from "next/navigation";
import { UiMark } from "@/app/components/ui";

const PAGES: { path: string; id: string; exact?: boolean }[] = [
  { path: "/", id: "V1", exact: true },
  { path: "/agenda", id: "V35" },
  { path: "/gantt-tickets", id: "V34" },
  { path: "/gantt", id: "V2", exact: true },
  { path: "/proyectos", id: "V3", exact: true },
  { path: "/proyectos/", id: "V4" },
  { path: "/tickets", id: "V5", exact: true },
  { path: "/tickets/", id: "V6" },
  { path: "/pendientes", id: "V7" },
  { path: "/notificaciones", id: "V8" },
  { path: "/tecnico/perfil", id: "V10" },
  { path: "/tecnico", id: "V9" },
  { path: "/ayuda", id: "V11" },
  { path: "/admin", id: "V12", exact: true },
  { path: "/admin/usuarios", id: "V13" },
  { path: "/admin/tecnicos", id: "V14", exact: true },
  { path: "/admin/tecnicos/", id: "V15" },
  { path: "/admin/clientes", id: "V16" },
  { path: "/admin/ubicaciones", id: "V17" },
  { path: "/admin/catalogos", id: "V18" },
  { path: "/admin/especialidades", id: "V19" },
  { path: "/admin/calendario", id: "V20" },
  { path: "/admin/controladores", id: "V21" },
  { path: "/admin/catalogo-pantallas", id: "V37" },
  { path: "/admin/inventario", id: "V22" },
  { path: "/admin/planeacion", id: "V23" },
  { path: "/admin/cierre", id: "V24" },
  { path: "/admin/horas-extra", id: "V25" },
  { path: "/admin/horas-hombre", id: "V26" },
  { path: "/admin/notificaciones", id: "V27" },
  { path: "/admin/agentes", id: "V28" },
  { path: "/admin/archivo", id: "V29" },
  { path: "/admin/pantallas", id: "V30" },
  { path: "/admin/proyeccion", id: "V31" },
  { path: "/admin/proyectos", id: "V32" },
  { path: "/admin/mejoras", id: "V33" },
  { path: "/bitacora", id: "V36" },
];

export function pageMark(path: string): string | null {
  const hit = PAGES.find((p) => (p.exact ? path === p.path : path === p.path || path.startsWith(p.path)));
  return hit?.id ?? null;
}

export default function PageMark() {
  const id = pageMark(usePathname() || "/");
  if (!id) return null;
  return (
    <div className="pointer-events-none sticky top-0 z-20 h-0">
      <span className="absolute left-2 top-1">
        <UiMark id={id} />
      </span>
    </div>
  );
}
