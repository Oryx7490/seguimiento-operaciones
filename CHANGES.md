# Constraints & Decisions Log

## Fechas dd/mm/aaaa en todo el sistema (V68) — sin commit

- `formatDate`/`formatDateTime` ahora devuelven **dd/mm/aaaa** (y `dd/mm/aaaa HH:MM`), parseando fechas de calendario a mediodía para no desfasar el día.
- Se formatean las fechas que se mostraban en ISO: actividades (agenda y vista del técnico), Gantt de tickets (tooltip), horas extra, proyección/pantallas (entrega), pólizas (vigencia) y la fecha del OCR en el visor de WhatsApp.
- La **nota de discrepancia** de V52 ahora muestra las fechas como dd/mm/aaaa.
- En **V52** el campo de fecha es de texto con formato **dd/mm/aaaa** (antes `type="date"` mostraba el formato del navegador, p. ej. mm/dd); se convierte a ISO al guardar.
- Verificado: `es-MX` produce `16/10/2026`; `tsc` limpio; páginas 200.

## Fechas en formato México (día/mes/año) (V67) — sin commit

- **Parser OCR**: el formato numérico se interpreta como **día/mes/año** (acepta `/`, `.` o `-`), validando día 1–31 y mes 1–12; si el mes resultara inválido pero el primer número sí puede ser mes, se intercambian (respaldo). Año de 2 dígitos se completa a 20xx.
- **V52**: las fechas se muestran como **dd/mm/aaaa** (detalle, fecha de la imagen y modal de foto).
- Verificado: `16/10/2026` → 2026-10-16, `05/10/2026` → 2026-10-05; `tsc` limpio; bandeja 200.

## V52: fecha del mensaje cuando la imagen no la trae (V66) — sin commit

- Si el OCR no detecta la fecha en la foto, el candidato toma la **fecha en que se envió la foto al grupo** (mensaje, zona `America/Mexico_City`) como `event_date`; se marca con la señal `fecha_del_mensaje` y `image_date` queda nulo (no genera discrepancia falsa).
- **Migración `080`**: backfill de candidatos sin fecha usando la fecha del mensaje. **Migración `081`**: quita la señal redundante `sin_fecha` cuando ya se resolvió con la del mensaje.
- **UI V52**: nueva etiqueta "Fecha del mensaje" en las señales.
- Verificado: 133 candidatos backfillados, 0 sin fecha; `tsc` limpio; bandeja 200.

## Asistencia por fotos: ingesta más rápida y orden por recientes (V65) — sin commit

- El worker procesaba rostros/OCR/candidatos en lotes de 25 **cada 6 h**, por lo que las fotos del día tardaban en aparecer. Ahora escanea **cada 15 min** (`FACE_SCAN_INTERVAL_MS`, configurable) y **repite hasta ponerse al día** (hasta 40 rondas por ciclo), dejando 0 pendientes.
- **V52** (`/admin/asistencia-fotos`) ordena por **más reciente primero** (`created_at DESC`), para ver las fotos del día arriba.
- Verificado: backlog procesado (5 fotos → 5 candidatos) y 0 imágenes sin OCR; las nuevas aparecen al inicio de la bandeja.

## Prueba adicional OpenCV SFace para rostros de WhatsApp

- Se añadió OpenCV SFace (`2021dec`, embedding de 128 dimensiones) en paralelo a InsightFace `buffalo_l` (512 dimensiones). El modelo se descarga al construir `face-service` y se valida por SHA-256.
- Un escaneo separado vuelve a detectar/alinear las caras con los mismos landmarks y guarda los vectores SFace en tablas propias. Los candidatos se calculan solo con rostros asignados manualmente; no se escriben en `face_assignments` y no afectan asistencia ni el modelo actual.
- La ficha de la foto muestra el candidato SFace y su similitud coseno como resultado experimental. Umbral inicial `0.363`, margen `0.05`, ajustables con `FACE_SFACE_THRESHOLD` y `FACE_SFACE_MARGIN`; la similitud de centroides requiere calibración con más etiquetas humanas.
- Configuración: `FACE_SFACE_ENABLED=true`, `FACE_SFACE_BATCH_SIZE=250`. Migración `078_whatsapp_opencv_sface_experiment.sql`.
- Alcance de licencia: se usa la variante del modelo distribuida en OpenCV Zoo bajo Apache 2.0 para esta evaluación; mantener SFace como prueba hasta revisar la procedencia y condiciones completas de uso del modelo/datos.
- Primera verificación del 2026-10-16: servicio saludable con SFace listo; 203 fotos históricas analizadas y 108 embeddings guardados; ningún rostro quedó pendiente. En ese momento solo había una identidad confirmada, por lo que todavía no había comparación entre personas.
- **Auditoría**: migración `079_whatsapp_face_model_examples.sql` guarda las fotos confirmadas exactas usadas en cada versión de centroides/clasificador. El botón **Entrenamiento facial** en Fotos WhatsApp muestra esas imágenes, versiones, etiquetas, presencia del embedding SFace y un diagnóstico de InsightFace, OpenCV, ONNX Runtime y la integridad SHA-256 del modelo instalado; separa fallos de carga de avisos como uso de CPU.
- La vista calcula calidad de reconocimiento con validación leave-one-out para cada ejemplo confirmado: excluye la foto evaluada del centroide, informa aciertos, confusiones aceptadas, abstenciones y casos no evaluables para buffalo_l y SFace, y marca el resultado por foto. La exactitud del clasificador sobre sus propios datos se etiqueta como tal; no se presenta como prueba independiente.
- Revalidación del 2026-10-16: versiones activas de centroides `v8` y clasificador `v2`, ambas con 20 fotos confirmadas y 9 identidades. En validación leave-one-out buffalo_l aceptó 13 reconocimientos, los 13 coincidieron, y se abstuvo en 6 fotos; SFace aceptó 10, los 10 coincidieron, y se abstuvo en 9; una foto no se pudo evaluar por falta de otro ejemplo comparable. No hubo fallos de instalación/carga ni errores de análisis de fotos; ONNX Runtime trabaja en CPU porque no ofrece CUDA. Son resultados de consistencia sobre una muestra pequeña, no una prueba independiente de precisión.

## Gastos de proyecto desde fotos (V65) — sin commit

- **Migración 076 aplicada**: propone y conserva clasificación, extracción de datos, proyecto sugerido, correcciones humanas, estado de revisión y notas; confirma también el vínculo de foto a proyecto en la galería.
- **Migración 077 aplicada**: agrega asociaciones de documentos con tickets y pólizas de mantenimiento, las muestra en la galería y valida que cada revisión tenga como máximo un destino.
- **Bandeja `/admin/gastos-fotos`** (nombre visible: **Documentos desde fotos**): clasifica comprobantes, hojas de servicio y hojas de entrega; incluye lectura de OCR, proveedor, fecha, importes, impuestos, conceptos, texto y destino asociado. La búsqueda de proyectos, tickets o pólizas muestra máximo cinco resultados por consulta. Omite imágenes con rostros detectados, sin análisis facial completo o cuyo SHA-256 tiene más de una aparición almacenada. Incluye totales revisados por proyecto y moneda. Qwen puede analizar un documento o procesar la bandeja pendiente una por una.
- **Retroalimentación**: guarda la explicación del modelo, las correcciones, la persona que revisó y notas de discusión; la clasificación manual queda como etiqueta de la foto.
- **Modelo**: Ollama usa `frob/qwen3.5-instruct:9b`, propone un proyecto entre proyectos activos y explica sus señales. `OLLAMA_BASE_URL` debe habilitarse para que el contenedor web alcance Ollama.
- **OCR documental**: se instaló `paddlex[ocr]==3.7.2` y se fijó `paddlepaddle==3.2.2` (con `numpy==2.3.5`) en el entorno local `ocr`. PP-StructureV3 ejecutó la foto piloto y detectó estructura tabular y bloques de texto; PaddlePaddle 3.3.1 fallaba en CPU por un error upstream de oneDNN/PIR.
- **Ollama**: servicio de usuario activo y limitado al puente Docker (`172.17.0.1:11434`); el contenedor `web` resuelve `host.docker.internal` y ve el modelo Qwen instalado.
- **Procesamiento nocturno**: worker activado a la 01:00 de `DEFAULT_TIMEZONE`, máximo 100 documentos elegibles por lote, secuencialmente; espera un análisis facial completo sin rostros y no repite hashes; solo crea sugerencias y extracción, los totales del proyecto requieren confirmación humana.

