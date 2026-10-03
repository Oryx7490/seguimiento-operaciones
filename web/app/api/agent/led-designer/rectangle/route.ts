import { NextRequest } from "next/server";
import { authenticateAgent, unauthorized } from "@/app/lib/agent-auth";
import { forwardToEngine, readJsonBody } from "@/app/lib/led-engine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const identity = await authenticateAgent(req);
  if (!identity) return unauthorized();
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;
  return forwardToEngine("/v1/rectangle", { method: "POST", body: parsed.body });
}
