# Constraints & Decisions Log

## 0.4.5 — RC (2026-10-07)

> Release candidato que lleva a GitHub: catálogo de pantallas por cuenta (V37), corrección de zona horaria y de la línea «Hoy» del Gantt (V39), y arreglo del modal que dejaba los clics bloqueados hasta un F5 (véase secciones abajo). El nav sigue leyendo la versión desde `web/package.json` (v0.4.5).

### Fix de clics bloqueados tras cerrar un modal
- El `Modal` usaba el `<dialog>` nativo: si se navegaba o volvía (historial) con un modal abierto, el navegador lo dejaba en el "top layer" y la cortina invisible seguía capturando todos los clics hasta recargar con F5.
- Reescrito en `ui.tsx` como overlay controlado (fondo + panel fijos, cierre por clic en el fondo, ✕ o tecla Escape), ajeno al top layer nativo. Misma API (`open`, `onClose`, `title`, `footer`, `children`, `wide`, `mark`), sin cambios en los consumidores.
- Tras crear una tarea y volver, el botón vuelve a responder al instante, sin refrescar.

## Zona horaria y línea «Hoy» del Gantt (V39) — sin commit

> La unidad de negocio es CDMX. Nunca se deriva una fecha calendario de `toISOString()` (el host corre en UTC): entre las 18:00 y las 23:59 hora CDMX, UTC ya es «mañana». Tampoco se resta una medianoche de un mediodía (o viceversa): `Math.round((mediodía − medianoche) / 86400000)` redondea `N + 0.5 → N + 1` y corre la línea «Hoy» y las barras un día.

### Causas raíz
- Línea roja en el Gantt (tickets y actividades): `diffDays` anclaba el día objetivo al **mediodía** pero el lunes base a la **medianoche**; el `Math.round` convertía `N + 0.5` en `N + 1`. Como México no usa DST, el desfase era fijo: martes → miércoles. **No era un problema de zona horaria.**
- El «hoy» del servidor (reportes de esfuerzo, proyección de m², m² por mes) se derivaba de `toISOString()` (UTC) en vez de la fecha calendario de CDMX.

### Cambios
- Nuevo `web/app/lib/time.ts`: `todayIso()` (siempre `America/Mexico_City`, independiente de la TZ del proceso), `mondayIsoOfWeek(iso)`, `dateAtNoon(iso)`, `isoDateLocal(date)`.
- Regla nueva en ambos Gantts (`gantt-view.tsx`, `ticket-gantt-view.tsx`): **lunes base y días objetivo se anclan al mediodía** (12:00), así `diffDays` da días exactos y `Math.round` es inocuo. El «hoy» se lee de `todayIso()` en vez de la hora local del navegador.
- `week-agenda.tsx` (día inicial, «Hoy», etiquetas y conteo de vencidas) y `technician-view.tsx` (lunes inicial, botón Hoy, vencidas) usan `todayIso()`/`mondayOfWeek(dateAtNoon(todayIso()))`.
- Reportes con «hoy» implícito en CDMX: `api/reports/effort` (`?date` por omisión), `api/reports/screen-projection` y `api/reports/screens-m2` (anclas y rangos `[from,to]` calculados con `isoDateLocal`, no `toISOString`).
- `lib/overtime.ts` … `isoWeekKey` **no se tocó**: agrupa fechas calendario ya existentes y el día de la semana de una fecha es invariable a la zona horaria; no deriva «hoy».
- El host del servidor **debe** correr `sudo timedatectl set-timezone America/Mexico_City` (pendiente: requiere sudo interactivo). El contenedor ya lleva `TZ`/`PGTZ`/`DEFAULT_TIMEZONE=America/Mexico_City` en `compose.yaml`.

### Verificación
- `todayIso()` (UTC host) = `2026-10-06` (martes) vs `toISOString()` = `2026-10-07`.
- Con las reglas nuevas: `from` = lunes 2026-10-05 12:00, martes → `todayIdx = 1` → columna Martes.
- `GET /api/reports/effort?scale=week` sin `date` → `{start: "2026-10-05", end: "2026-10-11"}` (semana CDMX del martes).
- `tsc --noEmit` sin errores; ESLint sin errores (4 warnings pre-existentes de variables sin usar en `week-agenda`).