## Agenda (V35): el día actual en la segunda columna (V64) — sin commit

- La vista semanal de `/agenda` arranca un día antes de hoy (`agendaAnchor`), de modo que el **día actual queda en la segunda columna** y se ven los días siguientes; se recalcula al cargar, así que se actualiza solo cada día.
- El botón **Hoy** usa el mismo anclaje. La navegación (semana anterior/siguiente) sigue moviéndose en bloques de 7 días.
- Verificado (jue 2026-10-15): columnas mié 14 · **jue 15** · vie 16 · sáb 17 · dom 18 · lun 19 · mar 20. `tsc` limpio; `/agenda` 200.

## 0.4.8 — RC (2026-10-15)

Release candidate con reconocimiento facial y OCR de las fotos de WhatsApp, asistencia derivada de fotos, pólizas de mantenimiento, metas/equipo y mejoras de UX.

- **Fotos de WhatsApp (V48–V48c)**: visor por semana ISO, miniaturas 25% cacheadas en MinIO, etiquetas, vínculos a proyecto/ticket, campos administrables y API de administración.
- **Reconocimiento facial (V49)**: `face-service` (insightface ArcFace 512d, ONNX) + pgvector; enrolamiento a técnicos/usuarios, sugerencias por centroide y cabeza clasificadora nocturna.
- **OCR + asistencia por fotos (V50–V58)**: Tesseract; candidatos de entrada/salida con identificación por remitente/rostro, captura manual de fecha/hora, borrado de horas, notas y detección de discrepancia; segmentos por día para dobles/triples turnos.
- **Horas y metas (V52/V54/V55)**: perfil de horas por técnico (día/semana/mes/año), resumen semanal por equipo con KPIs y metas con semáforo.
- **Pólizas de mantenimiento (V61)**: catálogo por cliente (cambios de contenido o mantenimiento correctivo/preventivo) y tipo de actividad "Póliza".
- **Selector de cliente unificado (V63)**: 5 más usados, búsqueda y alta de cliente en línea en todas las secciones que asocian cliente.
- **Actividades↔tickets (V57)**, cliente visible en actividades con ticket (V60), creación de ticket desde W23 (V59).
- **WhatsApp**: perfiles de participantes, import/export y mejoras del agente.
- **Infra**: PostgreSQL migrado a `pgvector/pgvector:pg17`; nuevo servicio `face-service`; fix de `FOR UPDATE` en notificaciones.

## Selector de cliente unificado (5 más usados + alta en línea) (V63) — sin commit

- Nuevo componente reutilizable `web/app/components/client-select.tsx` (`ClientSelect`): busca clientes, muestra los **5 más usados** (por `activity_count`) y, si la búsqueda no coincide, ofrece **«+ Agregar “<texto>”»** que abre un modal **Nuevo cliente** (nombre, contacto, teléfono, correo) sin salir del flujo.
- Aplicado en todas las secciones que asocian cliente: **Pólizas** (V62), **Tickets** (alta y edición), **Proyectos** (ya lo tenía), **Ubicaciones**, **Ticket rápido del técnico** y **Ticket rápido de W23**.
- **V62**: el modal de **Nueva/Editar póliza** ahora tiene identificador (`W63`).
- Verificado: `/api/clients` expone `activity_count`; páginas 200; `tsc` limpio.

## Pólizas de mantenimiento como tipo de actividad (V61) — sin commit

> Nuevo catálogo de **pólizas de mantenimiento** por cliente (cambios de contenido o mantenimiento correctivo/preventivo) y un cuarto tipo de actividad en W23.

- **Migración `073`**: tabla `maintenance_policies` (cliente, ubicación opcional, nombre, `policy_type`, vigencia, estado, notas) + `activities.maintenance_policy_id`; sección RBAC `admin.polizas`. **Migración `074`**: el trigger `check_activity_links` ahora acepta póliza como vínculo válido.
- **API** `GET/POST /api/maintenance-policies` y `PATCH /api/maintenance-policies/{id}` (alta, edición, cambio de estado). `GET /api/activities` calcula `kind='policy'` y devuelve `policy_name`/`policy_type` y el cliente de la póliza. `POST /api/activities` acepta `maintenance_policy_id`.
- **UI**: página **`/admin/polizas`** (nav «Pólizas de mantenimiento», mark `V62`) con listado, filtros por estado y modal de alta/edición (cliente, ubicación, tipo, vigencia, estado, notas). En **W23** se agrega el tipo **«Póliza de mantenimiento»** con selector de pólizas activas; la tarjeta y el detalle muestran el nombre de la póliza, su tipo y el cliente.
- Tipos: `content_changes` (cambios de contenido) y `corrective_preventive` (mantenimiento correctivo y preventivo).
- Verificado: crear póliza, crear actividad tipo póliza (kind=policy, cliente Price Shoes) y limpieza; páginas 200; `tsc` limpio.

## Actividades con ticket muestran el cliente (V60) — sin commit

- En `GET /api/activities`, `client_name` solo se tomaba de los proyectos; para actividades ligadas a un **ticket** quedaba nulo (la UI mostraba "—").
- Se agrega `LEFT JOIN clients c ON c.id = t.client_id` y `client_name` cae al cliente del ticket cuando no hay proyecto.
- Verificado: las 17 actividades con ticket ahora muestran su cliente (SSL, Quarry, Price Shoes…). `tsc` limpio.

## W23: crear ticket desde "Nueva actividad" cuando no hay coincidencias (V59) — sin commit

- En el buscador de **Ticket** del modal **W23** (Nueva actividad) se habilita `onCreate`: cuando la búsqueda no arroja resultados ("Sin coincidencias"), aparece **«+ Agregar “<texto>”»**.
- Al elegirlo se abre un modal compacto **Nuevo ticket** (prellenado con el texto buscado en título y descripción; tipo externo/interno, cliente, prioridad y "reportado por" con el usuario de sesión), reutilizando `POST /api/tickets`.
- Al crearlo, se selecciona automáticamente en la actividad y se refresca la lista de tickets.
- Verificado: `POST /api/tickets` con el payload del modal crea el ticket (TK-029 de prueba, luego eliminado); `tsc` limpio; `/agenda` 200.

## V52: borrar hora, notas y discrepancia robusta (V58) — sin commit

- **Botón × para borrar** la hora de entrada y de salida en la bandeja (`/admin/asistencia-fotos`); la hora queda en blanco. (También se puede limpiar con la tecla Suprimir en el input nativo.) Al registrar, si se manda la hora vacía, se respeta el blanco (no se reintroduce la hora de la imagen).
- **Notas por candidato**: migración `072` (`attendance_candidates.notes`), `PATCH /api/attendance/candidates/{id}` con `{ notes }`, columna "Notas" en la bandeja con guardado.
- **Discrepancia más robusta**: se comparan los **conjuntos de horas** (imagen: `shift_in`/`shift_out`/`image_time` vs manual), de modo que también detecta cuando la foto trae hora pero no se sabe si es entrada o salida.
- Verificado: nota guardada/leída/limpiada; aprobar con entrada vacía deja `check_in` en blanco; discrepancia detectada con `Imagen: 14:07 · Manual: 23:30`. `tsc` limpio.

