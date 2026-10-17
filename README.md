# seguimiento-operaciones

Sistema web de operaciones técnicas: proyectos de instalación, tickets de mantenimiento,
actividades diarias y horas planeadas/reales. Ver `diseno-sistema-seguimiento-operaciones.md`
(diseño) en la raíz del home para el contexto completo.

## Stack

| Servicio       | Imagen/tecnología                                  | Puertos (127.0.0.1) |
|----------------|----------------------------------------------------|---------------------|
| web            | Next.js (App Router, TypeScript, Tailwind)         | 8080 → 3000         |
| worker         | Node 22 — tareas programadas (alertas, vencimientos)| —                  |
| postgres       | postgres:17-alpine                                 | 5433                |
| minio          | minio (S3 compatible) + consola                    | 9010 / 9011         |

Todos los puertos están ligados a `127.0.0.1` para uso local. El `compose.yaml` está pensado
para migrar después a un VPS: PostgreSQL estándar, migraciones versionadas, variables de entorno
y capas de archivos/notificaciones desacopladas del proveedor.

## Primer arranque

```bash
cp .env.example .env                 # y llenar los secretos
# o el .env ya generado con: openssl rand -hex 24 / -hex 32 para los secretos

docker compose up -d                 # levanta postgres, minio, minio-init, web, worker
docker compose logs -f minio-init    # crea el bucket S3 shared una sola vez

cd db/scripts && npm install && node migrate.js   # aplica migraciones
node status.js                       # estado de migraciones
```

La web queda en http://localhost:8080 y la consola de MinIO en http://localhost:9011.

## Migraciones

- Se guardan en `db/migrations/` con formato `NNN_descripcion.sql`.
- El runner (`db/scripts/migrate.js`) las aplica en orden dentro de una transacción y registra
  versión + checksum en `schema_migrations`.
- Regla: **no edites una migración ya aplicada**. Si necesitas cambiar algo, crea una nueva.
- `db/scripts/status.js` muestra aplicadas/pendientes.

## Respaldo y restauración

```bash
db/backup/backup.sh [destino]    # pg_dump (formato custom) + mirrors MinIO
db/backup/restore.sh [pg.dump] [dir_minio] [dir_minio_whatsapp]
```

Sugerencia cron (diario 00:15 + copia a segundo dispositivo):

```
15 0 * * * /home/saruman/seguimiento-operaciones/db/backup/backup.sh /mnt/respaldo >> /var/log/seguimiento-backup.log 2>&1
```

La ingesta de WhatsApp usa el esquema `whatsapp_capture` en PostgreSQL y un bucket
independiente `whatsapp-media` en MinIO. Los archivos se nombran por SHA-256 y las tablas
`media_objects`/`message_media` reutilizan el mismo objeto cuando se reenvía. El respaldo
incluye ambos buckets. El plugin de OpenClaw está en `openclaw-whatsapp-capture/`; la
captura permanece desactivada hasta configurar chats permitidos y credenciales locales.
El bucket `whatsapp-backups` es temporal y no forma parte de los mirrors durables de `db/backup/backup.sh`.

### Importar respaldos semanales del grupo

El importador conserva mensajes y adjuntos de un ZIP de WhatsApp, concilia archivos con
las referencias del texto y evita duplicar mensajes entre respaldos solapados. Primero
sube el ZIP al contenedor web y ejecuta el análisis (no escribe datos):

```bash
docker compose cp /ruta/RGB_Pendientes.zip web:/tmp/RGB_Pendientes.zip
docker compose exec -T web node scripts/import-whatsapp-export.mjs \
  /tmp/RGB_Pendientes.zip --conversation-id 0800a1fc-a7fa-4543-875c-ddc1a9ecf721
```

Revisa el informe —fechas, remitentes, mensajes nuevos/solapados, marcadores sin archivo,
archivos huérfanos y posibles coincidencias ambiguas— y, cuando no haya ambigüedades,
aplica el lote:

```bash
docker compose exec -T web node scripts/import-whatsapp-export.mjs \
  /tmp/RGB_Pendientes.zip --conversation-id 0800a1fc-a7fa-4543-875c-ddc1a9ecf721 --apply
```

El modo predeterminado es de análisis. El mismo ZIP se reconoce por SHA-256; nuevos ZIP
con semanas repetidas se concilian por huella de mensaje y número de repetición. Las
coincidencias dudosas detienen `--apply` para revisión manual. Las horas del texto se
interpretan en `America/Mexico_City` por defecto.

