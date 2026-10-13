# Captura de WhatsApp en PostgreSQL y MinIO

El plugin de OpenClaw guarda texto y metadatos de mensajes permitidos en el esquema
`whatsapp_capture`. Los adjuntos recibidos se guardan una sola vez en el bucket
`whatsapp-media`, usando `sha256/<primeros-dos-caracteres>/<sha256>` como clave. Cada
mensaje conserva su propia relación con el objeto, por lo que reenviar la misma foto,
video o documento no crea otra copia binaria.

## Persistencia

- `conversations` y `messages` guardan la identidad del chat, remitente, dirección,
  texto, hora y los IDs del proveedor. El índice único hace idempotente la recepción.
- `media_objects` tiene una fila por SHA-256 y referencia al objeto MinIO.
- `message_media` conserva cada aparición del archivo y su posición en el mensaje.
- `media_analyses` guarda resultados versionados de OCR/reconocimiento para procesar
  archivos en segundo plano.
- `message_entity_links` permite vincular mensajes/archivos a proyectos, tickets,
  actividades y técnicos, con confianza y revisión humana.
- `technician_contacts` prepara el mapeo verificado entre remitentes de WhatsApp y
  técnicos del sistema.

El plugin transmite archivos como streams; no los carga completos en memoria. Solo lee
rutas locales que OpenClaw entrega como medios ya preparados y que permanecen dentro de
`~/.openclaw` o del `workspaceDir` de ese medio. Cuando el archivo aún no está preparado,
registra el adjunto como pendiente y no intenta descargar una URL remota.

En el grupo de lectura continua, `message_received` guarda el texto o caption y procesa
los adjuntos; las imágenes recibidas se transmiten a MinIO y quedan vinculadas al mensaje
en PostgreSQL. `before_dispatch` identifica el grupo permitido también por su `sessionKey`
y atiende el evento sin iniciar un turno del modelo ni enviar una respuesta. Ese segundo
hook no expone los binarios, así que el almacenamiento de imágenes depende de
`message_received`. Si la escritura previa a la distribución falla, el plugin registra el
error y aun así evita que el mensaje del grupo llegue al modelo; el hook de captura de
mensajes sigue siendo el responsable de guardar texto y archivos.

## Activación intencional

El plugin no captura nada si `allowedChats` está vacío o si `captureInbound`/
`captureOutbound` no está en `true`. Para mensajes entrantes, WhatsApp también requiere
habilitar el hook de plugins para la cuenta correspondiente:

```json5
channels: {
  whatsapp: {
    groups: {
      "ID_DE_CHAT_PERMITIDO": { requireMention: false },
    },
    accounts: {
      default: {
        pluginHooks: { messageReceived: true },
      },
    },
  },
},
plugins: {
  entries: {
    "whatsapp-capture": {
      enabled: true,
      config: {
        allowedChats: ["ID_DE_CHAT_PERMITIDO"],
        captureInbound: true,
        captureOutbound: false,
      },
    },
  },
},
```

Los IDs permitidos se comparan por JID después de quitar el prefijo opcional `whatsapp:`;
no se aceptan comodines. `requireMention: false` debe configurarse solo en el grupo que
se quiere capturar continuamente. Mantener `allowedChats` limitada a ese JID evita guardar
otros chats.

## Variables privadas del servicio

El Gateway necesita estas variables en un `EnvironmentFile` de systemd con permisos
`0600`; no se guardan en `openclaw.json` ni en este repositorio:

```text
WA_CAPTURE_DATABASE_URL=postgresql://whatsapp_capture_app:...@127.0.0.1:5433/seguimiento_operaciones
WA_CAPTURE_MINIO_ENDPOINT=127.0.0.1:9010
WA_CAPTURE_MINIO_ACCESS_KEY=...
WA_CAPTURE_MINIO_SECRET_KEY=...
WA_CAPTURE_MINIO_BUCKET=whatsapp-media
```

El login `whatsapp_capture_app` hereda del rol `whatsapp_capture_writer`, que solo
recibe `SELECT`, `INSERT` y `UPDATE` en este esquema. La identidad S3 debe limitarse al
bucket `whatsapp-media` y al prefijo `sha256/`. La política mínima de ejemplo está en
`whatsapp-media-policy.json`.

## Respaldo

`db/backup/backup.sh` genera el dump de PostgreSQL y un espejo independiente del bucket
`whatsapp-media`. `restore.sh` restaura ambos directorios cuando pertenecen al mismo
sello de tiempo; también conserva compatibilidad con respaldos anteriores del bucket
principal.
