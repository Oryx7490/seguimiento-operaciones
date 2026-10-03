import { NextResponse } from "next/server";

export type EngineIssue = { field: string; message: string };

export function engineUrl(): string | null {
  return process.env.LED_ENGINE_URL ?? null;
}

export function engineNotConfigured() {
  return NextResponse.json({ error: "El motor geométrico no está configurado." }, { status: 503 });
}

export function readIssues(data: unknown): EngineIssue[] {
  if (!data || typeof data !== "object" || !("issues" in data) || !Array.isArray(data.issues)) return [];
  return data.issues
    .filter(
      (issue): issue is EngineIssue =>
        !!issue && typeof issue.field === "string" && typeof issue.message === "string",
    )
    .slice(0, 20);
}

/** Reenvía al motor y traduce su respuesta a la API web. Misma forma para UI y agentes. */
export async function forwardToEngine(path: string, init?: { method?: string; body?: unknown }): Promise<NextResponse> {
  const base = engineUrl();
  if (!base) return engineNotConfigured();

  const method = init?.method ?? (init?.body !== undefined ? "POST" : "GET");
  let payload: string | undefined;
  if (init?.body !== undefined) {
    try {
      payload = JSON.stringify(init.body);
    } catch {
      return NextResponse.json({ error: "La solicitud no contiene JSON válido." }, { status: 400 });
    }
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: payload !== undefined ? { "content-type": "application/json" } : undefined,
      body: payload,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
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
  const status = response.status >= 500 || response.status === 0 ? 502 : response.status;
  return NextResponse.json({ error: `El motor respondió con estado ${response.status}.` }, { status });
}

export async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "La solicitud no contiene JSON válido." }, { status: 400 }) };
  }
}