Cuando el exportado pone `<image omitted>` o `<album message>`, el mensaje conserva su
fecha, hora y remitente, y PostgreSQL registra un adjunto `unavailable`; la galería de
WhatsApp muestra **Foto no incluida** en esa fecha/hora. Eso permite localizar la ausencia,
pero el texto no contiene los bytes para reconstruir la foto. Si el ZIP incluye los medios,
el importador enlaza nombres citados con archivos y guarda los binarios en MinIO.

Los administradores y coordinadores también pueden cargar el respaldo desde **WhatsApp →
Respaldos del grupo**. La pantalla importa el ZIP y conserva en `whatsapp-backups` una copia
temporal por SHA-256; nuevas cargas del mismo archivo quedan auditadas por colaborador y
grupo, pero no duplican el objeto ni los mensajes. La retención sugerida es de siete días
desde la última carga. Se puede borrar el ZIP antes desde esa pantalla para liberar espacio;
los mensajes y archivos multimedia ya importados permanecen en PostgreSQL y MinIO.
El límite de subida es 1 GiB. `WHATSAPP_BACKUP_BUCKET` permite cambiar el nombre del bucket.

### Documentos desde fotos

La bandeja **Administración → Documentos desde fotos** usa Qwen (Ollama) para clasificar
comprobantes, hojas de servicio y hojas de entrega; extrae texto, proveedor, fecha, folio,
importes y conceptos, y propone un proyecto activo con una explicación. La revisión guarda
la propuesta original, los datos corregidos, quién revisó y las notas de discusión; al
confirmar una revisión crea el vínculo humano del documento con el proyecto, ticket o póliza
elegidos en la galería de WhatsApp. Esto conserva evidencia revisada, no crea por sí solo un
asiento contable. En hojas de servicio, el destino puede ser cualquiera de esos tres tipos.

El selector busca por tipo y muestra hasta cinco coincidencias; escribe al menos dos
caracteres para buscar por código, título/nombre o cliente.

La bandeja solo incluye imágenes con análisis facial completado y cero rostros detectados.
También omite hashes con más de una aparición de imagen almacenada en WhatsApp; los archivos
originales y sus relaciones se conservan en la galería. El worker espera a que termine el
análisis facial antes de procesar cada documento con Qwen y procesa hasta 100 documentos
elegibles por lote nocturno.

El entorno local `ocr` tiene `paddlex[ocr]==3.7.2`, `paddlepaddle==3.2.2` y NumPy 2.3.5.
PP-StructureV3 analiza maquetación y tablas; se probó con una hoja de servicio piloto. Se fijó
PaddlePaddle en 3.2.2 porque la versión 3.3.1 presenta un fallo de CPU/oneDNN al inferir.
La pantalla existente usa OCR guardado como respaldo mientras Qwen no esté disponible.

La configuración local `.env` usa `OLLAMA_BASE_URL=http://host.docker.internal:11434` y
`OLLAMA_MODEL=frob/qwen3.5-instruct:9b`. El servicio `ollama-docker-bridge.service` escucha
solo en `172.17.0.1:11434` (puente Docker), para que `web` llegue a Ollama sin publicar su API
en la red local física. El worker procesa automáticamente hasta 100 documentos elegibles,
uno por uno, a la 01:00 (hora de `DEFAULT_TIMEZONE`, por defecto Ciudad de México). Puedes cambiar
la hora con `EXPENSE_PHOTO_SCAN_HOUR` o desactivar la programación con
`EXPENSE_PHOTO_SCAN_ENABLED=false`. El botón de lote de la pantalla también permite iniciarlo
a mano.

## Decisiones de modelo incorporadas

- **Actividad multi-proyecto** (excepcional): tabla puente `activity_projects`; el sistema
  confirmará cuando una actividad toque más de un proyecto.
- **Fases libres**: `project_phases.name` es libre; `phase_catalog` precarga
  Planeación → Armado → Instalación → Cierre al crear un proyecto.
- **Tickets internos** (agua/energía/internet): `tickets.ticket_type = internal` con
  `client_id`/`location_id` opcionales.
- **Cierre con finiquito**: `project_closures` valida sección operativa (instalación,
  actividades obligatorias, horas justificadas, hoja de entrega adjunta, receptor, fecha)
  y sección financiera (finiquito + complemento fiscal) antes de la firma digital y `closed_at`.
