import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const engineUrl = process.env.LED_ENGINE_URL;
  if (!engineUrl) {
    return NextResponse.json(
      { error: "El motor geométrico no está configurado." },
      { status: 503 },
    );
  }

  try {
    const body: unknown = await request.json();
    const response = await fetch(`${engineUrl}/v1/rectangle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            response.status === 422
              ? "Filas y columnas deben ser números enteros de 1 a 20; el diseño admite hasta 400 gabinetes."
              : `El motor respondió con estado ${response.status}.`,
        },
        { status: response.status },
      );
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "No se pudo conectar con el motor geométrico. Intenta de nuevo." },
      { status: 503 },
    );
  }
}