## Actividades que atienden un ticket asignan al técnico al ticket (V57) — sin commit

> Al crear o editar una actividad ligada a un ticket y elegir técnicos, esos técnicos quedan también como **asignados al ticket** (tabla `assignments`), de modo que el ticket refleja que ya tiene una o más personas asignadas.

- **Lib** `web/app/lib/assignments.ts`: `syncTicketAssignments(client, ticketId, technicianIds)` crea una asignación activa por técnico si no existe; **no quita** asignaciones previas (un técnico puede venir de otra actividad).
- **API actividades**: `POST /api/activities` sincroniza al crear (si hay ticket); `PATCH /api/activities/{id}` sincroniza al actualizar técnicos (usa el `ticket_id` de la actividad).
- El detalle del ticket ya lista las asignaciones activas, así que el técnico aparece de inmediato en el ticket.
- Verificado: crear actividad con ticket + 2 técnicos agregó al no asignado y respetó al ya asignado; `PATCH` idem; datos de prueba revertidos. `tsc` limpio.

## Perfiles de participantes de WhatsApp para RGB-Gantt (2026-10-14) — sin commit

- **Migración `071_whatsapp_participant_identities.sql` aplicada**: agrega perfiles independientes de usuarios/técnicos y alias de teléfono, ID de WhatsApp y nombre. Cada alias conserva categoría, verificación y fechas de vigencia; números temporales, secundarios, actuales y anteriores no se sustituyen entre sí.
- Se crean perfiles iniciales para los técnicos y directivos/coordinadores existentes. Los teléfonos copiados de sus fichas quedan como sugerencias no verificadas. Los contactos remitente→técnico ya verificados se importan como alias confirmados y el flujo actual de aprobación de asistencia sincroniza nuevos mapeos.
- **Clasificación**: `current`, `former`, `external`, `unclassified`; un perfil puede quedar sin user_id/technician_id, para personas externas, exintegrantes o participantes aún no dados de alta.
- **Resolución**: las coincidencias de alias se aplican a mensajes históricos y nuevos si están verificadas y no son ambiguas; se respeta la vigencia en la fecha del mensaje. Si hay más de una identidad válida, `participant_id` permanece NULL.
- Estado al aplicar: 20 perfiles iniciales (17 técnicos y 3 usuarios de coordinación/administración), 44 mensajes asociados por mapeos previamente verificados y 29 combinaciones remitente/nombre pendientes de identificar.
- **API agente**: `GET /api/agent/whatsapp/participants`; `/messages` ahora filtra por `participant_id`, `user_id` o `technician_id` y devuelve la identidad enlazada.
- **API RGB-Gantt (admin/coordinator)**: `GET/POST /api/whatsapp/participants`, `GET/PATCH /{id}`, `GET/POST /{id}/aliases`, `PATCH /{id}/aliases/{aliasId}`. Retirar un número marca `valid_to`; el alias no se elimina.
- Especificación y ejemplos agregados al README y a `GET /api/whatsapp`.

## Importación semanal de respaldos de WhatsApp (2026-10-14) — sin commit

- El texto del ZIP `RGB_Pendientes.zip` registra las fotos como `<image omitted>` junto con la fecha, hora y remitente: se contaron 2,826 fotos con marca explícita y 249 marcas de álbum. Este ZIP solo contiene `chat.txt` y `chat.md`; no incluye binarios.
- **Migración `070_whatsapp_export_import.sql`**: lotes, huellas/ocurrencias para deduplicar respaldos solapados, correspondencia por renglón y auditoría de adjuntos/archivos.
- **Importador** `web/scripts/import-whatsapp-export.mjs`: modo de análisis por defecto; `--apply` importa mensajes, placeholders `unavailable` y archivos con referencia inequívoca. ZIP idéntico no se repite; archivos sin referencia y coincidencias ambiguas se reportan.
- **Búsqueda/API**: las referencias a medios ausentes aparecen en `/api/whatsapp/media` y en la galería con remitente y fecha/hora. El API de agente acepta `direction=inbound|outbound|all` (predeterminado `inbound`).
- Ejecutada la migración 070 e importado el lote `e4a42ce3-8c8e-47b7-b565-aeb75a6df437` con estado `partial`: 5,097 mensajes insertados, 0 solapamientos y 0 coincidencias ambiguas. Los 3,428 adjuntos/referencias no tienen binarios en este ZIP y quedaron como faltantes; 3,075 son marcadores de imagen/álbum (el número de fotos dentro de cada álbum no se conoce).

## Captura manual de fecha/hora y discrepancia (V56) — sin commit

> En la bandeja de asistencia (V52) el revisor puede **escribir la fecha y las horas** cuando la foto no las trae, y el sistema marca la **discrepancia** cuando lo capturado difiere de lo leído en la imagen.

- **Migración `069`**: `attendance_candidates` conserva `image_time`/`image_date` (valor OCR) y agrega `manual_override` y `override_note`. El worker guarda `image_time`/`image_date` al crear el candidato.
- **API**: la lista devuelve los nuevos campos; al aprobar, si la imagen **sí** traía hora/fecha y lo capturado difiere, se marca `manual_override`, se guarda una nota ("Imagen: … · Manual: …") y se añade `discrepancia_hora` a las señales. Si la imagen no traía datos, la captura es normal (sin discrepancia).
- **UI** `/admin/asistencia-fotos`: inputs de **fecha, entrada y salida** por candidato (prefill con lo leído), referencia "imagen: …", aviso en vivo "discrepancia con la imagen" y, en registrados, "ajuste manual".
- Verificado: captura manual 08:15–17:45 → 9.5 h sin discrepancia (imagen vacía); cambio 21:20 → 22:00 marcado como discrepancia con nota. `tsc` limpio.

## Búsqueda de mensaje de WhatsApp de las 07:33 (2026-10-13) — sin commit

- Se buscó en la base para el 13 de octubre, hora `America/Mexico_City`, en el rango 07:28–07:38; no hay mensaje guardado. El último mensaje del grupo en PostgreSQL al momento de la consulta era de las 06:14:32.
- El journal no registra entrada de WhatsApp a las 07:33. Sí registra recuperación de una conexión obsoleta a las 07:35:36 (UTC 13:35:36); los datos disponibles no permiten afirmar que esa conexión causara la ausencia ni recuperar el contenido.

## Metas semanales con semáforo (V55) — sin commit

> Objetivos por métrica (equipo o técnico) que el resumen semanal evalúa con semáforo verde/ámbar/rojo, base para comparar horas y KPIs.

- **Migración `068`**: tabla `attendance_goals` (métrica, `target`, `direction`, `technician_id` nulo = equipo; `scope_key` generado + único por scope/métrica). Métricas: `hours_worked`, `overtime`, `m2_per_hour`, `m2_installed`, `screens_installed`, `tickets_closed`.
- **Lib** `web/app/lib/goals.ts`: `GOAL_METRICS` (etiqueta/unidad/dirección) y `evaluateGoal` (at_least: ok≥100%, warn≥80%; at_most: ok≤100%, warn≤120%).
- **API** `GET/PUT/DELETE /api/attendance/goals`: consulta metas (equipo y/o técnico), upsert por (scope, métrica) y borrado.
- **Resumen del equipo**: `team-summary` ahora devuelve `goals` evaluadas (actual/target/estado/ratio) y, por técnico, `hours_target`/`hours_status`. La UI muestra "Metas del equipo" con semáforo, un botón **Metas** (modal para definir/editar/quitar) y el avance de horas por técnico con color.
- Verificado: metas creadas/consultadas, evaluación con semáforo (p. ej. horas 8.2/320 → rojo; extra 0.2/10 → verde) y limpieza de pruebas; `tsc` limpio; página 200.

