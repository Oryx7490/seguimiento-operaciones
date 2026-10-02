# Constraints & Decisions Log

## 0.4.0 — Planeación, cierre V4 y operación centralizada (2026-10-02)

> Versión estable. Consolida la planeación de inventario, el cierre V4, la documentación adjunta y la operación centralizada. El nav lee la versión desde `web/package.json` (v0.4.0).

### Migraciones pendientes de commit (todas aplicadas en BD)
- `039_inventory_lot_details.sql`: `pitch_mm`, `module_type`, `led_type`, `observations`, `ic_serial_1/2/3` en `inventory_lots`.
- `041_inventory_lot_status.sql`: `status` (`available`/`ordered`/`in_transit`, default `available`).
- `042_inventory_lot_eta.sql`: `expected_arrival` date (solo aplica a `ordered`/`in_transit`; se limpia al pasar a `available`).
- `043_planning_notes.sql`: `notes` en `project_screens` y `screen_controllers` (comentarios opcionales de planeación).
- `044_drop_controller_ownership.sql`: elimina `ownership` + CHECK de `controller_catalog`. La procedencia pasa a comentarios del proyecto. Sin backfill: valores previos `propio/cliente/tercero` se pierden (ver `CODE_REVIEW.md`).
- `045_controller_installed.sql`: `installed` boolean default `false` en `screen_controllers`.
- `046_inventory_module_dims.sql`: `width_mm`/`height_mm` default `320`/`160` + CHECK `> 0` en `inventory_lots`.
- `047_screen_install_status.sql`: `installed`/`cancelled` default `false` + `cancel_reason` en `project_screens`.
- `048_project_status_settings.sql`: tabla de etiqueta/color configurable por código fijo `project_status`, con seed para los diez estados.
- `049_ticket_closure_equipment_serial.sql`: `equipment_serial_number` opcional en `ticket_closures`.

### Planeación de inventario (nuevo: `/admin/planeacion` + `/api/planning`)
- Tabla proyecto → pantallas con m², pitch, controladores considerados y comentarios por pantalla/controlador (PATCH `target: screen|controller`, `NOTES_MAX=2000`, guarda al salir del campo).
- Resumen global (proyectos, pantallas, m²), demanda agregada por controlador (`quantity × pantallas`) y recuadro **Faltan por instalar** (ámbar/verde) con conteo de pantallas sin equipos asignados.
- Checkbox **instalado** por controlador (línea tachada) con `PATCH { target: controller, installed }`; optimista con rollback en error.
- Buscadores proyecto/cliente y equipo/controlador (nombre o marca); orden ▲▼ en Proyecto, Pantalla, Pitch, Metraje, Controladores y Comentario (primer clic = mayor a menor, vacíos al final). Ordenar Pantalla/Pitch/Metraje/Controladores/Comentario aplana filas (sin rowspan); ordenar Proyecto agrupa.
- Filtro **Ocultar pantallas con equipos / Mostrar todas**. Conocido: falta `hideAssigned` en deps del `useMemo` (advertencia ESLint vigente).
- Columna **Pitch** dedicada (`P2.5` o `—`).
- Nav: **Inventario → Planeación** (hijo en `ADMIN_SUB` + tarjeta en dashboard admin).

### Cierre: confirmar equipos de planeación (V4)
- Nuevo `GET /api/projects/[id]/screen-controllers`: `{ screen_id, controller_id, quantity }` de la cotización.
- Botón **Confirmar equipos de planeación** en `ProjectClosure` → copia faltantes a filas de cierre (sin duplicados por `screen_id|controller_id`), mensaje de éxito o error si no hay equipos.

### Catálogo de controladores sin procedencia
- API: `GET/POST/PATCH` de `/api/controllers` ya no aceptan ni devuelven `ownership`; `GET /api/projects/[id]` tampoco.
- UI: sin columna **Procedencia** ni selector; copy actualizado (la procedencia va en comentarios del proyecto). Tipos `Controller`/`ScreenController` sin `ownership`; planeación sin columna de procedencia.

