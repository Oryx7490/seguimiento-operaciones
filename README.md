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
db/backup/backup.sh [destino]    # pg_dump (formato custom) + mirror de MinIO
db/backup/restore.sh [pg.dump] [dir_minio]   # restaura sobre los datos actuales
```

Sugerencia cron (diario 00:15 + copia a segundo dispositivo):

```
15 0 * * * /home/saruman/seguimiento-operaciones/db/backup/backup.sh /mnt/respaldo >> /var/log/seguimiento-backup.log 2>&1
```

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

## Cambios de esquema recientes

Aplicadas `001`–`011`. Las últimas agregan:

- `008` — `username` y correo opcional en usuarios (técnicos sin email).
- `009` — perfiles/expediente de técnicos, `specialties`, `technician_specialties` y documentos.
- `010` — calendario laboral (`non_working_days`) y umbral `half_day_hours`.
- `011` — asistencia y conciliación de horas extra (`attendance_batches`, `attendance_entries`,
  `technician_aliases`, `overtime_allocations`) y umbrales `overtime_daily_hours`/`overtime_weekly_hours`.