## Resumen semanal por equipo + horas vs KPIs (V54) — sin commit

> Vista semanal del equipo que combina horas trabajadas (asistencia) con los KPIs de la semana, como base para comparar desempeño.

- **API** `GET /api/attendance/team-summary?from=YYYY-MM-DD` (semana lunes–domingo de `from`): totales del equipo (horas, extra, técnicos, registros), detalle por técnico y **KPIs calculados en vivo** con `computeWeeklyMetrics` (m²/pantallas/controladores instalados, tickets cerrados, actividades, horas en actividades).
- **UI** `/admin/resumen-equipo` (nav «Resumen del equipo», mark `V53`): navegación de semanas, tarjetas de horas y de KPIs, bloque **"Horas vs KPIs"** (asistencias, horas en actividades, diferencia y **m² por hora**) y tabla por técnico con enlace a su perfil de horas.
- **Corrección de horas**: `computeSegmentsHours` empareja tramos de entrada y salida aprobados por separado (antes quedaban en 0). Se usa al aprobar candidatos; nuevo `POST /api/attendance/recompute` recalcula entradas/horas desde los segmentos y recomputa horas extra (se ejecutó y corrigió los días existentes).
- Verificado: `Marco Martínez` quedó con 8.20 h y 0.20 h extra; resumen semanal correcto; páginas 200; `tsc` limpio.

## Perfil de horas por técnico (V52) — sin commit

> Página por técnico para revisar horas trabajadas y horas extra por **día, semana, mes o año**, más mejoras a la bandeja de asistencia.

- **API** `GET /api/technicians/{id}/hours?granularity=day|week|month|year&from=&to=`: agrega `attendance_entries` por periodo (`date_trunc`), devuelve periodos (horas, extra, registros, entrada/salida, incompleto) y totales; incluye los `attendance_segments` (tramos) para el detalle.
- **UI** `/admin/tecnicos/{id}/horas`: selector Día/Semana/Mes/Año, rango de fechas, tarjetas de totales (horas, extra, registros), tabla por periodo (con entrada/salida y marca "incompleto" en vista diaria) y listado de tramos por día. Enlace "Horas trabajadas" desde el expediente del técnico.
- **Bandeja de asistencia** (`/admin/asistencia-fotos`): la miniatura abre la **foto en grande** (modal con fecha/hora/tipo/ubicación) y cada técnico seleccionado ofrece "Ver horas →" a su perfil.
- Verificado: agregación correcta (día/semana/mes/año) con datos de prueba; páginas 200; `tsc` limpio.

## Asistencia derivada de fotos (candidatos + revisión) (V51) — sin commit

> Convierte el texto OCR de las fotos de checador en **candidatos de entrada/salida**, con identificación del técnico por remitente + rostro, y una **bandeja de revisión** humana que, al confirmar, registra horas. Segmentos por día habilitan dobles/triples turnos.

- **Migración `066`**: `attendance_candidates` (foto, remitente, técnico resuelto, tipo, fecha/hora, jornada, horas, ubicación, app, `ambiguity` jsonb, estado) y `attendance_segments` (tramos entrada–salida por técnico/día). **Migración `067`**: sección RBAC `admin.asistencia_fotos`.
- **Worker** (`worker/src/attendance-candidates.js`): por cada OCR completado crea un candidato; resuelve al técnico por **contacto de WhatsApp → alias → nombre del roster → rostro**; marca ambigüedades (`tecnico_desconocido`, `varios_tecnicos`, `sin_fecha`, `sin_hora`, `tipo_desconocido`, `hora_vs_jornada`) y una confianza; no escribe en asistencia.
- **API**: `GET /api/attendance/candidates` (filtros estado/fecha/técnico) y `POST /api/attendance/candidates/{id}` con `action: approve|reject`. Al **aprobar**: crea un `attendance_segment`, recalcula el día (`attendance_entries`: primera entrada, última salida, suma de horas) y **recomputa horas extra** de la semana con `computeOvertime`; además **aprende** el mapeo remitente→técnico en `technician_contacts`.
- **UI** `/admin/asistencia-fotos` (nav «Asistencia por fotos», mark `V52`): pestañas por estado, filtros, miniatura, remitente, selección de técnico/tipo, señales de ambigüedad y acciones Registrar/Rechazar.
- Reglas acordadas: identificación remitente+rostro; **múltiples segmentos por día**; se usa toda la señal (marca de agua con mayor peso, jornada Timemark y caption) marcando ambigüedades; **revisión humana** antes de registrar.
- Verificado: 19 candidatos generados; aprobación de prueba creó segmento + entrada diaria + aprendizaje de contacto y se revirtió; `tsc` limpio; build/arranque OK.

## Lectura de texto (OCR) en fotos de WhatsApp (V50) — sin commit

> Extrae el texto de cada foto (apps tipo **Timemark** y cámara con marca de agua) y propone un candidato de asistencia para revisarlo; aún no escribe en `attendance_entries` (pendiente definir reglas).

- **face-service** (`/ocr`): Tesseract (`spa+eng`) instalado en la imagen; preprocesa (escala a ≥1600px, escala de grises), devuelve texto, líneas y confianza media.
- **Worker** (`worker/src/ocr.js`): job que toma fotos sin análisis `ocr`, llama a `/ocr` y guarda `media_analyses` (`analysis_type='ocr'`) con texto, líneas, confianza y `parsed`. Se ejecuta junto al escaneo de rostros (cada 6h).
- **Parser** (`worker/src/attendance-parse.js`): de las líneas + el caption infiere `date`, `time`, `type` (entrada/salida por palabras del caption: "me retiro"→salida, "buen día"→entrada), **jornada** `shift_in`/`shift_out` (Timemark "Trabajo 09:42 - 19:55"), `worked_hours`, `location`, `code` y `app`.
- **API**: `GET /api/whatsapp/media/{sha256}/ocr` (texto + candidato). La búsqueda `?q=` de la galería ahora también **busca dentro del texto OCR**.
- **UI `/whatsapp`**: en el visor se muestra "Texto detectado (OCR)" con el candidato (fecha, hora, tipo, entrada/salida, horas, ubicación, código, app) y el texto completo desplegable; marca "posible registro de asistencia".
- Verificado con fotos reales: 19/19 procesadas; se reconocieron fecha, ubicación y jornadas (p. ej. `09:42–19:55`, 10.18 h); la búsqueda por texto OCR devuelve resultados.

## 0.4.6 — RC (2026-10-13)

Release candidate con el mayor salto de la app: permisos por perfil, KPIs semanales, estrategia de fotos de WhatsApp y reconocimiento facial.

- **Permisos por perfil (V45)**: cada persona elige su perfil al entrar (sin contraseñas); menú y secciones filtrados por rol, con roles, permisos por sección y asignación multi-rol por usuario.
- **Paleta de comandos y atajos (V46)**: `Ctrl/⌘ K`, secuencias `g` + letra y acciones de creación ("nuevo proyecto/ticket/…") por teclado.
- **Pantallas por instalar (V47/V47b)**: marca de página, buscador, orden manual global y semáforo de armado (amarillo = por armar, verde = lista).
- **Fotos de WhatsApp (V48/V48b/V48c)**: visor agrupado por semana ISO, miniaturas al 25% cacheadas en MinIO, etiquetas, vínculos a proyecto/ticket y campos administrables (nota/favorito/archivado); API de administración e índice.
- **Reconocimiento facial (V49)**: `face-service` (insightface ArcFace 512d, ONNX) + pgvector; detección/embeddings por foto, enrolamiento a técnicos/usuarios, sugerencias por centroide y cabeza clasificadora nocturna (regresión logística).
- **KPIs semanales**: periodos y métricas con cierre dominical.
- **Infra**: PostgreSQL migrado a `pgvector/pgvector:pg17` (conserva datos); nuevo servicio `face-service` con modelos horneados; respaldo/restauración documentados.
- **Fix**: `notifications.claimPending` usaba `FOR UPDATE` sobre el lado nullable de un `LEFT JOIN` (rompía el escaneo de alertas).

