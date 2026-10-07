# API RGB-Gantt — seguimiento-operaciones

> Proyecto real en disco: `seguimiento-operaciones/` (Next.js App Router + Postgres 17 + MinIO).
> **RGB** no es un proyecto separado: es el `clients.name='RGB'` al que pertenecen operativamente todos los tickets internos (migraciones `024_internal_rgb_client.sql`, `025_internal_tickets_rgb.sql`).
> **Gantt** son dos vistas/APIs: Gantt de proyectos/fases (`/api/gantt` + `/gantt`) y Gantt de tickets (`/api/ticket-gantt` + `/gantt-tickets` V34).
> Versión código verificada: `v0.4.0` (`CHANGES.md` 2026-10-02).

Base URL local: `http://localhost:8080` (`APP_BASE_URL` en `.env.example`, `compose.yaml` mapea `8080->3000`). `TZ=America/Mexico_City`.

## 1. Convenciones

* Helpers `web/app/lib/api.ts`:
  * `jsonOk(data, status=200)` → `NextResponse.json(data)` **sin envoltorio**. Ej: `{ projects: [...] }`.
  * `jsonError(msg, status=400, details?)` → `{ error: string, details?: unknown }`.
  * `parseId(id)` valida UUID v4, `400 id inválido` si falla.
* **La mayoría de endpoints `/api/*` NO tienen auth** (sin sesión/JWT/cookie). `POST/PATCH /api/projects` usan `actor_id` opcional con fallback al primer `users.role='admin'`.
* **Endpoints `/api/agent/*` SÍ exigen token:** `Authorization: Bearer ag_<48hex>` o fallback `x-agent-token`. Ver §3.

## 2. Revisar estado vía API (recetas)

### 2.1 Estado de proyectos (incluye filtrar RGB si fuera cliente de proyecto)

```bash
# Todos activos (excluye closed/cancelled por defecto)
curl -s http://localhost:8080/api/gantt | jq '.projects[] | {code,name,client_name,health_status,phases: (.phases|length)}'

# Dashboard KPI
curl -s http://localhost:8080/api/dashboard | jq .

# Pendientes operativos (bloqueados, vencimientos, sin planificar, tickets nuevos/sin técnico/sin actualización)
curl -s http://localhost:8080/api/pendientes | jq 'keys'

# Proyectos vía agente (requiere token, permite q=RGB para buscar por cliente/código/nombre)
curl -s -H "Authorization: Bearer $AGENT_TOKEN" 'http://localhost:8080/api/agent/projects?q=RGB' | jq .
curl -s -H "Authorization: Bearer $AGENT_TOKEN" 'http://localhost:8080/api/agent/projects?status=installation' | jq .
```

`status` en `agent/projects` solo se aplica si está en `["new","planning","waiting_authorization","waiting_materials","assembly","ready_install","installation","pending_docs"]`; si no, filtra `NOT IN ('closed','cancelled')`.

### 2.2 RGB = tickets internos + Gantt de tickets

Regla negocio: `tickets.ticket_type='internal' => client_id = (SELECT id FROM clients WHERE lower(trim(name))='rgb')`. En `GET /api/ticket-gantt` además: `COALESCE(c.name, CASE WHEN ticket_type='internal' THEN 'RGB' END) AS client_name`.

```bash
# Todos los tickets abiertos para Gantt (luego filtrar client_name=="RGB" con jq)
curl -s http://localhost:8080/api/ticket-gantt | jq '.tickets[] | select(.client_name=="RGB") | {code,title,status,items: (.items|length)}'

# Técnicos activos disponibles para asignar
curl -s http://localhost:8080/api/ticket-gantt | jq .technicians
```

## 3. Auth agentes CLI

`web/app/lib/agent-auth.ts`:

