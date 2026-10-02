# Seguimiento aislado para el diseñador LED

La rama `codex/led-designer-e00` es una copia local de trabajo independiente.
La configuración de desarrollo usa el proyecto Compose `led-designer-dev` y
lee credenciales propias de `.env.local` (ignorado por Git).

## Ver en el navegador

Abrir [http://100.68.83.67:18080/disenador](http://100.68.83.67:18080/disenador)
desde un equipo conectado a la misma red Tailscale. La RC es la versión `0.0.1`.
E02 presenta una retícula rectangular inicial de 4 × 3 gabinetes sintéticos;
puedes cambiar filas y columnas y consultar medidas, área y listado.

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

Para detener los contenedores sin borrar el almacenamiento local:

```bash
docker compose --env-file .env.local -p led-designer-dev \
  -f compose.yaml -f compose.led-dev.yaml stop
```

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

## Punto de partida

- Rama Git: `codex/led-designer-e00`.
- Punto inicial recuperable: `1562c6e`.
- Ese commit conserva el código rastreado y los cambios locales que ya estaban
  en seguimiento al iniciar el trabajo. No contiene `.env.local`.
- Base de desarrollo: migraciones hasta `049`, 46 migraciones aplicadas,
  cero proyectos. No se importó una base ni un respaldo operativo.
- Diseñador LED: E01 fue aceptada. E02 añade la pantalla rectangular
  parametrizable, listado y cálculo de área. El modelo sigue siendo sintético;
  todavía no es un gabinete comercial ni admite edición pieza por pieza.
- Punto de recuperación de E02: `49d6eeb`.

## Resultado de la comprobación E00

- Compilación de la imagen web: correcta con los cambios locales capturados.
- Solicitud HTTP local a `/` desde el contenedor web: 200.
- Solicitud HTTP a `/api/projects` desde el contenedor web: 200, `projects: []`.
- PostgreSQL y MinIO de desarrollo: saludables; almacenamiento independiente.
- Compose revisado: puertos de desarrollo separados; no monta volúmenes
  PostgreSQL, MinIO, Node o compilación de la instalación existente.
- npm informó cinco avisos de seguridad de dependencias (cuatro moderados y
  uno crítico). Se deja para una tarea específica de mantenimiento, fuera de E00.

E00 quedó validada al continuar el usuario con la etapa E01.

## Resultado de E01

- Vista 2D ortográfica basada en el documento servido por FastAPI/Pydantic.
- Gabinete sintético de 960 × 960 mm, área de 0.9216 m².
- Next build, ESLint, ruta HTTP 200 y rechazo de datos inválidos con HTTP 422.
- Punto de recuperación E01: `5fa2268`.

## Comprobaciones E02

- Motor Python: 4 × 3 → 12 gabinetes, 3840 × 2880 mm, 11.0592 m².
- Motor Python: 16 × 12 → 192 gabinetes, 15360 × 11520 mm, 176.9472 m².
- Entradas fuera de límite y campos desconocidos: HTTP 422.
- Build Next y ESLint correctos; la revisión del usuario está pendiente.