## Reconocimiento facial sobre fotos de WhatsApp (V49) — sin commit

> Enrolamiento incremental: se detectan rostros y se guardan embeddings ArcFace (512d) en PostgreSQL con pgvector; el humano asigna o confirma cada rostro para incorporar ejemplos revisados. Al iniciar, el worker escanea las fotos pendientes y actualiza sugerencias; después escanea cada seis horas y vuelve a entrenar cada 24 horas por defecto. El "entrenamiento diario" actualiza centroides y la cabeza clasificadora sobre ejemplos confirmados (no reentrena la red ArcFace).

- **Infra**: Postgres cambiado a `pgvector/pgvector:pg17` (mismo data dir PG17; conserva datos) con extensión `vector` 0.8.7. Nuevo servicio `face-service` (Python/FastAPI + insightface `buffalo_l`, ONNX CPU) con modelos **horneados en la imagen** (sin descargas en runtime).
- **Migración `065_whatsapp_faces.sql`**: `faces` (sha256, bbox, det_score, `embedding vector(512)`, índice HNSW coseno), `face_identities` (enlazadas a `technicians`/`users`, `centroid vector(512)`), `face_assignments` (source manual/model, revisable) y `face_models` (versiones de centroides/clasificador).
- **Worker** (`worker/src/faces.js`): `runFaceScan` busca fotos nuevas, pide embeddings a `face-service`, guarda `faces` (idempotente por `(sha256, model, bbox)`) y registra `media_analyses` (`face_detect`). `runFaceTraining` recalcula centroides usando solo asignaciones humanas, elimina y vuelve a generar las sugerencias del modelo y evita sugerencias ambiguas entre dos identidades cercanas. Así las predicciones no se reciclan como verdad de entrenamiento; las dos fotos diarias desde ángulos distintos aportan ejemplos distintos cuando se confirman.
- **API web**: `GET /api/whatsapp/media/{sha256}/faces` (bbox + score + identidad y dimensiones para el overlay), `POST/DELETE /api/whatsapp/faces/{id}/assign` (crea/reutiliza identidad por técnico/usuario), `GET /api/whatsapp/face-identities`; índice `/api/whatsapp` actualizado.
- **UI `/whatsapp`**: en el lightbox se dibujan las **cajas de rostros** sobre la foto y una lista para asignar cada rostro a un técnico o usuario (o quitarlo), con indicador de confianza y botón **Confirmar identidad** para convertir una sugerencia en ejemplo humano revisado.
- **Fix colateral**: `notifications.claimPending` usaba `FOR UPDATE` sobre el lado nullable de un `LEFT JOIN` (rompía `/api/internal/scan`); ahora `FOR UPDATE OF n`.
- Verificado: imagen face-service construida con modelos; `/health` OK; detección real (12 rostros en 19 fotos); asignación/desasignación por API; centroides calculados y limpiados según asignaciones; versiones de modelo incrementando.

## API de lectura de WhatsApp para agentes (2026-10-13) — sin commit

- Se agregan rutas protegidas con tokens `Bearer` existentes: `GET /api/agent/whatsapp` (índice), `/messages` (texto/caption y adjuntos), `/photos` (listado paginado) y `/photos/{sha256}` (descarga autenticada).
- Los listados filtran solo mensajes entrantes de grupos capturados; admiten búsqueda, remitente, conversación, rango ISO 8601 y paginación. Las fotos incluyen una ruta de descarga reutilizable.
- Se documenta el uso en el README y en Configuración → Agentes CLI. La API no envía mensajes.

## API de administración de Fotos de WhatsApp (V48c) — sin commit

> Superficie REST para leer y **manejar** los archivos capturados del grupo: detalle, etiquetas CRUD, vínculos a entidades, campos administrables, conversaciones/mensajes e índice. Todas las etiquetas y campos se guardan por SHA-256 (aplican a reenvíos).

- Migración `064_whatsapp_media_manage.sql`: en `whatsapp_capture.media_objects` agrega `note`, `is_favorite`, `is_archived`, `note_updated_by`, `note_updated_at` + índices.
- `GET /api/whatsapp`: índice autodescriptivo de endpoints y convenciones.
- `GET /api/whatsapp/media`: ahora incluye `note`/`is_favorite`/`is_archived` y filtros `favorite`/`archived` (`archived=all` incluye archivadas; por defecto se ocultan).
- `GET /api/whatsapp/media/[sha256]/info`: detalle JSON (media, etiquetas, apariciones con remitente/fecha/leyenda, vínculos a proyecto/ticket/actividad/técnico y análisis de IA).
- `PATCH /api/whatsapp/media/[sha256]`: actualiza `note`, `is_favorite`, `is_archived`.
- Etiquetas: `GET`/`POST`/`PATCH`(rename)/`DELETE` por foto en `.../[sha256]/tags`; `GET` (conteos) y `PATCH` (rename global) en `/api/whatsapp/tags`. Renombrar colapsa duplicados.
- Vínculos `.../[sha256]/links`: `GET`, `POST` (`{ type: project|ticket|activity|technician, id, message_id? }`, `source=human`, `status=confirmed`) y `DELETE ?id=`. Se anclan al mensaje donde apareció la foto.
- Conversaciones: `GET /api/whatsapp/conversations` (con conteos) y `GET /api/whatsapp/conversations/[id]/messages` (paginado, filtros `from/to/sender/q`, adjuntos embebidos).
- Verificado: migración aplicada, `tsc` limpio, build/arranque OK; probados índice, info, campos administrables, alta/renombrado/borrado de etiquetas (por foto y global), vínculos proyecto/ticket (alta y baja), conversaciones y mensajes; validaciones y limpieza de datos de prueba. Backfill de miniaturas: 19/19 imágenes con caché (436 KB).

## Fotos WhatsApp: miniaturas 25% y agrupación por semana (V48b) — sin commit

- **Miniaturas al 25%**: `GET /api/whatsapp/media/[sha256]/thumb` genera con `sharp` una imagen al 25% de ancho y alto del original (p. ej. 1200×1600 → 300×400 JPEG q80) y la **cachea en MinIO** (`seguimiento-archivos/whatsapp-thumbs/25/<sha>.jpg`); las siguientes peticiones sirven la caché. Solo imágenes (415 en otros tipos). La rejilla usa la miniatura; el lightbox sigue usando la foto completa.
- `sharp` agregado a dependencias de `web` y a `serverExternalPackages` en `next.config.ts`; helpers `storageObjectExists()` y `getStorageObjectBuffer()` en `web/app/lib/storage.ts`.
- **Agrupación por semana ISO del año** en `web/app/whatsapp/page.tsx` (zona `America/Mexico_City`): encabezados «Semana N · AAAA · (lun–dom)» con conteo por semana; las semanas se ordenan de la más reciente a la más antigua. Función `isoWeekInfo()` (correcta en cruces de año: 29 dic 2025 y 1 ene 2026 caen en Semana 1 · 2026).
- Verificado: `tsc` limpio, build/arranque OK; miniatura 300×400 (23 KB vs 184 KB original) servida y cacheada; página 200.

## Visor de fotos de WhatsApp con etiquetas (V48) — sin commit

