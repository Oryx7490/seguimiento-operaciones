import { NextRequest } from "next/server";
import { jsonOk } from "@/app/lib/api";
import { authenticateAgent, unauthorized } from "@/app/lib/agent-auth";

export async function GET(request: NextRequest) {
  const identity = await authenticateAgent(request);
  if (!identity) return unauthorized();

  return jsonOk({
    resource: "whatsapp",
    access: "read-only",
    scope: "mensajes entrantes y fotografías de conversaciones grupales capturadas",
    authentication: "Authorization: Bearer <token de agente>",
    endpoints: [
      {
        method: "GET",
        path: "/api/agent/whatsapp/messages",
        description: "Lista mensajes entrantes con texto, remitente y adjuntos.",
        query: ["q", "sender", "conversation_id", "after", "before", "limit", "offset"],
      },
      {
        method: "GET",
        path: "/api/agent/whatsapp/photos",
        description: "Lista fotografías almacenadas con caption y ruta de descarga.",
        query: ["q", "sender", "conversation_id", "after", "before", "limit", "offset"],
      },
      {
        method: "GET",
        path: "/api/agent/whatsapp/photos/{sha256}",
        description: "Descarga una fotografía del grupo.",
      },
    ],
    conventions: {
      dates: "after y before aceptan fechas ISO 8601 con zona horaria; before es exclusivo.",
      pagination: "limit predeterminado 50, máximo 200; offset predeterminado 0.",
      conversation_id: "UUID devuelto en cada mensaje y fotografía.",
    },
  });
}