- **Horas**: planeadas en `activities.planned_hours`; reales en `time_entries`
  (inicio/fin o duración); correcciones en `hour_adjustments` (motivo + autor), sin
  sobrescribir histórico.
- **Último movimiento**: `last_activity_at` en proyectos/tickets se actualiza vía triggers
  al tocar comentarios, adjuntos, estados o actividades.

## Roles

| Rol         | Alcance                                                    |
|-------------|------------------------------------------------------------|
| technician  | Ver sus actividades, registrar horas, abrir tickets, adjuntar evidencia. No cierra. |
| coordinator | Tablero completo, asignar/programar, cambiar estados, cerrar/reabrir, cierre con firma digital. |
| admin       | Usuarios, roles, catálogos, canales, auditoría, respaldos.  |

## Estado por fases

- ✅ **Fase 0 — Infraestructura:** Docker Compose (web, worker, PostgreSQL 17, MinIO), migraciones
  versionadas, storage S3, respaldo/restauración y seed de catálogos.
- ✅ **Fase 2 — Operación básica:** usuarios/roles/técnicos, clientes y ubicaciones, proyectos y
  fases (con etapas logísticas y "No aplica"), tickets, asignaciones, comentarios e historial.
  Alta de técnicos sin correo mediante `username` (migración `008`).
- ✅ **Fase 3 — Agenda y horas:** agenda semanal (lunes–domingo) con conmutador **Semana / Día**
  («Hoy» abre la vista del día: una columna horizontal por técnico con sus actividades apiladas y
  resumen de horas plan/real), múltiples actividades por técnico/día, varios técnicos por actividad,
  horas planeadas y reales, filtros y vista móvil del técnico.
- ✅ **Fase 4 — Seguimiento:** bandeja de pendientes (`/pendientes`), bloqueos con motivo y próxima
  acción, vencimientos, Gantt real con filtros por etapa y cierre con hoja firmada obligatoria.
- ✅ **Fase 5 — Alertas:** notificaciones internas, correo SMTP, plantillas por canal, registro de
  envíos y adaptador de WhatsApp saliente (apagado). Falta solo el webhook de recepción.
- ✅ **Fase 7 — API para agentes CLI:** tokens con hash, endpoints `/api/agent/*` y administración
  de tokens en Configuración → Agentes CLI.
- ✅ **Fase 7.5 — Perfiles y expediente de técnicos:** catálogo de habilidades con propuestas del
  técnico y aprobación del admin, expediente (NSS, CURP, dirección, emergencia, notas) y documentos
  confidenciales en MinIO. El Técnico autogestiona contacto y habilidades desde «Mi perfil».
- ✅ **Fase 8 — Calendario laboral:** días no laborables (oficiales LFT + discrecionales) y resumen
  anual por técnico; además la escala del Gantt ofrece Mes / 2 semanas / 1 semana.
- ✅ **Fase 10 — Horas extra externas:** importación de asistencia (persona, fecha, entrada/salida;
  hoy CSV/TSV, Excel al recibir archivo de ejemplo), conciliación por quincena natural, empareje por
  nombre con equivalencias y reparto editable de horas extra por actividad.
- ⏳ **Fase 9 — Mapa de ubicaciones (Google Maps):** pendiente de `GOOGLE_MAPS_API_KEY`.
- ⏳ **Fase 1 — inicio de sesión:** omitido por ahora; despliegue en red local con actor único y
  captura de usuario en el cliente (ver sección 12 del diseño).
- ⏳ **Fase 6 — Piloto:** prueba en campo, ajustes y autorización de salida.

## API de lectura de WhatsApp

Los tokens de agente también pueden consultar los mensajes entrantes y fotografías de los grupos
capturados. Crea un token en **Configuración → Agentes CLI** y envíalo como
`Authorization: Bearer <token>`.

- `GET /api/agent/whatsapp` — índice y parámetros disponibles.
- `GET /api/agent/whatsapp/messages` — mensajes, texto/caption, remitente, identidad vinculada y adjuntos.
- `GET /api/agent/whatsapp/participants` — perfiles enlazados a RGB-Gantt y remitentes aún por identificar.
- `GET /api/agent/whatsapp/photos` — fotografías guardadas y sus captions.
- `GET /api/agent/whatsapp/photos/{sha256}` — descarga autenticada del archivo original.