> Galería web de los archivos capturados del grupo por el plugin `whatsapp-capture` (MinIO `whatsapp-media` + esquema `whatsapp_capture`). Permite filtrar por rango de fechas, remitente, etiqueta, tipo y texto; ver metadatos y vínculos; y etiquetar contenido. Preparado para enriquecer con IA.

- Migración `063_whatsapp_media_tags.sql`: tabla `whatsapp_capture.media_tags` (etiquetas por `sha256`, `source` `manual`/`ai`, `created_by`), índice único `(sha256, lower(tag))`; y alta de la sección RBAC `whatsapp` (ve todos; crear/editar admin+coordinator; borrar admin).
- `web/app/lib/storage.ts`: `whatsappBucket()` y `storageDownloadUrlInBucket(bucket, key)` para servir objetos del bucket `whatsapp-media`.
- APIs:
  - `GET /api/whatsapp/media`: lista filtrable (`from`,`to`,`sender`,`conversation`,`tag`,`q`,`kind`,`duplicates`,`limit`,`offset`) con etiquetas agregadas y vínculos a proyecto/ticket (`message_entity_links`); paginación con `total`.
  - `GET /api/whatsapp/media/[sha256]`: sirve el binario (presign + fetch, `Content-Type` real, cache privado).
  - `POST/DELETE /api/whatsapp/media/[sha256]/tags`: agrega/quita etiquetas (normaliza espacios, dedupe case-insensitive).
  - `GET /api/whatsapp/filters`: remitentes, etiquetas, conversaciones y estadísticas (total y rango).
- UI `web/app/whatsapp/page.tsx` (nav «Fotos WhatsApp», mark `V48`): rejilla agrupada por día (zona `America/Mexico_City`), filtros, "Cargar más", y lightbox con detalle, vínculos y editor de etiquetas. Estado por objeto (sha256), por lo que aplica a reenvíos del mismo archivo.
- La galería muestra una sola tarjeta por SHA-256, marca cuántas apariciones tiene y agrega el filtro «Solo fotos repetidas». El conteo identifica archivos idénticos, no versiones re comprimidas o visualmente parecidas.
- Revisión inicial de datos (2026-10-16): 113 fotos con SHA-256 repetido, 127 apariciones adicionales y hasta 4 mensajes por archivo; el conteo de la galería se calcula dinámicamente.
- La bandeja de documentos omite hashes con más de una aparición almacenada; las apariciones y archivos originales permanecen intactos en la galería de WhatsApp.
- Preparado para IA: las etiquetas admiten `source='ai'` y ya existe `whatsapp_capture.media_analyses` para resultados de OCR/reconocimiento.
- Verificado: migración aplicada, `tsc` limpio, restart de `web`; `filters`/`media` con datos reales (5 imágenes), servido de imagen (JPEG 184 KB) y CRUD de etiquetas (alta, dedupe, filtro, baja) y validaciones.

## WhatsApp: escucha continua del grupo y captura silenciosa (2026-10-12) — sin commit

> Objetivo: guardar en PostgreSQL los mensajes de texto nuevos de todos los participantes del grupo configurado, aunque no mencionen al agente, y mantener el grupo en modo de solo lectura.

- Diagnóstico: los eventos recientes observados en OpenClaw llegaban como mensajes directos, no como mensajes del grupo. El plugin ya tenía una lista permitida limitada al JID exacto del grupo, por lo que esos DMs no se guardaban en `whatsapp_capture`.
- Activación del plugin: la inspección local lo mostraba cargado, pero el Gateway no lo incluía en su lista de plugins. Se añadió en `openclaw-whatsapp-capture/openclaw.plugin.json` la activación al inicio (`onStartup`) y al ofrecer hooks (`onCapabilities: ["hook"]`). Tras reiniciar, el log del Gateway confirmó `whatsapp-capture` entre los 17 plugins cargados y WhatsApp escuchando DMs más un grupo configurado.
- Captura antes del modelo: `openclaw-whatsapp-capture/index.mjs` registra `before_dispatch` para persistir el mensaje entrante del grupo permitido y atenderlo con `{ handled: true }`. Así el texto y sus metadatos se guardan sin iniciar un turno del modelo ni responder. Los adjuntos no están disponibles en ese hook y no forman parte de esta captura grupal.
- Configuración aplicada en `~/.openclaw/openclaw.json`: `requireMention: false` solo para el grupo seleccionado; `captureInbound: true`, `captureOutbound: false` y `allowedChats` conserva únicamente ese grupo. Se mantienen los bloqueos de salida para que OpenClaw no publique respuestas allí.
- Intento de recarga: el Gateway rechazó la recarga en caliente porque no pudo verificar el ownership de `~/.openclaw/state/openclaw.sqlite`. Se reinició el servicio; el cierre agotó el límite de 330 segundos por fallos de limpieza asociados al mismo estado SQLite. Después systemd inició una instancia nueva.
- Verificación de recepción y archivos: se encontraron **3 mensajes entrantes** del grupo, cada uno con texto/caption y una imagen JPEG. En PostgreSQL los adjuntos figuran como `stored`; `statObject` confirmó que los tres objetos existen en MinIO y que sus bytes coinciden con `size_bytes`.
- Hallazgo y corrección de despacho: los primeros eventos sí se guardaron por `message_received`, pero `before_dispatch` no reconocía el JID cuando llegaba dentro de `sessionKey`; OpenClaw inició turnos del modelo y los hooks bloquearon las salidas. Se actualizó el matcher para revisar `ctx.conversationId`, `event.threadId` y las session keys. Si reconoce el grupo permitido, ahora atiende el evento incluso si la escritura previa falla, para evitar que el mensaje pase al modelo; el hook `message_received` sigue guardando texto y adjuntos.
- Incidencia durante recarga: el 2026-10-12 a las 03:35:39 UTC se recargó el plugin mientras se procesaba otro mensaje del grupo. Los hooks de salida de la versión que se estaba reemplazando fallaron y el log registra un envío completado al JID del grupo (el destino aparece anonimizado; su hash coincide con ese JID). No se pudo recuperar el texto enviado del log. La nueva versión se aplicó a las 03:35:41 UTC sin reiniciar Gateway.
- Auditoría por mensajes faltantes (2026-10-12): el journal de OpenClaw registra cinco entradas del grupo (03:20:34, 03:20:52, 03:35:28, 16:24:20 y 16:54:11 UTC); PostgreSQL contiene exactamente esas cinco entradas, y cada una tiene una imagen en estado `stored` en MinIO. No aparece una entrada del grupo recibida por Gateway que falte en la base. Los tres eventos con error de `message_received` a las 04:54–04:55 eran mensajes directos; la lista permitida solo incluye el grupo y no los captura. No se encontró contenido de grupo adicional en el transcript local para recuperar.
- Reinicio y verificación posterior: el Gateway nuevo arrancó a las 15:56:26 UTC con `whatsapp-capture` entre sus plugins y WhatsApp escuchando DMs más el grupo configurado. A las 16:24:20 y 16:54:11 UTC entraron mensajes grupales; en ambos casos el registro de ejecución confirma `before_dispatch_handled` sin respuesta encolada y PostgreSQL guardó el mensaje y su imagen. Los registros disponibles no permiten determinar si hubo mensajes en el grupo que nunca llegaron a Gateway.
- Alcance: no se amplió la captura a otros grupos ni a chats directos. La lista permitida continúa siendo exacta y privada; el identificador del grupo no se copia a este changelog.

## Pantallas por instalar: orden manual global + color de armado (V47b) — sin commit

