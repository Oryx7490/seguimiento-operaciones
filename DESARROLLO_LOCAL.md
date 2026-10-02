# Seguimiento aislado para el diseñador LED

La rama `codex/led-designer-e00` es una copia local de trabajo independiente.
La configuración de desarrollo usa el proyecto Compose `led-designer-dev` y
lee credenciales propias de `.env.local` (ignorado por Git).

## Ver en el navegador

Abrir [http://127.0.0.1:18080](http://127.0.0.1:18080). Es una copia de
Seguimiento lista para ser usada durante la implementación del diseñador LED.
Los primeros dibujos LED aparecerán en la etapa E01.

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
| Seguimiento web | `127.0.0.1:18080` |
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
- Diseño LED: todavía no existe código de implementación. La etapa E01 añadirá
  el primer dibujo interactivo de un gabinete en 2D.

## Resultado de la comprobación E00

- Compilación de la imagen web: correcta con los cambios locales capturados.
- Solicitud HTTP local a `/` desde el contenedor web: 200.
- Solicitud HTTP a `/api/projects` desde el contenedor web: 200, `projects: []`.
- PostgreSQL y MinIO de desarrollo: saludables; almacenamiento independiente.
- Compose revisado: puertos de desarrollo separados; no monta volúmenes
  PostgreSQL, MinIO, Node o compilación de la instalación existente.
- npm informó cinco avisos de seguridad de dependencias (cuatro moderados y
  uno crítico). Se deja para una tarea específica de mantenimiento, fuera de E00.

El usuario debe abrir la dirección local, recorrer la página inicial y confirmar
que puede continuar. Hasta entonces, E00 permanece «lista para probar».