### Inventario de módulos: m² por módulo
- Columna **m² / módulo** (`ancho × alto / 1e6`, p. ej. 320×160 mm = `0.0512 m²`) + total del lote (`m² × cantidad`).
- Formulario con **Ancho/ Alto (mm)** precargados `320`/`160`; validación `> 0`; CSV/import sin esos campos usa los defaults; `status` ausente normaliza a `available` (ver riesgo CSV en `CODE_REVIEW.md`).
- APIs `POST/PATCH/import` persisten `pitch_mm`, `module_type`, `led_type`, `observations`, `ic_serial_1/2/3`, `status`, `expected_arrival`, `width_mm`, `height_mm`.

### V4 pantallas: instalada / cancelada con motivo + menú ⋮
- Rama `statusOnly` en `PATCH /api/projects/[id]`: actualiza `installed`/`cancelled`/`cancel_reason` sin exigir dimensiones.
- Reglas: cancelar exige motivo no vacío y fuerza `installed=false`; instalar limpia `cancelled`/`cancel_reason`; reactivar limpia motivo.
- Acciones pasa de botones a menú **⋮** fijo (Editar, Marcar/Quitar instalada, Cancelar instalación, Reactivar, Eliminar; cierra con clic fuera/`Esc`/scroll).
- Fila cancelada con opacidad + texto tachado y motivo visible; instalada con insignia verde.
- GET de proyecto expone `installed`, `cancelled`, `cancel_reason`; tipos `ProjectScreen` actualizados.

### Gantt: editar etapa completa
- `PhaseEditModal` edita descripción, estado (`planned`, `not_started`, `in_progress`, `completed`, `blocked`, `not_applicable`), fechas y bloqueo (motivo + próxima acción + fecha obligatorios si `blocked`); aviso si `not_applicable` oculta la barra.
- `GET /api/gantt` ahora trae `blocked_reason`, `next_action`, `next_action_date`.

### V34 Gantt de tickets abiertos
- Nueva ruta `/gantt-tickets` y acceso principal **Gantt tickets** junto al Gantt de proyectos.
- Nuevo `GET /api/ticket-gantt`: tickets con estado distinto de `closed`/`cancelled`, cliente, prioridad, próxima acción y actividades no canceladas con fechas, horas y técnicos.
- Una fila por ticket; barras por actividad (`planned`, `in_progress`, `completed`) y marcador rosa de próxima acción. Tickets sin actividad/fecha permanecen visibles al final como **Sin programación**.
- Buscadores por código/título/cliente, filtro por estado abierto, escalas semana/2 semanas/mes, navegación día anterior/Hoy/día siguiente, línea de hoy y links al detalle de ticket/Agenda/Lista.
- Arrastre de actividades para cambiar `date`/`end_date` conservando duración; `pointercancel` revierte la previsualización sin guardar.
- Asignación directa por ticket: técnicos activos mínimos desde `/api/ticket-gantt`, modal `W40` para asignar (`POST /api/assignments`) o quitar (`DELETE /api/assignments/[id]`), y nombres visibles en cada renglón.
- Marcador de vista `V34`. API y página HTTP 200; TypeScript y ESLint sin errores en los archivos nuevos.

### V3 estado inline + voltaje W30
- Columna **Estado** en `/proyectos` abre modal `W41` con dropdown completo: Nuevo, Planeación, Esperando autorización, Esperando materiales, Armado, Listo para instalar, Instalación, Pendiente de documentos, Cerrado y Cancelado. Default de proyecto nuevo sigue `new` (etiqueta **Nuevo**).
- Seleccionar **Cerrado** ejecuta `close_project` y valida el checklist de V4; **Cancelado** pide confirmación y usa `DELETE /api/projects/[id]` (cancelación lógica, desaparece de la lista activa). Proyectos ya cerrados muestran badge sin flecha.
- W30 voltaje muestra **110V / 220V** (valores guardados siguen `110ac`/`220ac`).

### V18 colores y etiquetas configurables de estados
- Nueva pestaña **Estados de proyecto** en Catálogos: código interno solo lectura, nombre visible editable, selector de color + hexadecimal `#RRGGBB`, vista previa y guardado por estado.
- Nuevo `GET/PATCH /api/catalogs/project-statuses`; valida código técnico, etiqueta no vacía y color hexadecimal.
- V3 consume esta configuración para el texto, borde, fondo y color de la columna Estado, y también para las opciones del dropdown. Los códigos del enum y las reglas de negocio permanecen fijos.
- Corrección de navegación: `/gantt-tickets` ya no activa simultáneamente el enlace `/gantt` (coincidencia exacta o subruta real).