- Migración `062_pending_install_order_status.sql`: en `project_screens` agrega `install_sort` (orden manual de la lista global de pendientes, separado del `sort_order` por proyecto de 056) y `assembly_status` (`'to_assemble'` amarillo, `'ready'` verde, `NULL` = blanco), con backfill del orden actual e índice.
- API `web/app/api/pending-installations/route.ts`: `GET` devuelve `install_sort` y `assembly_status` y ordena por `install_sort NULLS LAST`; nuevo `PATCH` transaccional con `{ order: string[] }` (reordena la lista global asignando 0..n-1) y `{ states: [{ id, assembly_status }] }` (color).
- UI `web/app/pantallas-pendientes/page.tsx`: primera columna **Orden** con ▲▼ (deshabilitadas en extremos, al guardar y con búsqueda activa); columna **Estado** con tres puntos (blanco/amarillo/verde); fondo de fila tintado (amarillo `bg-amber-50`, verde `bg-emerald-50`); leyenda de colores.
- Decisiones: el orden es sobre toda la lista (cruza proyectos); al buscar se desactiva el reordenamiento; el color solo se edita en esta ventana.
- Verificado: migración aplicada (35 pendientes con `install_sort`), `tsc` limpio, restart de `web`, `GET`/`PATCH` probados (estado y orden, con reversa) y validaciones de error.

## Pantallas por instalar: marca de página y buscador (V47) — sin commit

- Se agrega `/pantallas-pendientes` a `web/app/components/page-mark.tsx` (mark `V47`): antes la página no mostraba el identificador arriba a la izquierda que sí tienen las demás.
- Buscador en `web/app/pantallas-pendientes/page.tsx`: filtra por proyecto (código/nombre), tipo, ambiente, tensión, pitch, dimensiones, área y notas; insensible a acentos; muestra "N de M pantallas".

## Paleta de comandos y atajos de teclado (V46) — sin commit

> Navegación y acciones por teclado en cualquier sección, para reducir el uso del mouse. Sin atajos que choquen con Chrome/TeamViewer (se evita Ctrl+F): se usa el estándar Ctrl+K / Ctrl+Shift+P y secuencias `G` + letra.

