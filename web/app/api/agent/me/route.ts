import { NextRequest } from "next/server";
import { jsonOk } from "@/app/lib/api";
import { authenticateAgent, unauthorized } from "@/app/lib/agent-auth";

export async function GET(req: NextRequest) {
  const identity = await authenticateAgent(req);
  if (!identity) return unauthorized();
  return jsonOk({
    agent: { token_id: identity.tokenId, token_name: identity.tokenName, actor_id: identity.actorId },
  });
}