Mensajes acepta `q`, `sender`, `conversation_id`, `participant_id`, `user_id`, `technician_id`,
`direction`, `after`, `before`, `limit` y `offset`. Participantes acepta `q`, `user_id`,
`technician_id`, `include_unresolved`, `limit` y `offset`.
Las fechas `after`/`before` deben estar en ISO 8601 con zona horaria; `before` es exclusivo.
`limit` va de 1 a 200 (predeterminado 50). Ejemplo:

```bash
curl -H "Authorization: Bearer ag_..." \
  "http://localhost:8080/api/agent/whatsapp/messages?limit=20"
```

Estos endpoints solo leen mensajes y fotos. No envían mensajes de WhatsApp.

### Perfiles e identificación de remitentes

Los agentes consultan perfiles con `GET /api/agent/whatsapp/participants`. Cada mensaje incluye
`participant` cuando un alias verificado coincide de forma única. Si no, `participant` es `null`
y el remitente aparece en `unresolved_senders` para revisión.

La administración de perfiles requiere sesión de RGB-Gantt con rol `admin` o `coordinator`:

- `GET /api/whatsapp/participants?q=...` — perfiles, alias y remitentes pendientes de identificar.
- `POST /api/whatsapp/participants` — crea un perfil independiente o lo vincula con un usuario/técnico.
- `GET/PATCH /api/whatsapp/participants/{id}` — consulta/actualiza el vínculo y la clasificación.
- `GET/POST /api/whatsapp/participants/{id}/aliases` — consulta/agrega números, nombres o IDs de WhatsApp.
- `PATCH /api/whatsapp/participants/{id}/aliases/{aliasId}` — verifica o cierra la vigencia de un alias.

`company_status` acepta `current`, `former`, `external` y `unclassified`; user_id y technician_id
son opcionales, por lo que se pueden registrar exintegrantes, directivos o colaboradores externos
sin darles de alta como empleados. Los teléfonos aceptan las categorías `primary`,
`permanent_secondary`, `temporary` y `previous`. Se agregan números nuevos y se cierra la vigencia
de los anteriores; los alias antiguos no se borran. `valid_from` y `valid_to` admiten `YYYY-MM-DD`
o timestamps ISO 8601 con zona horaria; `valid_to` es exclusivo. En caso de dos coincidencias
vigentes, el sistema deja el mensaje sin asignar.

Ejemplo de perfil externo con dos nombres/identificadores confirmados:

```json
{
  "display_name": "Nombre conocido",
  "company_status": "external",
  "aliases": [
    { "identifier_type": "display_name", "identifier_value": "Nombre en WhatsApp" },
    { "identifier_type": "phone", "identifier_value": "+52 55 1234 5678", "category": "primary" }
  ]
}
```

Los mensajes históricos y los nuevos se asocian con el perfil solo al coincidir con alias
verificados. Los teléfonos importados desde la ficha del técnico se muestran como sugerencias no
verificadas; un remitente validado previamente en asistencia sí se conserva como alias verificado.

## Cambios de esquema recientes

Las migraciones viven en `db/migrations/`. Entre las principales:

- `008` — `username` y correo opcional en usuarios (técnicos sin email).
- `009` — perfiles/expediente de técnicos, `specialties`, `technician_specialties` y documentos.
- `010` — calendario laboral (`non_working_days`) y umbral `half_day_hours`.
- `011` — asistencia y conciliación de horas extra (`attendance_batches`, `attendance_entries`,
  `technician_aliases`, `overtime_allocations`) y umbrales `overtime_daily_hours`/`overtime_weekly_hours`.
- `070` — importación de respaldos de WhatsApp, solapamientos, deduplicación y faltantes multimedia.
- `071` — perfiles de participantes y alias telefónicos con vigencia, incluidos externos y exintegrantes.
- `075` — ZIP temporales de respaldos en MinIO, auditoría de cargas y estados de importación.
- `076` — revisión de documentos fotografiados, extracción y asociación de gastos a proyectos.
- `077` — vínculos de documentos y revisiones a tickets y pólizas de mantenimiento.
- `078` — embeddings y candidatos experimentales OpenCV SFace, aislados de `buffalo_l` y de las asignaciones usadas por asistencia.
- `079` — instantánea de las fotos humanas usadas por cada versión de los modelos faciales.