- Componente global `web/app/components/command-palette.tsx` montado en `web/app/layout.tsx` (dentro de `ProfileGate`): buscador de secciones, acciones de creación y utilidades. Filtro insensible a acentos; navegación con flechas, `Enter` ejecuta y `Esc` cierra.
- Atajos: **Ctrl K** (abrir/cerrar), **Ctrl ⇧ P** (abrir), **Ctrl /** o **?** (ayuda de atajos), secuencias **G** → I/A/G/P/T/D/N/S/U/C (Inicio, Agenda, Gantt, Proyectos, Tickets, Pendientes, Notificaciones, Pantallas por instalar, Usuarios, Clientes). No se disparan mientras se escribe en un campo.
- Comandos "Crear": Nuevo proyecto, ticket, actividad, usuario, cliente, técnico y ubicación. Respetan los permisos RBAC (se ocultan según `/api/session`). Si la página destino no es la actual navegan con `?new=1`; si ya están en ella disparan el evento `sg:new`.
- Registro compartido de navegación `web/app/lib/nav.ts` (usado por `app-nav.tsx` y la paleta) para no duplicar la lista de secciones/etiquetas.
- Hook `web/app/lib/use-new-query.ts`: abre el modal de alta al llegar con `?new=1` o al recibir `sg:new`, y limpia el parámetro de la URL.
- Cableado de `?new=1`/`sg:new` en: `web/app/proyectos/page.tsx`, `web/app/tickets/page.tsx`, `web/app/components/week-agenda.tsx` (nueva actividad), `web/app/admin/usuarios/page.tsx`, `web/app/admin/clientes/page.tsx`, `web/app/admin/tecnicos/page.tsx`, `web/app/admin/ubicaciones/page.tsx`.
- Botón "Buscar… Ctrl K" en la cabecera del menú lateral (`app-nav.tsx`) que abre la paleta.
- Verificado: `tsc --noEmit` sin errores; build y arranque de `web` OK.

## Roles y permisos por secciones (V45) — sin commit

> Sin contraseñas por ahora: cada persona elige su perfil al entrar ("¿Quién eres?") y ese perfil determina qué secciones ve en el menú. Se introduce un modelo RBAC de roles → permisos por sección y asignación multi-rol por usuario.

- Migración `061_roles_rbac.sql` (aplicada): tipos enumerados `app_role_code`; tablas `roles`, `role_permissions` (rol × sección con `can_view/create/update/delete/export`), `user_roles` (multi-rol). Seed de 9 roles (admin, coordinator, technician, vendedor, tecnico_operativo, director_proyecto, finanzas, logistica, gerente) y 31 secciones. Backfill `user_roles` desde `users.role` y reglas de visibilidad por rol.
- Retrocompatibilidad: `users.role` (enum `user_role`) se conserva; al asignar roles se mapea a `admin`/`coordinator`/`technician` cuando alguno de ellos está presente.
- API: `GET /api/roles`; `GET/PUT /api/admin/roles/[id]/permissions`; `GET/PUT /api/users/[id]/roles`. `GET /api/session` ahora devuelve `roles` y `sections` (lista de secciones visibles, `["*"]` para admin).
- UI `/admin/roles`: matriz de checkboxes sección × acción por rol, agrupada; guardado transaccional.
- UI `/admin/usuarios`: el modal asigna múltiples perfiles (chips); la lista muestra todos los roles del usuario.
- Gating del menú (`web/app/components/app-nav.tsx`): cada ítem declara su `section`; se filtran según `sections` de `/api/session`. Nuevos enlaces: "Pantallas por instalar", "Roles y permisos", "KPIs semanales".
- Puerta de perfil (`web/app/components/profile-gate.tsx`): si no existe cookie `sg_uid`, se muestra a pantalla completa el selector de perfil y no se entra a la app hasta elegir. Envuelve el layout.
- Archivos: `web/app/lib/permissions.ts`, `web/app/api/roles/route.ts`, `web/app/api/admin/roles/[id]/permissions/route.ts`, `web/app/api/users/[id]/roles/route.ts`, `web/app/admin/roles/page.tsx`, `web/app/components/profile-gate.tsx`.

## Auditoría de medidas de pantallas (V44) — sin commit

> Un usuario detectó cenefas con alto «0.016 m» en vez de «0.16 m» (error de orden de magnitud al capturar). Se agrega una auditoría que recorre todas las pantallas de proyectos no cancelados y marca posibles errores de captura.

- **Reglas compartidas** (`web/app/lib/screen-rules.ts`, TS puro, reutilizables por el formulario en el futuro):
  - Orden de magnitud: alto < 1 cm = error; 1–5 cm = aviso «¿falta un cero?»; ancho/área con umbrales análogos.
  - Tamaños imposibles: ancho/alto/pitch/área fuera de rangos físicos, cantidad ≤ 0.
  - Coherencia `ancho × alto` vs `area_m2` (tolerancia 2%); relación de aspecto anormal.
  - Píxeles enteros a partir del `pitch_mm` (pantallas regulares).
  - Desviación frente al **catálogo de la cuenta** (`screen_catalog`): difiere ≥ 5× (o ≤ 0.2×) = error; entre 1.5×/0.6× = aviso.
- **Endpoint** `GET /api/admin/screen-audit`: escanea `project_screens` (proyectos no cancelados) con JOIN a catalogo/cliente; devuelve solo pantallas con alertas + conteos (`total`, `with_errors`, `with_warnings`, `ok`).
- **Página** `/admin/revision-pantallas` (nav «Auditoría pantallas», mark V44): chips de resumen, filtros por severidad y búsqueda, tabla con proyecto (link), dimensiones, área, pitch, medidas del catálogo y alertas (rojo = error, ámbar = aviso).
- E2E: con datos reales detectó 11 pantallas con avisos (altos de 9.6 m, relaciones de aspecto 0.33:1, etc.); la prueba con una cenefa temporal 0.016 m arrojó el aviso exacto «¿falta un cero? (¿0.16 m?)». Pantalla de prueba purgada.

## Pantallas a instalar: vista para PDF sin «Estado» + resumen de equipos (V43) — sin commit

> En la sección «Pantallas a instalar» de V4, el botón **PDF / Imprimir** genera ahora una impresión más útil: sin la columna «Estado» y con un resumen de los equipos requeridos por tipo.

- Se quita la columna **Estado** de la tabla impresa (ya no distinguía «Instalada/Cancelada» en el documento).
- La impresión considera solo las **pantallas activas** (excluye canceladas): el conteo del encabezado, la tabla y los totales de m²/MP ya no incluyen canceladas.
- Nueva sección **«Resumen de equipos requeridos por tipo»**: agrupa los controladores de pantallas activas por modelo/serie y suma las cantidades (ordenado de mayor a menor), con fila de total de equipos; si no hay equipos muestra «Sin equipos.».
- `web/app/proyectos/[id]/page.tsx` → `printPdf()`.

## Tickets: sucursal / ubicación a atender (V42) — sin commit

> La infraestructura ya existía (columna `tickets.location_id` desde `001_init`, tipos y APIs POST/PATCH/GET). Faltaba la UI: ahora el ticket captura y muestra la sucursal a atender, igual que los proyectos.

- Alta (`NewTicketModal`, `web/app/tickets/page.tsx`): nuevo campo **«Sucursal / ubicación a atender»** que carga `/api/locations`, se filtra por el cliente elegido (patrón de `proyectos/page.tsx`) y se envía como `location_id` en el POST. Al cambiar de cliente se limpia la sucursal ajena.
- Edición (`EditTicket`, `web/app/tickets/[id]/page.tsx`): selector de sucursal (opción «Sin sucursal») que hace `PATCH { location_id }`; se elimina el reset implícito/aviso de «se quitará la ubicación al cambiar de cliente» — ahora el usuario elige explícitamente.
- Detalle: tarjeta de datos generales con celda **«Sucursal / ubicación a atender»** (nombre + ciudad, spans la fila completa).
- Lista `/tickets`: nueva columna **«Sucursal / ubicación»** (visible por defecto, configurable desde ColumnSelector) con `Nombre, Ciudad`.
- E2E: PATCH de `location_id` real → GET detalle y lista devuelven `location_name`/`city`; datos de prueba limpiados. `tsc`/ESLint OK.

## Cierre de proyecto: opción «Sin equipo» (V41) — sin commit

> En V4 (cierre), cada pantalla ahora puede marcarse expresamente como «Sin equipo» cuando no utiliza un controlador nuestro o comparte uno ya considerado en otra pantalla. Hoy una pantalla "vacía" era indistinguible de "falta capturar".

- Migración `055_project_closure_no_equipment.sql` (aplicada): `project_closure_controllers.no_equipment boolean NOT NULL DEFAULT false` + CHECK `no_equipment = false OR controller_id IS NULL` (una fila "sin equipo" no referencia catálogo). Se mantienen los constraints existentes (`controller_name NOT NULL`, `quantity > 0`): la fila se guarda como `controller_name='Sin equipo'`, `quantity=1`, `serial_numbers=NULL`.
- UI (`project-closure.tsx`): la columna **Modelo** del listado de equipos definitivos incluye la opción **«Sin equipo (compartido o no aplica)»**; en esa fila Cant./SN se muestran en desuso y aparece una leyenda. La vista de proyecto cerrado muestra la pantalla con «Sin equipo (compartido o no aplica)».
- Validación: una fila "Sin equipo" **requiere** pantalla perteneciente al proyecto y no cancelada, y no acepta controlador (400 en ambos casos, front y back; `buildClosureControllers` idem).
- API: `PATCH /api/projects/[id]` (bloque `closure_controllers` 741–779) y `GET` precargan/devuelven `no_equipment` (SELECT 113–119). `ClosureController.no_equipment?: boolean`.
- E2E con proyecto `waiting_materials`: alta de fila "Sin equipo" + equipo normal (round-trip correcto), 400 al mezclar con controlador o sin pantalla; datos de prueba limpiados.

## Archivar tickets cerrados (V40) — sin commit

> Un botón «Archivar» oculta un ticket cerrado de la sección Tickets; el archivo es blando (siempre se puede desarchivar) y no afecta al Gantt de tickets, Pendientes ni Dashboard, que ya excluyen cerrados.

- Migración `054_ticket_archive.sql` (aplicada): `tickets.archived_at timestamptz` + índice parcial `idx_tickets_archived_at` (mismo patrón que `deletion_requested_at`).
- `PATCH /api/tickets/[id]` acepta `{ archived: true|false }`; archivar **solo** se permite si el ticket está `closed` (si no, 400), y queda en la bitácora (`action = "archive"`).
- `GET /api/tickets` excluye archivados por omisión y acepta `include_archived=1` para incluirlos; devuelve `archived_at`.
- Detalle (`/tickets/[id]`): botón **Archivar** en tickets cerrados y **Desarchivar** en archivados (con confirmación). Lista `/tickets`: casilla «Mostrar archivados» + badge «Archivado» en la fila.
- E2E con TK-005: archivar lo oculta de la lista, aparece con `include_archived=1`, desarchivar lo regresa; bitácora de prueba purgada.

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

## Auditoría de medidas de pantallas — botón "Validar" (V44b) — sin commit
- Tabla de auditoría (`/admin/revision-pantallas`): cada aviso ahora tiene botón **Validar** para marcarlo como revisado.
- Al validar se guarda en `screen_audit_ignores` (screen_id + issue_key hash) con usuario, fecha/hora y motivo opcional (registrado).
- Los avisos validados se ocultan de la auditoría y pueden reactivarse desde la misma tabla (aparecen tachados con tooltip para volver a mostrar).
- Endpoints: `POST/DELETE /api/admin/screen-audit/[screenId]/ignore`, `GET /api/admin/screen-audit/ignores`.
- Migración `057_screen_audit_ignore.sql`.

## Ubicaciones (V17): barra de búsqueda
- Agregada barra de búsqueda en `/admin/ubicaciones` para filtrar por nombre, ciudad, cliente o dirección. Muestra el conteo de resultados.

## Fix: asignación de técnico a ticket
- `POST /api/assignments`: corregido `SELECT name FROM technicians` → `display_name`. Causaba error 500 al asignar técnico a un ticket.

## Respaldos de conversaciones de WhatsApp
- En la galería de WhatsApp, administradores y coordinadores tienen **Respaldos del grupo** para subir un ZIP, elegir grupo/formato de fecha e importar mensajes y multimedia.
- Se guarda una sola copia física por SHA-256 en `whatsapp-backups`; cada colaborador/carga conserva auditoría en PostgreSQL y una segunda carga evita duplicar mensajes.
- El ZIP se marca como elegible para borrado temprano, con retención sugerida de siete días desde la carga más reciente. Se puede borrar para liberar espacio sin eliminar mensajes o multimedia importados.
- Límite de carga: 1 GiB. Migración `075_whatsapp_export_archives.sql`; Compose crea el bucket y espera a `minio-init` antes de iniciar la web.
- El importador también reconoce encabezados sin corchetes (`M/D/YY, h:mm AM - ...`) usados por exportaciones de WhatsApp en iOS, además del formato entre corchetes.
- El formato de fecha ahora se detecta automáticamente por defecto para evitar interpretar como D/M/A exportaciones M/D/A; se puede indicar manualmente si el respaldo es ambiguo.
- Corrección aplicada al respaldo de RGB Pendientes: importados 529 mensajes y 208 archivos multimedia; dos PDF del ZIP no tuvieron mensaje asociado.