### W34 nuevo proyecto: buscador y alta rápida de clientes
- Cliente cambia de `Select` a `SearchableSelect` (`N9`): muestra los cinco clientes más usados, busca por nombre y mantiene opción **Sin cliente**.
- `SearchableSelect` incorpora props reutilizables `onCreate(query)` y `clearLabel`; si no existe coincidencia exacta muestra **+ Agregar “nombre”**.
- Formulario rápido dentro de W34: nombre obligatorio, contacto/teléfono/correo opcionales; usa `POST /api/clients`, agrega el resultado a la lista y lo selecciona automáticamente sin perder los datos del proyecto.

### V6 cierre de ticket: número de serie reparado
- Campo **Número de serie del equipo o pantalla reparada** dentro de Tipo de servicio; opcional, máximo 200 caracteres y persistido tanto al guardar checklist como al cerrar.
- `GET/PATCH /api/tickets/[id]` lee, valida y guarda `equipment_serial_number`; la vista cerrada lo muestra junto a la nota de reparación.

### V31 proyección con proyecto primero
- Tabla resumen pasa de tipo×horizonte a **proyecto×horizonte**: primera columna **Proyecto** (nombre, código, cliente) con rowspan por tipo de pantalla; detalle por horizonte también con nombre arriba y código debajo.

### V1 agenda sin Horas plan/real
- Fuera: tarjeta resumen, `· {planned}h plan / {worked}h real` por técnico y `worked/planned` en tarjetas (ahora solo `{planned_hours}h`). Quedan advertencias ESLint por variables no usadas (`plannedTotal`, `workedTotal`, `planned`, `worked`).

### Marcas UI (V/W/N) + navegación
- `UiMark` (gris `text-[10px]`, esquina superior, `pointer-events-none`) + `Modal mark` (W1–W39), `PageMark` (V1–V33 según ruta, en `layout.tsx`), menús N1 (nav), N2 (Administración), N3 (⋮ Gantt), N4 (columnas) y `SearchableSelect mark` (N5–N8 en agenda).
- Nav con grupos hijos: **Catálogos → Controladores**, **Inventario → Planeación**; padre con estado activo tenue cuando el hijo está activo.

### Archivo V29: borrado definitivo
- `POST /api/admin/projects/[id]/delete` selecciona `status` real para el historial y borra primero actividades exclusivas del proyecto (evita trigger de huérfanas) antes del `DELETE`; error detallado en respuesta.

### Misc
- Dashboard admin: tarjeta **Planeación de inventario** y copy de Controladores actualizado.
- `compose.yaml` sigue en `build && start`: tras editar hay que reconstruir con `docker compose up -d --force-recreate web`.

### Zona horaria del sistema
- Error detectado: el host Linux está en `Etc/UTC`; por eso ejecutar `date` reportó 1 de octubre aunque en CDMX todavía era 30 de septiembre.
- Aplicación verificada: `web` y `worker` reciben `TZ`/`DEFAULT_TIMEZONE=America/Mexico_City`; Node Intl muestra CST (UTC-6). PostgreSQL usa `America/Mexico_City` y `now()` coincide con CDMX.
- El cambio del host requiere autenticación administrativa interactiva y quedó bloqueado desde el agente (`timedatectl: Access denied`). Comando pendiente: `sudo timedatectl set-timezone America/Mexico_City`.

## 0.3.1 — Gantt: menú por proyecto, enfoque de un proyecto y fecha editable de actividad (2026-09-26)

### Menú contextual por proyecto en el Gantt
- Botón **⋮** en cada renglón de `/gantt` con tres acciones: enfocar/quitar enfoque, **Agregar etapa** y ver el detalle del proyecto.
- El menú se posiciona en `fixed` con `getBoundingClientRect` del botón para que el `overflow-x-auto` de la tabla no lo recorte; cierra al hacer clic fuera, con `Esc` o al hacer scroll.
- Solo un menú abierto a la vez (estado `menu` en `GanttView`).

### Enfoque de un proyecto a la vez
- Estado `focusId`: el Gantt muestra únicamente ese proyecto y lo resalta en azul, para analizarlo sin la información simultánea del resto.
- Chip en la barra de herramientas con `Analizando <código> · <nombre>` y botón **Mostrar todos**; sin enfoque se muestra la pista de usar el menú ⋮.