* Generación: `POST /api/agent-tokens {name}` → `token="ag_"+randomBytes(24).hex` (192 bits), en DB solo `sha256(token)`. **El secreto en claro solo se ve una vez en esa respuesta.**
* Verificación: `SELECT ... FROM agent_tokens t JOIN users u ON u.is_agent WHERE token_hash=sha256(token) AND active AND revoked_at IS NULL`. Si ok, `UPDATE last_used_at=now()`. `actorId` = primer `users.is_agent` (no por-token).
* `401 { error: "Token de agente inválido o ausente" }` si falla.
* `agentReason = "<acción> por agente CLI (<tokenName>)"` → se guarda en `status_history.reason`.

⚠️ Hallazgo seguridad: `GET/POST /api/agent-tokens`, `DELETE /api/agent-tokens/[id]` y `GET /api/me` **no llaman a `authenticateAgent`** — exponen inventario/creación/revocación sin auth. `GET /api/agent/me` sí exige token.

```bash
# Crear token (sin auth actualmente)
curl -s -X POST http://localhost:8080/api/agent-tokens -H 'Content-Type: application/json' -d '{"name":"cli-revision"}'
# Verificar
curl -s -H "Authorization: Bearer ag_..." http://localhost:8080/api/agent/me
# Revocar (soft: active=false, revoked_at=now())
curl -s -X DELETE http://localhost:8080/api/agent-tokens/<uuid>
```

## 4. Referencia endpoints

### `GET /api/gantt` — `web/app/api/gantt/route.ts:4`
Sin params, sin auth. `200 { projects[] }`.
Proyecto: `{id,code,name,health_status,planned_start_date,planned_end_date,client_name,min_phase_start,max_phase_end,phases[]}`.
Fase: `{id,project_id,name,kind (phase_catalog.kind),status,planned_start_date,planned_end_date,actual_start_date,actual_end_date,blocked_reason,next_action,next_action_date}`.
SQL: proyectos `WHERE status<>'cancelled' ORDER BY created_at`; fases `WHERE status<>'not_applicable' ORDER BY sort_order,created_at`; agrupación JS por `project_id`. Desde V4 incluye `blocked_reason/next_action/next_action_date`.

### `GET /api/ticket-gantt` — `web/app/api/ticket-gantt/route.ts:27`
Sin params, sin auth. `200 { tickets[], technicians[] }`, `500 {error:"No se pudo generar el Gantt de tickets"}`.
Ticket: `{id,code,title,status,ticket_type,client_name,priority_name,next_action,next_action_date,opened_at,items[],assignments[]}`.
Item: `{id,kind:"activity"|"next_action",label,status,start_date,end_date,planned_hours:number,technicians:string[]}`. Si `next_action_date` se inyecta item sintético `id="next-<ticket>"`.
`assignments`: activas (`unassigned_at IS NULL`). `technicians`: `active=true`. Actividades: `status<>'cancelled'`.

### `GET /api/agent/projects` + `POST` — `web/app/api/agent/projects/route.ts:19,73`
Auth agente obligatoria. GET query `status?,q?` (ver §2.1). Respuesta `{projects[]}` con `phases=json_agg(...)` vía `LEFT JOIN LATERAL`.
POST body `CreateProjectInput {name*,client_id?,location_id?,priority_id?,coordinator_id?,planned_start_date?,planned_end_date?,phases?[]}`. Crea `code='PR-'+seq`, si sin fases copia `phase_catalog.active`. `201 {project:{id,code,name,status,health_status,created_at}}`.

### `POST /api/agent/tickets` — `web/app/api/agent/tickets/route.ts:7`
Auth agente. Body `{title*,description*,reported_by*,ticket_type?="external"|"internal",client_id?,location_id?,priority_id?,coordinator_id?,channel_id?}`. Si `external` exige `client_id`; si `internal` ignora `client_id` y resuelve cliente RGB o `ServiceError "No existe el cliente RGB"`. `code='TK-'+seq`. `201 {ticket:{id,code,title,ticket_type,status,opened_at}}`.

