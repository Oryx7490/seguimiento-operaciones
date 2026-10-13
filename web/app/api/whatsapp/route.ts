import { jsonOk } from "@/app/lib/api";

/**
 * Índice del API de Fotos de WhatsApp.
 *
 * Las imágenes y demás archivos provienen del plugin `whatsapp-capture`
 * (MinIO `whatsapp-media` + esquema `whatsapp_capture`). Todas las etiquetas y
 * campos administrables se guardan por SHA-256 del binario, así que aplican a
 * reenvíos del mismo archivo.
 */
export async function GET() {
  return jsonOk({
    resource: "whatsapp",
    description: "Lectura, etiquetado y administración de los archivos capturados del grupo de WhatsApp.",
    conventions: {
      media_id: "El identificador canónico de un archivo es su SHA-256 (64 hex).",
      dates: "Filtros de fecha en formato YYYY-MM-DD, zona America/Mexico_City.",
      kinds: ["image", "video", "audio", "document", "sticker", "other"],
      faces: "Detección/embeddings con insightface (ArcFace 512d) vía face-service; identidades enlazadas a técnicos/usuarios.",
      ocr: "Texto extraído con Tesseract (español+inglés) vía face-service; el campo 'parsed' propone candidatos de asistencia (fecha/hora/tipo/jornada/ubicación).",
    },
    endpoints: [
      { method: "GET", path: "/api/whatsapp", description: "Este índice." },
      {
        method: "GET",
        path: "/api/whatsapp/media",
        description: "Lista archivos. Filtros: from, to, sender, conversation, tag, q, kind, favorite, archived, limit, offset.",
      },
      { method: "GET", path: "/api/whatsapp/media/{sha256}", description: "Sirve el binario original." },
      { method: "GET", path: "/api/whatsapp/media/{sha256}/thumb", description: "Miniatura al 25% (JPEG, cacheada)." },
      { method: "GET", path: "/api/whatsapp/media/{sha256}/info", description: "Detalle JSON: metadatos, etiquetas, apariciones, vínculos y análisis." },
      {
        method: "PATCH",
        path: "/api/whatsapp/media/{sha256}",
        description: "Actualiza campos administrables: note, is_favorite, is_archived.",
      },
      { method: "GET", path: "/api/whatsapp/media/{sha256}/tags", description: "Etiquetas de la foto." },
      { method: "POST", path: "/api/whatsapp/media/{sha256}/tags", description: "Agrega una etiqueta ({ tag })." },
      { method: "PATCH", path: "/api/whatsapp/media/{sha256}/tags", description: "Renombra una etiqueta en esa foto ({ from, to })." },
      { method: "DELETE", path: "/api/whatsapp/media/{sha256}/tags?tag=", description: "Quita una etiqueta de la foto." },
      { method: "GET", path: "/api/whatsapp/tags", description: "Etiquetas globales con conteo." },
      { method: "PATCH", path: "/api/whatsapp/tags", description: "Renombra una etiqueta en todas las fotos ({ from, to })." },
      { method: "GET", path: "/api/whatsapp/media/{sha256}/links", description: "Vínculos de la foto (proyecto/ticket/actividad/técnico)." },
      { method: "POST", path: "/api/whatsapp/media/{sha256}/links", description: "Crea un vínculo ({ type, id, message_id? })." },
      { method: "DELETE", path: "/api/whatsapp/media/{sha256}/links?id=", description: "Elimina un vínculo." },
      { method: "GET", path: "/api/whatsapp/filters", description: "Remitentes, etiquetas, conversaciones y estadísticas." },
      { method: "GET", path: "/api/whatsapp/media/{sha256}/faces", description: "Rostros detectados en la foto (bbox, score, identidad asignada)." },
      { method: "GET", path: "/api/whatsapp/media/{sha256}/ocr", description: "Texto extraído por OCR y candidato de asistencia (fecha/hora/tipo/jornada/ubicación)." },
      { method: "POST", path: "/api/whatsapp/faces/{id}/assign", description: "Asigna el rostro a un técnico o usuario ({ technician_id | user_id | display_name })." },
      { method: "DELETE", path: "/api/whatsapp/faces/{id}/assign", description: "Quita la asignación del rostro." },
      { method: "GET", path: "/api/whatsapp/face-identities", description: "Identidades faciales enroladas con conteo de caras." },
      { method: "GET", path: "/api/whatsapp/conversations", description: "Conversaciones (grupos/chats) con conteos." },
      { method: "GET", path: "/api/whatsapp/conversations/{id}/messages", description: "Mensajes de una conversación (texto + adjuntos)." },
      { method: "POST", path: "/api/whatsapp/media/thumbs/backfill", description: "Genera las miniaturas faltantes (idempotente)." },
    ],
  });
}