### Alta de etapas desde el Gantt
- Modal **Agregar etapa** con nombre, tipo de etapa (catálogo `phase_catalog`, define el color de la barra) y fechas planificadas inicio/fin opcionales (fin vacío = fase abierta).
- Valida nombre obligatorio y que el fin no sea anterior al inicio.
- Reusa el `PATCH /api/projects/[id]` con `phases: [{...}]` sin `id` (rama INSERT existente); no requirió cambios de backend.
- El `sort_order` enviado es `fases del proyecto + 1` para que la etapa nueva quede al final.

### Agenda: fecha editable y búsqueda de proyectos/tickets
- **Nueva actividad**: la fecha pasa de texto de solo lectura a `TextInput type="date"` con estado propio `activityDate`, inicializada con el día clicado; se envía en el `POST /api/activities`. Validación de fecha obligatoria en cliente.
- **Buscador en nueva actividad**: proyectos y tickets usan `SearchableSelect` con `topN={5}` y orden por recencia (`last_activity_at`/`updated_at`); excluye tickets cancelados y mantiene el filtro de proyectos en curso salvo "mostrar también proyectos cerrados".

### Misc
- Versión leída desde `package.json` en el nav (v0.3.1).
- `compose.yaml` corre `npm run build && npm start`: tras editar el código hay que reconstruir con `docker compose up -d --force-recreate web` (un `up -d` no recompila si el contenedor ya está arriba).

## 0.3.0 — Cierre resuelto por cliente, borrado de tickets, tipo de pantalla y Proyección (2026-09-24)

### Cierre de tickets "resuelto por el cliente"
- Migración `029_ticket_closure_client_resolved.sql`: `client_resolved` en `ticket_closures` + CHECK (exclusivo con warranty/billable).
- UI: radio "Tipo de servicio" (Visita pagada / Garantía / Resuelto por el cliente / Sin cargo) con nota contextual; vista de solo lectura.

### Borrado de tickets en dos pasos
- Migración `030_ticket_deletion_request.sql`: `deletion_requested_at/by`, `deletion_reason` en `tickets`.
- Usuario en `/tickets/[id]`: "Solicitar eliminación" (PATCH `request_deletion`, motivo obligatorio) → alerta roja pendiente + "Cancelar solicitud" (PATCH `cancel_deletion`).
- Admin en `/admin/archivo` → pestaña **"Tickets a eliminar"**: aprobar (POST `[id]/delete` = DELETE definitivo, CASCADE comentarios/cierre/asignaciones; `activities` quedan con `ticket_id = NULL` por `ON DELETE SET NULL`) o rechazar (DELETE `[id]/delete`).
- Se registra `status_history` con `from_status=<actual>` → `to_status='deleted'` (auditoría conservada) antes de eliminar.

### Tipo de pantalla en proyectos
- Migraciones `031_screen_environment.sql`, `032_screen_environment_semi_exterior.sql`, `033_screen_environment_interior_flexible.sql`: columna `environment` con CHECK.
- Modal y tabla de pantallas: **Tipo** = dropdown (Exterior / Interior / Semi Exterior / Interior Flexible, obligatorio) y texto libre renombrado a **Descripción**; columna Cantidad centrada; badges por tipo.
- Filtro de pitch en Proyección (chips), validación server.

### Proyección de m² a instalar (admin)
- `/admin/proyeccion`: m² por tipo agrupados en corto/mediano/largo plazo, cards resumen, tabla tipo×horizonte y detalle expandible; API `/api/reports/screen-projection` con filtro por pitch.

### Misc
- Gantt: línea "Hoy" centrada y orden por defecto (hoy/futuro arriba, pasado/sin fechas abajo).
- Selector de columnas en listas de tickets y proyectos.
- Menú lateral reordenado: Agenda, Gantt, Proyectos, Tickets, resto.
- Versión leída desde `package.json` en el nav (v0.3.0).

- Versión leída desde `package.json` en el nav (v0.3.0).