## Catálogo de pantallas por cuenta (V37) — sin commit

> Cada cuenta define una sola vez sus pantallas (medidas, pitch, ambiente, voltaje) y sus proyectos las reutilizan. Vincular no copia nada: el usuario decide cuándo tomar las specs del catálogo.

### Migraciones `052_screen_catalog.sql` y `053_screen_catalog_active_unique.sql` (aplicadas, sin commit)
- `screen_catalog`: `client_id` (NOT NULL, FK `clients`), `name`, `width_m`, `height_m`, `area_m2`, `pitch_mm`, `is_irregular`, `environment`, `voltage`, `notes`, `active`, `created_at`, `updated_at`. Índice por `(client_id, active)` y de búsqueda por nombre.
- `project_screens.screen_catalog_id` nullable, FK `ON DELETE SET NULL`: borrar o desactivar una pantalla del catálogo nunca borra el proyecto.
- **Decisión 053:** el índice único es parcial (`WHERE active`). Con el índice único total, desactivar una pantalla bloqueaba para siempre volver a crear ese mismo nombre en la cuenta, porque el borrado del catálogo es lógico.
- **Decisión:** la unicidad usa `lower(name)`, igual que `idx_inventory_lots_brand_lot`. No normaliza acentos: «Cenefa» y «cenefa» chocan, «Lácteos» y «lacteos» no. Es el mismo criterio del resto del sistema.

### API
- `GET /api/screen-catalog?client_id=&q=&include_inactive=` — `q` busca por nombre de pantalla, por **nombre de cuenta** y por notas. `client_id` presente y vacío devuelve lista vacía (proyecto sin cuenta no debe ver el catálogo de otras cuentas).
- `POST /api/screen-catalog` — alta; 409 si el nombre ya existe entre las activas de la cuenta.
- `GET/PATCH/DELETE /api/screen-catalog/[id]` — PATCH edita y reactiva; DELETE es baja lógica (`active = false`), nunca borra una pantalla ya usada por proyectos. `used_in_projects` indica cuántas pantallas la referencian.
- `PATCH /api/projects/[id]` acepta `screen_catalog_id` y `apply_catalog_specs` por pantalla.
  - `screen_catalog_id` se valida contra `p.client_id`: una pantalla de otra cuenta responde «La pantalla del catálogo no existe o no pertenece a la cuenta del proyecto».
  - `apply_catalog_specs: true` es el único camino que copia medidas; sin él, vincular no altera nada.
  - Sin medidas propias y con catálogo elegido, el error indica la acción: «Captura las medidas o pulsa “Traer specs”».
  - Un `id` de pantalla mal formado se rechaza con 400 en vez de dejar que Postgres devuelva 500 con el error crudo.

### Vista `/admin/catalogo-pantallas` (Configuración → Catálogos → Pantallas)
- Alta, edición, reactivación y baja lógica por cuenta, con contador de pantallas en uso.
- Cuadro de búsqueda con rebote de 250 ms: filtra por pantalla o por cuenta; el filtro va al servidor, no a un recorrido del arreglo ya cargado.
- Indicador de coincidencias y estado vacío diferenciado: «Sin coincidencias» no es «no hay pantallas».

### Proyecto (`/proyectos/[id]`)
- El editor de pantalla ofrece el catálogo de la cuenta del proyecto y un botón **«Traer specs»** que rellena el formulario; seleccionar una pantalla no modifica las medidas.
- Un proyecto sin cuenta no muestra catálogo.
- Al listar se ve a qué pantalla del catálogo está vinculada cada una, incluso si el catálogo se desactivó después (el vínculo se conserva y el GET lo marca `activo = false`).

