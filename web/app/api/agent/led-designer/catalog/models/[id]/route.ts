import { NextRequest } from "next/server";
import { authenticateAgent, unauthorized } from "@/app/lib/agent-auth";
import { forwardToEngine, readJsonBody } from "@/app/lib/led-engine";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const identity = await authenticateAgent(req);
  if (!identity) return unauthorized();
  const { id } = await params;
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;
  return forwardToEngine(`/v1/catalog/models/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: parsed.body,
  });
}
