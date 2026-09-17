import { NextRequest } from "next/server";
import { jsonOk, jsonError } from "@/app/lib/api";
import { authenticateAgent, agentReason, unauthorized } from "@/app/lib/agent-auth";
import { createTicket, type CreateTicketInput } from "@/app/lib/services/tickets";
import { ServiceError } from "@/app/lib/services/errors";

export async function POST(req: NextRequest) {
  const identity = await authenticateAgent(req);
  if (!identity) return unauthorized();

  let body: CreateTicketInput;
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  try {
    const ticket = await createTicket(body, identity.actorId, agentReason(identity, "Ticket creado"));
    return jsonOk({ ticket }, 201);
  } catch (err) {
    if (err instanceof ServiceError) return jsonError(err.message, err.status);
    return jsonError("No se pudo crear el ticket", 500, String(err));
  }
}