### Verificación
- `tsc --noEmit` y ESLint sin errores.
- E2E con Diafi (`e57e184e-…`) sobre `PR-036`: alta y duplicado (409), búsqueda por pantalla y por cuenta, alta de pantalla desde el catálogo con `apply_catalog_specs`, vínculo sin specs (conserva 3.2×1.5), importar specs (pasa a 0.96×1.6), desvincular (conserva 2.4×1.2), catálogo de otra cuenta rechazado, id inválido → 400, y bitácora de los movimientos. Datos de prueba y bitácora `entity_type = 'screen'` purgados.

## Bitácora global y usuarios en línea (V36) — sin commit

> Identidad por selector "Quién eres" (cookie `sg_uid`), bitácora de todas las acciones principales en `/bitacora` y contador de usuarios concurrentes en la esquina superior derecha. Sin login real: la cookie identifica, no autentica.

### Migración `051_activity_log.sql` (aplicada, sin commit)
- `activity_log`: `entity_type`, `entity_id`, `entity_label`, `action`, `summary`, `details` (jsonb), `project_id`, `ticket_id`, `actor_id`, `actor_name`, `actor_role`, `created_at`. Índices por fecha, actor, entidad, acción, proyecto y ticket.
- `user_presence`: un registro por usuario (`user_id` único) con `last_seen_at`. Índice por `last_seen_at`.
- Las FKs a `projects`/`tickets` son `ON DELETE SET NULL`: la bitácora sobrevive a la baja de la entidad y se puede filtrar por proyecto o ticket.

### Identidad (nuevo)
- `web/app/lib/session.ts`: `SESSION_COOKIE = "sg_uid"` (1 año, `sameSite: "lax"`), `currentUser()`, `currentUserId()` y `touchPresence()`.
- **Cambio de comportamiento:** `getCurrentUserId()` ya no devuelve "el primer admin" sino el usuario de la cookie. Los nueve helpers locales `getActorId(body.actor_id)` de tickets, proyectos, actividades, comentarios, adjuntos y mejoras se eliminaron: el cliente ya no puede atribuir una acción a otro usuario.
- `GET /api/session` lista usuarios activos (sin agentes) y devuelve el actual. `POST /api/session { user_id }` fija la cookie y registra el ingreso en la bitácora.
- `POST /api/presence` es el latido (idempotente, ~1 cada 30 s desde el navegador). `GET /api/presence` devuelve `{ online, window_minutes, users, me }` con ventana de 5 minutos y deduplicación por usuario: dos pestañas del mismo usuario cuentan como una persona.

### Bitácora (V36: `/bitacora`)
- `web/app/lib/audit.ts`: `logActivity(executor, entry)`, `logActivityAsync(entry)` y `queryActivityLog(filtros)`. Guarda nombre y rol en la propia entrada para no depender de joins, y nunca tumba la operación principal si falla (avisa por consola una sola vez).
- `GET /api/activity-log`: filtros por usuario, acción, módulo, texto libre, fecha desde/hasta, más `project_id`/`ticket_id`/`entity_id` para consultas desde el detalle; devuelve también las facetas de acción y usuario para poblar los selectores.
- Vista: tabla con fecha, usuario, acción (tono por tipo), módulo, resumen y expandable de `details`; enlace a proyecto/ticket cuando aplica; paginación de 50.
- `PresenceBadge` reemplaza la `UiMark` fija del nav: pulsing verde + "N en línea" con popup de quién está activo. Latido cada 30 s y al recuperar el foco de la pestaña.
- `UserSwitcher` en el pie del nav: elige "Quién eres" y recarga para que bitácora y presencia cambien de golpe.

