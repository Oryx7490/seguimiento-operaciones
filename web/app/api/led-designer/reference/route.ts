import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const engineUrl = process.env.LED_ENGINE_URL;
  if (!engineUrl) {
    return NextResponse.json(
      { error: "El motor geométrico no está configurado." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(`${engineUrl}/v1/reference`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `El motor respondió con estado ${response.status}.` },
        { status: 502 },
      );
    }
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json(
      { error: "No se pudo conectar con el motor geométrico. Intenta recargar." },
      { status: 503 },
    );
  }
}
