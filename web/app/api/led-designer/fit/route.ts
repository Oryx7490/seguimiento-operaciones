import { forwardToEngine, readJsonBody } from "@/app/lib/led-engine";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  return forwardToEngine("/v1/fit", { method: "POST", body: parsed.body });
}