### `PATCH /api/agent/activities/[id]` — `web/app/api/agent/activities/[id]/route.ts:7`
Auth agente. Path UUID. Body `{status* in ["planned","in_progress","completed","cancelled"]}`. Transacción `SELECT ... FOR UPDATE`, `UPDATE`, `INSERT status_history` solo si cambia. `200 {activity:{id,date,description,status,planned_hours}}`.

### `GET /api/agent/me` — `web/app/api/agent/me/route.ts:5`
Auth agente. `200 {agent:{token_id,token_name,actor_id}}`.

### `GET/POST /api/agent-tokens`, `DELETE /api/agent-tokens/[id]` — sin auth (ver §3)

### `GET /api/projects?q=&status=` — `web/app/api/projects/route.ts`
Sin auth. `status` enum 10 estados (`new...cancelled`), se ignora si inválido. `q` → `ILIKE %q%` en `p.name|p.code|c.name` (sirve para `q=RGB`). Devuelve calculados `phase_count,min/max_phase,screen_count,screen_m2_total,all_phases_completed`. Excluye `cancelled`.
`POST` delega a `createProject`, `201 {project}`.
`GET /api/projects/[id]` devuelve `{project,phases,assignments,comments,history,attachments,screens[] con m2+controllers,closure,closure_controllers,closure_module_lots}`.
`PATCH /api/projects/[id]` transaccional: escalares, `health_status` (si `blocked` exige motivo+acción), `phases[]` (upsert/delete), `screens[]` (valida regular `width/height>0` vs irregular `area>0`, `quantity>0`, `environment`, `voltage 110ac|220ac`, reemplazo `screen_controllers`), `closure` + `close_project` con checklist (installation_done,hours_justified,delivery_sheet válida,receiver,fecha,lote por pantalla activa), `DELETE` = baja lógica `status='cancelled'`.

### `GET /api/pendientes` — `web/app/api/pendientes/route.ts`
Sin params/auth. `{bloqueados,vencimientos,sin_planificar,actividades_vencidas,tickets_nuevos,tickets_sin_tecnico,tickets_sin_actualizacion,resoluciones_por_validar}`. Ver SQL en resumen: bloqueados por `health_status` o fase `blocked`; vencidos `UNION projects+phases`; sin planificar `planned_start_date IS NULL`; tickets `new/unassigned/sin update 3d/por validar`.

### `GET /api/dashboard` — `web/app/api/dashboard/route.ts`
Sin params/auth. `{generated_at,agenda:{today,overdue,upcoming,technicians},projects:{active,blocked,installation,total_m2},tickets:{open,unassigned,in_progress,waiting,overdue_actions},admin:{users,clients,pending_deletions,unread_notifications,available_modules,incoming_modules}}` con `COUNT(*) FILTER`.

### `GET/PATCH /api/planning` — `web/app/api/planning/route.ts`
GET sin params: `{projects[] con screens[]+m2_unit/m2_total+controllers[],totals:{projects,screens,m2},controllers[] demanda agregada}`.
PATCH `{target:"screen"|"controller",id:uuid,notes?:≤2000,installed?:bool}`: si `controller+installed` → `UPDATE installed`; resto → `UPDATE notes`.

## 5. Archivos fuente clave

* `web/app/api/gantt/route.ts`, `ticket-gantt/route.ts`, `agent/*/route.ts`, `agent-tokens/*/route.ts`, `projects/**/route.ts`, `pendientes/route.ts`, `dashboard/route.ts`, `planning/route.ts`
* `web/app/lib/agent-auth.ts`, `web/app/lib/api.ts`, `web/app/lib/services/projects.ts`, `tickets.ts`, `activities.ts`
* `web/app/components/gantt-view.tsx`, `ticket-gantt-view.tsx`, `db/migrations/024_*rgb*,025_*rgb*,005_gantt_phase_kinds.sql`
* Esta doc vive aquí para la sesión de revisión continua de proyectos vía API.
