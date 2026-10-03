import { forwardToEngine, readJsonBody } from "@/app/lib/led-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  return forwardToEngine("/v1/catalog", { method: "GET" });
}

export async function POST(request: Request) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  return forwardToEngine("/v1/catalog/models", { method: "POST", body: parsed.body });
}