### Nuevas características (v0.3.0 continuación)
- **Controladores de pantalla (catálogo)**: migración `035_controllers.sql` con tabla `controller_catalog`, `screen_controllers` (equipos de cotización por pantalla) y `project_closure_controllers` (equipos definitivos con números de serie). Seed inicial con Novastar/Colorlight/Brompton.
- **Admin → Controladores**: página `/admin/controladores` con CRUD completo (modelo, marca, procedencia propio/cliente/tercero) y links en dashboard y menú lateral.
- **Pantallas por proyecto**: columna "Controladores" en tabla de pantallas con editor por pantalla para seleccionar equipos de cotización desde el catálogo y su cantidad. Se guarda junto con la pantalla.
- **Cierre de proyecto**: sección de "Equipos definitivos instalados" con números de serie por pantalla; puede diferir de la cotización. Persistido en `project_closure_controllers` y visible en modo cerrado.
- **Cierre administrativo**: endpoints y UI para tickets con cobro (pipeline de cierre + facturación/ID de factura), y enlace a `/admin/cierre` con pestañas Proyectos/Tickets.

## 0.2.1 — Archivo administrativo + borrado en dos pasos + m² report (2026-09-23)

### Borrado de proyectos en dos pasos
- Migración `026_project_deletion_request.sql`: `deletion_requested_at/by`, `deletion_reason` en `projects`.
- Usuario en detalle: "Solicitar eliminación" (PATCH `request_deletion`) con motivo obligatorio → alerta roja + "Cancelar solicitud" (PATCH `cancel_deletion`).
- El proyecto NO se borra: la solicitud queda pendiente de autorización del admin.

### `/admin/archivo` — sección unificada de revisión
- Pestaña **Solicitudes de eliminación**: admin aprueba (POST `[id]/delete` = DELETE definitivo en cascada) o rechaza (DELETE `[id]/delete` = conserva proyecto).
- Pestaña **Proyectos cerrados**: GET `/api/admin/projects/closed`; POST `/api/admin/projects/[id]/restore` → restaura al estado anterior al cierre (lo lee de `status_history`, fallback `planning`).
- Pestaña **Tickets cerrados**: GET `/api/admin/tickets/closed`; POST `/api/admin/tickets/[id]/reopen` → reabre al estado anterior al cierre (fallback `to_review`).
- Restauración inteligente: usa el `from_status` del último `status_history` con `to_status='closed'`, nunca hardcodea.
- Dashboard admin apunta a `/admin/archivo` (reemplaza `/admin/proyectos`).

### Estimación m² a instalar (admin)
- API `/api/reports/screens-m2` (`months` + `anchor`): filtra proyectos por `planned_end_date` en periodo, agrupa por mes/tipo.
- UI `/admin/pantallas`: horizonte 1/3/6/12 meses, navegación ←/Hoy/→, cards resumen, tabla tipo×mes con totales, detalle expandible por proyecto.

## 023_improvement_entity_type.sql (2026-09-22)
**Enum**: `entity_type` += `improvement` para status_history de mejoras.

## 022_improvements.sql (2026-09-22)
**Tabla**: `improvements`
- Campos: `title`, `description`, `category` (feature/bug/ux/other), `priority` (low/medium/high/critical), `status` (open/in_progress/done/wontfix), `reporter_name/email`, `assigned_to`, `resolution`, `closed_at/closed_by`, `created_at/updated_at`
- Índices en status, category, assigned_to
- Trigger `updated_at`

## 021_ticket_closures.sql (2026-09-22)
**Tabla**: `ticket_closures`
- `repair_note`, `billing_authorized`, `billable`, `warranty` (mutually exclusive), `charge_amount`, `charge_description`, `authorized_by/at`, `invoice_generated/id`, `notes`
- `warranty=true` → auto `billable=false`, `billing_authorized=false`

## 020_ticket_repair_note.sql (2026-09-22)
**Columna**: `repair_note` en `tickets` para nota de reparación al cerrar.

## 019_screen_pitch.sql (2026-09-20)
**Columna**: `pitch_mm` numeric en `project_screens`.
- Pixel pitch en milímetros (ej. 1.2, 1.5, 2.5, 3.9).
- Opcional; validado ≥ 0 en frontend y server.

