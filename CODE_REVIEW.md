# Revision tecnica y preparacion movil

Fecha: 2026-09-27

## Hallazgos criticos

1. No existe autenticacion ni autorizacion real. Cualquier persona con acceso al puerto puede leer datos, crear administradores, generar tokens o borrar proyectos. Referencias: `web/app/lib/api.ts`, `web/app/api/users/route.ts`, `web/app/api/agent-tokens/route.ts`.
2. Las migraciones `039` y `041` a `046` estan aplicadas en PostgreSQL pero no versionadas. Un despliegue limpio no puede reproducir el esquema actual.
3. El PATCH de controladores esta roto. En `web/app/api/controllers/[id]/route.ts`, `$1` se usa simultaneamente para el ID y el primer valor actualizado.
4. Los cierres pueden saltarse el checklist mandando directamente `status: "closed"`, sin usar `close_project` o `close_ticket`. Referencia: `web/app/api/projects/[id]/route.ts`.
5. El borrado definitivo de tickets falla si tienen actividades exclusivas, porque el trigger impide dejar actividades sin proyecto, ticket o tipo interno. Referencia: `web/app/api/admin/tickets/[id]/delete/route.ts`.
6. Editar controladores de una pantalla elimina y recrea asignaciones, perdiendo `notes` e `installed`. Referencia: `web/app/api/projects/[id]/route.ts`.

## Hallazgos altos

1. Los tokens de agentes se pueden crear y revocar sin autenticacion. Tampoco tienen scopes ni vencimiento.
2. Documentos confidenciales de tecnicos son accesibles sin permisos, incluyendo CURP, NSS, domicilios y archivos de identificacion.
3. `actor_id` viene del cliente y permite falsificar auditoria o editar comentarios como otra persona.
4. El filtro "Ocultar pantallas con equipos" usa `hideAssigned`, pero lo omite de las dependencias del `useMemo` en `web/app/admin/planeacion/page.tsx`.
5. Los totales de planeacion son inconsistentes: el resumen global multiplica controlador por cantidad de pantallas, pero "Faltan por instalar" no lo hace.
6. Importar CSV puede sobrescribir estado, ETA, dimensiones, observaciones o numeros de serie cuando esos campos no vienen en el archivo.
7. El cambio de estado en V3 no contempla `waiting_authorization`, `waiting_materials`, `ready_install` ni `pending_docs`.
8. Las fechas pueden mostrarse un dia antes porque `new Date("YYYY-MM-DD")` se interpreta como UTC. Referencia: `web/app/lib/format.ts`.
9. La procedencia de controladores se elimino sin migrarla a comentarios. La migracion `044` ya esta aplicada; recuperar datos requiere un respaldo previo.
10. Los borrados definitivos eliminan filas de PostgreSQL, pero pueden dejar objetos huerfanos en MinIO.

## Integridad y rendimiento

1. Agregar indices para consultas y cascadas frecuentes: `activity_projects(project_id, activity_id)`, `activity_technicians(technician_id, activity_id)`, `project_closure_controllers(project_id)`, indices por `screen_id` y colas de eliminacion pendientes.
2. Implementar control de concurrencia con `version` o `If-Match`; actualmente clientes con datos viejos pueden sobrescribir cambios recientes.
3. Validar que pantallas, controladores y adjuntos de cierre pertenezcan al mismo proyecto.
4. Hacer obligatorio `module_count > 0` para lotes usados en el cierre.
5. Separar inventario disponible, ordenado y en transito en los calculos, usando `expected_arrival` para proyecciones.
6. Normalizar marca y lote de forma insensible a mayusculas en todas las comparaciones.
7. Agregar paginacion, limites de importacion y limites previos al parseo de archivos.
8. Implementar limpieza confiable de objetos MinIO mediante outbox o tarea de recoleccion.

## Frontend y experiencia de usuario

1. `useResource` no limpia errores o datos anteriores al cambiar de URL, no cancela solicitudes y puede mostrar resultados obsoletos.
2. Los modales nativos no sincronizan correctamente el cierre mediante Escape con el estado de React.
3. Los labels no estan asociados programaticamente con inputs mediante `htmlFor` e `id`.
4. Los selects personalizados carecen de navegacion completa por teclado y semantica ARIA.
5. Muchos controles son menores al minimo recomendado de 44 px para uso tactil.
6. Gantt y agenda dependen de arrastrar elementos, una interaccion poco confiable en pantallas tactiles.
7. Hay estados, colores, botones y tablas implementados varias veces, sin una unica fuente de verdad.
8. Existen componentes muy grandes, como las paginas de proyecto, agenda y Gantt, que deben separarse por dominio.

## Preparacion para aplicacion movil

1. El sidebar fijo `w-52` deja poco espacio util en telefonos y necesita una navegacion movil independiente.
2. Las tablas de 760 a 960 px deben convertirse en tarjetas y vistas de detalle en movil.
3. Separar interfaces por audiencia: coordinador y administracion en escritorio; tecnico en movil.
4. Priorizar en movil: Hoy, Mis actividades, Tickets, Evidencias, Notificaciones y Perfil.
5. Implementar API tipada con autenticacion, scopes, paginacion, idempotencia, errores estables y control de versiones.
6. Agregar modo offline con cache local, cola de operaciones y estados pendiente, sincronizado y conflicto.
7. Las fotografias necesitan compresion, progreso, reintentos y carga reanudable.
8. No envolver la interfaz actual en un WebView. Primero debe estabilizarse la API y el modelo de seguridad.
9. Expo/React Native es una opcion adecuada despues de estabilizar la API. Se pueden compartir tipos, validaciones y logica de dominio, pero no componentes HTML.

## Orden recomendado

1. Implementar autenticacion, sesiones, roles y permisos del lado del servidor.
2. Versionar las migraciones ya aplicadas y corregir el PATCH de controladores.
3. Corregir cierres, eliminaciones, relaciones entre proyectos y preservacion de planeacion.
4. Agregar pruebas automatizadas de integracion para operaciones destructivas y transiciones de estado.
5. Consolidar componentes y contratos de API.
6. Crear shell movil, navegacion inferior y vistas responsivas.
7. Implementar offline/PWA y despues evaluar el cliente nativo.

## Verificacion realizada

- TypeScript dentro de Docker: correcto.
- Build de produccion: inicia correctamente.
- ESLint: 10 advertencias.
- `npm audit --omit=dev`: 4 vulnerabilidades moderadas en dependencias de MinIO.
- No existen pruebas automatizadas configuradas.
- El arbol de trabajo contiene numerosos cambios y migraciones sin commit.

## Pruebas prioritarias faltantes

1. Autenticacion y autorizacion por rol para cada API.
2. Borrado definitivo de proyectos y tickets con actividades compartidas o exclusivas.
3. Cierre de proyectos y tickets sin posibilidad de saltarse el checklist.
4. Preservacion de notas e instalacion al editar controladores.
5. Importacion CSV sin borrar campos omitidos.
6. Fechas en `America/Mexico_City`.
7. Concurrencia y conflictos de version.
8. Carga de fotografias con reintento e idempotencia.
9. Pruebas moviles en 320, 360, 390 y 430 px.
10. Flujo offline, reintentos y resolucion de conflictos.