### Cobertura de auditoría
- Servicios: alta de ticket, proyecto y actividad.
- Rutas: proyectos (alta, edición, estado, cierre, cancelación), tickets (alta, edición, estado, solicitud de eliminación, cancelación, reapertura, facturación), actividades (alta, edición, estado, cancelación), asignaciones (alta y baja), comentarios (alta, edición y borrado), adjuntos (subida y borrado), inventario (alta/edición por upsert, edición y borrado), planeación (comentarios e instalado) y administración (borrado definitivo y restauración de proyectos y tickets, checklist de cierre administrativo).
- El PATCH de proyectos y tickets excluye `status` de `update` cuando hubo transición: el cambio de estado se registra una sola vez como `status_change`.
- Pendiente de auditoría: carga masiva de inventario por archivo, horas extra/trabajo, catálogo de controladores y las rutas de agente CLI (esas ya creditan al usuario dueño del token vía `lib/agent-auth.ts`).

### Verificación
- `tsc --noEmit` y ESLint limpios dentro del contenedor.
- Prueba end-to-end con dos usuarios: alta de ticket atribuida al técnico, cambio de estado y eliminación atribuidos al admin, comentario, inventario y planeación. Con dos cookies distintas `/api/presence` reporta 2 en línea y 1 con dos pestañas del mismo usuario. Datos de prueba eliminados y bitácora/presencia purgadas.

### Limitación conocida
- Sin autenticación, cualquiera puede cambiar la cookie y poserar como otra persona. La bitácora registra la identidad declarada. El bloqueo real de usuarios/permisos sigue pendiente.

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

### V4 cierre: cantidad de módulos calculada por área de pantalla
- Al elegir **marca y lote** del inventario, la cantidad de módulos se calcula sola: `Math.ceil((m2 de pantalla × quantity) ÷ m² del módulo)`, con `m² de pantalla = width_m × height_m` o `area_m2` en irregulares y `m² del módulo = (width_mm × height_mm) / 1e6` (320×160 mm = `0.0512 m²`). Ejemplo: pantalla de `5.632 m²` → `110` módulos.
- La fórmula es la misma en cliente y servidor: `/api/projects/[id]/closure-inventory` ya expone `module_m2` y el detalle ya devuelve `m2` por pantalla, así que no se agregan columnas.
- Cambiar de pantalla recalcula el valor solo mientras el campo siga automático o vacío; escribir a mano lo fija y ya no se sobrescribe.
- Botón **Auto** por renglón para recalcular a mano, texto auxiliar con área de pantalla, m² por módulo, m² usados y **módulos faltantes** para cubrir el área (o excedente sobre el mínimo teórico).
- El valor sigue siendo editable y las validaciones de guardado no cambian: entero > 0 y sin exceder `available_modules` del lote.

### Cálculo de módulos con decimales exactos
- El área y el m² del módulo viajan como **texto decimal exacto** desde Postgres: `m2_exact` en `/api/projects/[id]` y `module_m2_exact` en `/api/projects/[id]/closure-inventory`. No se redondea a 2 ni a 4 decimales antes de dividir.
- Nuevo `web/app/lib/decimal.ts` con aritmética decimal exacta (`BigInt`): `modulesForArea`, `multiplyDecimalText`, `decimalText`. `tsconfig` sigue en `ES2017`; se usa el constructor `BigInt()` porque los literales `0n` exigen target ES2020.
- Motivo: `Math.ceil(area / m2_modulo)` con `number` arrastra error de coma flotante. Con módulos de `0.0512 m²`, `13.000000000000002` redondeaba a **14** en lugar de 13 (281 fallos en 4000 áreas exactas). Con la división entera exacta hay 0 errores en 4000 áreas × 8 cantidades.
- Verificado contra Postgres con las 4 pantallas reales del proyecto: `0.8704 → 17`, `0.9216 × 2 → 36`, `1.28 × 2 → 50`, `5.632 → 110` módulos. Coinciden en los cuatro casos.
- Textos auxiliares del renglón sin `toFixed`: área exacta (`5.632`), total con cantidad (`0.9216 × 2 = 1.8432`), m² por módulo (`0.0512`), m² a usar y módulos faltantes/excedentes contra el valor exacto.
- El selector **Marca y lote** del cierre muestra solo `marca · lote`: se quitaron los módulos y m² de las opciones porque ya se repetían en el texto pequeño de la derecha. Ese texto derecho ahora calcula el m² disponible con decimales exactos (`Disponible: 6000 módulos · 307.2 m²`).
- Reordenamiento de la tabla de lotes del cierre a 6 columnas: **Pantalla**, **Marca y lote del inventario**, **Cant. módulos** (input `w-16` + botón **Auto**, alineados a la izquierda junto a los dos campos primeros), **Disponible** (módulos y m² a la derecha), **Observaciones** (área de pantalla, m² por módulo, m² a usar, valor exacto y faltantes/excedentes) y **Quitar**. Se corrigió el `colSpan={2}` de la celda de marca, que desalineaba la fila con su encabezado.

