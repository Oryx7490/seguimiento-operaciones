# Seguimiento aislado para el diseñador LED

La rama `codex/led-designer` es la copia local de trabajo del diseñador. Parte
de seguimiento `v0.4.0` (`origin/master`, `d9418e9`) y sólo añade commits
propios del diseñador. La rama anterior `codex/led-designer-e00` se conserva
sin cambios como respaldo de E00–E02.

La configuración de desarrollo usa el proyecto Compose `led-designer-dev` y
lee credenciales propias de `.env.local` (ignorado por Git).

## Ver en el navegador

Abrir [http://100.68.83.67:18080/disenador](http://100.68.83.67:18080/disenador)
desde un equipo conectado a la misma red Tailscale. La RC es la versión `0.0.1`.
E02 presenta una retícula rectangular inicial de 4 × 3 gabinetes sintéticos;
puedes cambiar filas y columnas y consultar medidas, área y listado.

Seguimiento no tiene inicio de sesión todavía (README, «Fase 1»): cualquier
equipo de la red Tailscale puede abrir esta copia. El motor Python no publica
puertos; sólo la web lo alcanza por la red interna de Compose.

## Arranque y revisión

Ejecutar desde esta carpeta:

```bash
docker compose --env-file .env.local -p led-designer-dev \
  -f compose.yaml -f compose.led-dev.yaml up -d postgres minio
docker compose --env-file .env.local -p led-designer-dev \
  -f compose.yaml -f compose.led-dev.yaml up -d --build web
docker compose --env-file .env.local -p led-designer-dev \
  -f compose.yaml -f compose.led-dev.yaml ps
docker compose --env-file .env.local -p led-designer-dev \
  -f compose.yaml -f compose.led-dev.yaml logs --tail=50 web
```

`web` compila al arrancar (`next build && next start`): tras cambiar código web
basta `restart web`. El motor no recarga solo: tras cambiar `designer-engine/`
ejecutar `restart designer-engine`.

Para detener los contenedores sin borrar el almacenamiento local:

```bash
docker compose --env-file .env.local -p led-designer-dev \
  -f compose.yaml -f compose.led-dev.yaml stop
```

### Dependencias npm dentro del contenedor

El contenedor web tiene `NODE_ENV=production`. Un `npm install` normal dentro
de él elimina las dependencias de desarrollo (Tailwind, ESLint, TypeScript) y
rompe el build. Usar siempre:

```bash
docker compose --env-file .env.local -p led-designer-dev \
  -f compose.yaml -f compose.led-dev.yaml exec web npm ci --include=dev
```

## Pruebas

Motor Python (pytest, casos de aceptación de cada etapa):

```bash
docker compose --env-file .env.local -p led-designer-dev \
  -f compose.yaml -f compose.led-dev.yaml run --rm --no-deps designer-engine \
  sh -c "pip install -q -r requirements-dev.txt && python -m pytest -q -p no:cacheprovider"
```

Web (lint y tipos del módulo):

```bash
docker compose --env-file .env.local -p led-designer-dev \
  -f compose.yaml -f compose.led-dev.yaml exec web \
  sh -c "npx eslint app/components/led-designer.tsx app/api/led-designer && npx tsc --noEmit -p ."
```

## Migraciones de la base de prueba

Usar siempre el puerto de desarrollo `15433`, nunca `5433` (seguimiento
operativo). Tomar usuario, clave y base de `.env.local`:

```bash
cd db/scripts
DATABASE_URL="postgres://USUARIO:CLAVE@127.0.0.1:15433/BASE" node status.js
DATABASE_URL="postgres://USUARIO:CLAVE@127.0.0.1:15433/BASE" node migrate.js
```

`.env.local` no se puede cargar con `source`: `SMTP_FROM` contiene `<…>` sin
comillas. Compose sí lo lee correctamente.

## Puertos de desarrollo

| Servicio | Dirección local |
|---|---|
| Diseñador LED | `100.68.83.67:18080/disenador` (Tailscale) |
| PostgreSQL | `127.0.0.1:15433` |
| MinIO S3 | `127.0.0.1:19010` |
| Consola MinIO | `127.0.0.1:19011` |
| Correo de prueba | `127.0.0.1:18025` |

PostgreSQL y MinIO usan volúmenes con prefijo `led-designer-dev`. La web y el
worker montan el código de esta copia, no el directorio operativo. No ejecutar
`down -v`: eliminaría la base y los archivos guardados en el entorno de prueba.

## Sincronización con seguimiento

Ver «Integración con seguimiento» en `/home/saruman/disenador-led/ESTADO_IMPLEMENTACION.md`.
Resumen: los cambios de `origin/master` se incorporan con `git merge` (nunca
rebase de commits ya registrados) antes de comenzar cada etapa; el código del
diseñador se mantiene en rutas propias para reducir conflictos.

## Historial del entorno

- E00: copia aislada `codex/led-designer-e00` desde una instantánea de
  seguimiento con cambios locales (`1562c6e`). Base nueva, migraciones hasta
  `049`, sin datos operativos.
- E01: vista 2D ortográfica de un gabinete; FastAPI/Pydantic. Aceptada.
- E02: modulación rectangular; recuperación original `49d6eeb`.
- 2026-10-02: el diseñador se trasladó a `codex/led-designer` sobre
  seguimiento `v0.4.0`. La base de prueba aplicó la migración `050`.
- 2026-10-02: corrección de E02 (documento `schema_version` 2, resumen
  calculado por el motor, errores por campo, pytest) y Next.js 16.3.8.
