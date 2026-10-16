import { NextRequest } from "next/server";
import { jsonOk } from "@/app/lib/api";
import { authenticateAgent, unauthorized } from "@/app/lib/agent-auth";

export async function GET(request: NextRequest) {
  const identity = await authenticateAgent(request);
  if (!identity) return unauthorized();

  return jsonOk({
    resource: "whatsapp",
    access: "read-only",
    scope: "mensajes y fotografías de conversaciones grupales capturadas o importadas de respaldos",
    authentication: "Authorization: Bearer <token de agente>",
    endpoints: [
      {
        method: "GET",
        path: "/api/agent/whatsapp/messages",
        description: "Lista mensajes con texto, remitente, participante identificado y adjuntos; los medios ausentes se identifican con state=unavailable.",
        query: ["q", "sender", "conversation_id", "participant_id", "user_id", "technician_id", "direction", "after", "before", "limit", "offset"],
      },
      {
        method: "GET",
        path: "/api/agent/whatsapp/participants",
        description: "Consulta identidades vinculadas a usuario/técnico y remitentes aún no identificados, incluidos externos y exintegrantes.",
        query: ["q", "user_id", "technician_id", "include_unresolved", "limit", "offset"],
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
      direction: "inbound es el valor predeterminado; acepta outbound o all para incluir mensajes enviados.",
      conversation_id: "UUID devuelto en cada mensaje y fotografía.",
      participant_id: "UUID del perfil de participante, disponible cuando un alias verificado coincide sin ambigüedad.",
      user_id: "Filtra participantes/mensajes asociados a una cuenta de RGB-Gantt.",
      technician_id: "Filtra participantes/mensajes asociados a un registro de técnico.",
      unresolved_senders: "Identidades agregadas desde mensajes de grupos que todavía no tienen un perfil confirmado.",
      participant_management: "El alta y la modificación de perfiles y alias se hacen con sesión de RGB-Gantt y rol admin/coordinator en /api/whatsapp/participants.",
    },
  });
}