### Gantt: editar etapa completa
- `PhaseEditModal` edita descripción, estado (`planned`, `not_started`, `in_progress`, `completed`, `blocked`, `not_applicable`), fechas y bloqueo (motivo + próxima acción + fecha obligatorios si `blocked`); aviso si `not_applicable` oculta la barra.
- `GET /api/gantt` ahora trae `blocked_reason`, `next_action`, `next_action_date`.

### V34 Gantt de tickets abiertos
- Nueva ruta `/gantt-tickets` y acceso principal **Gantt tickets** junto al Gantt de proyectos.
- Nuevo `GET /api/ticket-gantt`: tickets con estado distinto de `closed`/`cancelled`, cliente, prioridad, próxima acción y actividades no canceladas con fechas, horas y técnicos.
- Una fila por ticket; barras por actividad (`planned`, `in_progress`, `completed`) y marcador rosa de próxima acción. Tickets sin actividad/fecha permanecen visibles como **Sin programación**.
- Orden operativo: primero tickets sin programación y sin técnicos asignados; después el resto de tickets abiertos; `resolved_pending_validation` siempre al final. Dentro de cada grupo se ordena por primera fecha programada y código.
- Buscadores por código/título/cliente, filtro por estado abierto, escalas semana/2 semanas/mes, navegación día anterior/Hoy/día siguiente, línea de hoy y links al detalle de ticket/Agenda/Lista.
- Barra de herramientas en una sola línea (`flex-nowrap` con scroll horizontal): búsqueda reducida a `w-52`, estado `w-44`, escalas y navegación con `shrink-0`, dejando más ancho útil para las barras del Gantt.
- Arrastre de actividades para cambiar `date`/`end_date` conservando duración; `pointercancel` revierte la previsualización sin guardar.
- Asignación directa por ticket: técnicos activos mínimos desde `/api/ticket-gantt`, modal `W40` para asignar (`POST /api/assignments`) o quitar (`DELETE /api/assignments/[id]`), y nombres visibles en cada renglón.
- Menú ⋮ `N10` por renglón: **Cambiar estado** (`W43`), **Programar actividad** (`W42`), **Asignar técnicos** y **Abrir detalle**.
- Nuevo `POST /api/ticket-gantt/schedule` transaccional: crea actividad con rango/horas/técnicos, agrega asignaciones faltantes al ticket y cambia `new`/`to_review`/`unassigned` a `scheduled` con historial. Rechaza tickets cerrados/cancelados.
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

### V1 dashboard principal y V35 Agenda
- `/` deja de renderizar la agenda y se convierte en dashboard principal con cuatro tarjetas grandes: **Agenda**, **Proyectos**, **Tickets** y **Administración**; diseño responsive 1 columna móvil / 2 columnas escritorio.
- Nuevo `GET /api/dashboard` con métricas reales: actividades de hoy/vencidas/próximas, técnicos activos; proyectos corriendo/bloqueados/en instalación/m²; tickets abiertos/sin asignar/en progreso/espera/acciones vencidas; usuarios/clientes/revisiones/notificaciones e inventario.
- Agenda se mueve íntegra a `/agenda` con marcador `V35`; V1 queda reservado al dashboard. Nav agrega **Inicio** y conserva **Agenda** como opción separada.
- Deep links de actividades en Pendientes y Notificaciones, y botones “Agenda semanal” de ambos Gantt, pasan a `/agenda` sin perder `activity`/`date`.

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
