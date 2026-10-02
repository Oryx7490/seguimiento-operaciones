import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type EngineIssue = { field: string; message: string };

function readIssues(data: unknown): EngineIssue[] {
  if (!data || typeof data !== "object" || !("issues" in data) || !Array.isArray(data.issues)) return [];
  return data.issues
    .filter(
      (issue): issue is EngineIssue =>
        !!issue && typeof issue.field === "string" && typeof issue.message === "string",
    )
    .slice(0, 20);
}

export async function POST(request: Request) {
  const engineUrl = process.env.LED_ENGINE_URL;
  if (!engineUrl) {
    return NextResponse.json({ error: "El motor geométrico no está configurado." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "La solicitud no contiene JSON válido." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(`${engineUrl}/v1/rectangle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo conectar con el motor geométrico. Intenta de nuevo." },
      { status: 503 },
    );
  }

  const data: unknown = await response.json().catch(() => null);
  if (response.ok && data) return NextResponse.json(data);

  if (response.status === 422) {
    // El motor ya devuelve mensajes en español por campo; se transmiten tal cual.
    return NextResponse.json({ error: "Datos no válidos.", issues: readIssues(data) }, { status: 422 });
  }
  return NextResponse.json(
    { error: `El motor respondió con estado ${response.status}.` },
    { status: 502 },
  );
}
