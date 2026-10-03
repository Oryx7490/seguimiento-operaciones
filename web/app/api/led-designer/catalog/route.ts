import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function engineBase() {
  return process.env.LED_ENGINE_URL ?? null;
}

export async function GET() {
  const engineUrl = engineBase();
  if (!engineUrl) {
    return NextResponse.json({ error: "El motor geométrico no está configurado." }, { status: 503 });
  }
  try {
    const response = await fetch(`${engineUrl}/v1/catalog`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const data: unknown = await response.json().catch(() => null);
    if (response.ok && data) return NextResponse.json(data);
    return NextResponse.json(
      { error: `El motor respondió con estado ${response.status}.` },
      { status: 502 },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo conectar con el motor geométrico. Intenta de nuevo." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const engineUrl = engineBase();
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
    response = await fetch(`${engineUrl}/v1/catalog/models`, {
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
    const issues =
      data && typeof data === "object" && "issues" in data && Array.isArray(data.issues)
        ? data.issues.filter(
            (issue): issue is { field: string; message: string } =>
              !!issue && typeof issue.field === "string" && typeof issue.message === "string",
          )
        : [];
    return NextResponse.json({ error: "Datos no válidos.", issues: issues.slice(0, 20) }, { status: 422 });
  }
  return NextResponse.json(
    { error: `El motor respondió con estado ${response.status}.` },
    { status: 502 },
  );
}