## 018_screen_constraints.sql (2026-09-20)
**Constraint**: `screen_dims_regular` en `project_screens`
```sql
CHECK (
  (is_irregular = false AND width_m IS NOT NULL AND height_m IS NOT NULL)
  OR (is_irregular = true AND area_m2 IS NOT NULL)
)
```
**Regla**: Pantalla regular → `width_m > 0` y `height_m > 0` obligatorios.  
Pantalla irregular → `area_m2 > 0` obligatorio.  
Bloquea en BD cualquier INSERT/UPDATE incoherente.

**Validación server (PATCH /api/projects/[id])**:
- Verifica coherencia antes de INSERT/UPDATE:
  - `willBeIrregular` → exige `area_m2 > 0`
  - regular → exige `width_m > 0` y `height_m > 0`
  - `quantity > 0`
- Devuelve 400 con mensaje claro si falla.

## Frontend validations (web/app/proyectos/[id]/page.tsx)
- **ScreenModal.submit()**: rechaza `quantity ≤ 0` con error visible (`"Cantidad debe ser un número > 0"`).
- **ScreenModal**: valida `width/height > 0` (regular) y `area > 0` (irregular) antes de enviar.
- **ScreenPdf.upload()**:
  - Límite client-side 25 MB (`MAX_BYTES = 25*1024*1024`) con mensaje antes de subir.
  - Mutex `uploadMutex` serializa subidas → evita reloads concurrentes de `onChanged()`.

## NotApplicableChecklist (web/app/proyectos/[id]/page.tsx)
- Al abrir modal: `origStatus[ph.id] = ph.status` (estado actual real).
- Al **marcar** N/A (`handleCheck(id, true)`): captura el estado actual en `origStatus[id]` para restaurarlo al desmarcar.
- Al **desmarcar**: usa `origStatus[id]` → recupera `planned`, `in_progress`, etc., no siempre `not_started`.
- Texto actualizado: "al desmarcarlas recuperan su estado anterior".

## Phase status "planned" (017_phase_planned.sql)
- Enum `project_phase_status` += `planned`.
- Wireado en: `types.ts`, `format.ts:phaseStatusLabel`, `ui.tsx:PHASE_BADGE/PHASE_LABEL`, `page.tsx:PHASE_STATUS_OPTIONS`, `gantt-view.tsx:statusLabel`.
- Default de fase nueva sigue siendo `not_started` (no solicitado cambiarlo).

## Pantallas por proyecto
- Tabla `project_screens`: `width_m`, `height_m`, `is_irregular`, `area_m2`, `pitch_mm`, `m2` calculado en SQL.
- `attachments.screen_id` + constraint `attachment_exactly_one_entity` actualizado (sum = 1 entre project_id/ticket_id/screen_id).
- API GET devuelve `m2` (unitario) y `attachment[]` por pantalla.
- UI: tabla con m² total = `m2 * quantity`; modal Regular/Irregular; PDF por fila.
- **Pitch (mm)**: campo `pitch_mm` numeric opcional; mostrado en tabla como "X mm"; input en modal con placeholder "P. ej. 1.5"; validación ≥ 0.

## Mejoras y feedback (admin)
- **Tabla**: `improvements` con campos completos + índices + trigger `updated_at`
- **API**: GET/POST/PATCH/DELETE `/api/improvements` + `/api/improvements/[id]`
- **Admin UI** (`/admin/mejoras`): tabla filtrable (estado/categoría/prioridad), modal crear/editar, cierre con resolución obligatoria, badges coloreados
- **Integración**: link en `/admin` dashboard, reusa `CommentSection` + `AttachmentsSection`, status_history via enum `entity_type` += `improvement`

## Ticket cierre con facturación
- Componente `TicketClosure`: nota reparación obligatoria, checkboxes warranty/billable/billing_authorized (lógica mutuamente excluyente), monto/concepto si facturable, autorización de cobro
- API `/api/tickets/[id]` PATCH: campo `close_ticket` + `closure` object, validaciones server (repair_note obligatorio, billing_authorized si billable, monto > 0)
- UI en `/tickets/[id]`: sección "Cierre del ticket" integrada

## Project detail mejoras
- Editar nombre del proyecto: icono lápiz junto al nombre, modal con validación
- Column selector en tabla de fases: checkboxes Estado/Inicio/Fin/Responsable/Bloqueo/m² total (pantallas)
- Columna m² total calculada = sum(screens.m2 * quantity) por proyecto

