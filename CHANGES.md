# Constraints & Decisions Log

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