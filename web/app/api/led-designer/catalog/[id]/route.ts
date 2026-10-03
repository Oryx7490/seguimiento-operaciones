import { forwardToEngine, readJsonBody } from "@/app/lib/led-engine";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  return forwardToEngine(`/v1/catalog/models/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: parsed.body,
  });
}