## Gantt navegación día a día
- Botones "← Día" / "Hoy" / "Día →" en header Gantt
- `dayOffset` state + `shiftDay(delta)` / `goToToday()` actualizan `from` base
- Verificado E2E: fecha cambia correctamente

## Notificaciones - validación
- Endpoint `POST /api/notifications/validate`: re-evalúa notificaciones no leídas vs condiciones actuales, elimina obsoletas
- Botón "Validar notificaciones" junto a "Generar alertas ahora" y "Marcar todo como leído"
- Templates validados: activity_overdue, project_blocked, next_action_overdue, ticket_unassigned/no_update/resolved_unvalidated, installation_no_delivery_sheet, hours_over_planned

## 016_screen_constraints.sql (2026-09-20)
**Constraint**: `screen_dims_regular` en `project_screens`
```sql
CHECK (
  (is_irregular = false AND width_m IS NOT NULL AND height_m IS NOT NULL)
  OR (is_irregular = true AND area_m2 IS NOT NULL)
)
```
**Regla**: Pantalla regular → `width_m > 0` y `height_m > 0` obligatorios.  
Pantalla irregular → `area_m2 > 0` obligatorio.  
Bloquea en BD cualquier INSERT/UPDATE incoherente.

**Validación server (PATCH /api/projects/[id])**:
- Verifica coherencia antes de INSERT/UPDATE:
  - `willBeIrregular` → exige `area_m2 > 0`
  - regular → exige `width_m > 0` y `height_m > 0`
  - `quantity > 0`
- Devuelve 400 con mensaje claro si falla.

## Frontend validations (web/app/proyectos/[id]/page.tsx)
- **ScreenModal.submit()**: rechaza `quantity ≤ 0` con error visible (`"Cantidad debe ser un número > 0"`).
- **ScreenModal**: valida `width/height > 0` (regular) y `area > 0` (irregular) antes de enviar.
- **ScreenPdf.upload()**:
  - Límite client-side 25 MB (`MAX_BYTES = 25*1024*1024`) con mensaje antes de subir.
  - Mutex `uploadMutex` serializa subidas → evita reloads concurrentes de `onChanged()`.

## NotApplicableChecklist (web/app/proyectos/[id]/page.tsx)
- Al abrir modal: `origStatus[ph.id] = ph.status` (estado actual real).
- Al **marcar** N/A (`handleCheck(id, true)`): captura el estado actual en `origStatus[id]` para restaurarlo al desmarcar.
- Al **desmarcar**: usa `origStatus[id]` → recupera `planned`, `in_progress`, etc., no siempre `not_started`.
- Texto actualizado: "al desmarcarlas recuperan su estado anterior".

## Phase status "planned" (017_phase_planned.sql)
- Enum `project_phase_status` += `planned`.
- Wireado en: `types.ts`, `format.ts:phaseStatusLabel`, `ui.tsx:PHASE_BADGE/PHASE_LABEL`, `page.tsx:PHASE_STATUS_OPTIONS`, `gantt-view.tsx:statusLabel`.
- Default de fase nueva sigue siendo `not_started` (no solicitado cambiarlo).

## Pantallas por proyecto
- Tabla `project_screens`: `width_m`, `height_m`, `is_irregular`, `area_m2`, `pitch_mm`, `m2` calculado en SQL.
- `attachments.screen_id` + constraint `attachment_exactly_one_entity` actualizado (sum = 1 entre project_id/ticket_id/screen_id).
- API GET devuelve `m2` (unitario) y `attachment[]` por pantalla.
- UI: tabla con m² total = `m2 * quantity`; modal Regular/Irregular; PDF por fila.
- **Pitch (mm)**: campo `pitch_mm` numeric opcional; mostrado en tabla como "X mm"; input en modal con placeholder "P. ej. 1.5"; validación ≥ 0.

## Known limitations / future
- `project_screens` sin `version` → ediciones concurrentes se pisan (optimistic locking pendiente).
- `attachment_exactly_one_entity` CHECK debe actualizarse si se añade 4ª entidad.
- Presence indicator: migración 014 aplicada; falta API `/api/presence`, `PresenceBadge`, montaje en `layout.tsx`.
- GDrive OAuth bloqueado; security 1–4 y optimizations 13–17 pendientes decisión.
