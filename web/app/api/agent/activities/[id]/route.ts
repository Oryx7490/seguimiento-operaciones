import { NextRequest } from "next/server";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";
import { authenticateAgent, agentReason, unauthorized } from "@/app/lib/agent-auth";
import { updateActivityStatus } from "@/app/lib/services/activities";
import { ServiceError } from "@/app/lib/services/errors";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const identity = await authenticateAgent(req);
  if (!identity) return unauthorized();

  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  if (!body.status) return jsonError("status es obligatorio");

  try {
    const activity = await updateActivityStatus(
      id,
      body.status,
      identity.actorId,
      agentReason(identity, "Estado de actividad actualizado")
    );
    return jsonOk({ activity });
  } catch (err) {
    if (err instanceof ServiceError) return jsonError(err.message, err.status);
    return jsonError("No se pudo actualizar la actividad", 500, String(err));
  }
}
