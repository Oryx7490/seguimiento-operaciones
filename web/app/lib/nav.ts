export type NavItem = {
  href: string;
  label: string;
  section: string;
  keywords?: string;
  children?: { href: string; label: string; section: string }[];
};

export const NAV: NavItem[] = [
  { href: "/", label: "Inicio", section: "inicio", keywords: "dashboard panel home" },
  { href: "/agenda", label: "Agenda", section: "agenda", keywords: "calendario actividades semana" },
  { href: "/gantt", label: "Gantt", section: "gantt", keywords: "cronograma planeacion" },
  { href: "/gantt-tickets", label: "Gantt tickets", section: "gantt_tickets", keywords: "cronograma tickets" },
  { href: "/proyectos", label: "Proyectos", section: "proyectos", keywords: "obras instalaciones" },
  { href: "/tickets", label: "Tickets", section: "tickets", keywords: "incidencias soporte" },
  { href: "/pendientes", label: "Pendientes", section: "pendientes", keywords: "tareas por hacer" },
  { href: "/pantallas-pendientes", label: "Pantallas por instalar", section: "pantallas_pendientes", keywords: "instalacion monitores" },
  { href: "/whatsapp", label: "Fotos WhatsApp", section: "whatsapp", keywords: "fotos imagenes galeria whatsapp etiquetas" },
  { href: "/notificaciones", label: "Notificaciones", section: "notificaciones", keywords: "avisos alertas" },
  { href: "/tecnico", label: "Mi agenda móvil", section: "tecnico_movil", keywords: "movil tecnico campo" },
  { href: "/ayuda", label: "Ayuda", section: "ayuda", keywords: "documentacion soporte manual" },
  { href: "/admin", label: "Configuración", section: "admin", keywords: "ajustes settings panel" },
];

export const ADMIN_SUB: readonly NavItem[] = [
  { href: "/admin/usuarios", label: "Usuarios", section: "admin.usuarios", keywords: "perfiles personas roles" },
  { href: "/admin/roles", label: "Roles y permisos", section: "admin.roles", keywords: "permisos secciones perfiles" },
  { href: "/admin/tecnicos", label: "Técnicos", section: "admin.tecnicos", keywords: "personal cuadrillas" },
  { href: "/admin/clientes", label: "Clientes", section: "admin.clientes", keywords: "cuentas empresas" },
  { href: "/admin/ubicaciones", label: "Ubicaciones", section: "admin.ubicaciones", keywords: "sitios direcciones" },
  {
    href: "/admin/catalogos",
    label: "Catálogos",
    section: "admin.catalogos",
    keywords: "listas valores",
    children: [
      { href: "/admin/controladores", label: "Controladores", section: "admin.controladores" },
      { href: "/admin/catalogo-pantallas", label: "Pantallas", section: "admin.catalogo_pantallas" },
    ],
  },
  { href: "/admin/especialidades", label: "Especialidades", section: "admin.especialidades", keywords: "habilidades" },
  { href: "/admin/calendario", label: "Calendario", section: "admin.calendario", keywords: "dias festivos laborables" },
  { href: "/admin/revision-pantallas", label: "Auditoría pantallas", section: "admin.revision_pantallas", keywords: "revision medidas" },
  {
    href: "/admin/inventario",
    label: "Inventario",
    section: "admin.inventario",
    keywords: "almacen stock",
    children: [{ href: "/admin/planeacion", label: "Planeación", section: "admin.planeacion" }],
  },
  { href: "/admin/cierre", label: "Cierre", section: "admin.cierre", keywords: "cierre proyectos" },
  { href: "/admin/horas-extra", label: "Horas extra", section: "admin.horas_extra", keywords: "overtime tiempo" },
  { href: "/admin/asistencia-fotos", label: "Asistencia por fotos", section: "admin.asistencia_fotos", keywords: "checador whatsapp entradas salidas jornada" },
  { href: "/admin/kpis-semanales", label: "KPIs semanales", section: "admin.kpis_semanales", keywords: "metricas indicadores" },
  { href: "/admin/notificaciones", label: "Notificaciones", section: "admin.notificaciones", keywords: "avisos alertas config" },
  { href: "/bitacora", label: "Bitácora", section: "bitacora", keywords: "log auditoria historial" },
  { href: "/admin/agentes", label: "Agentes CLI", section: "admin.agentes", keywords: "tokens automatizacion" },
];
