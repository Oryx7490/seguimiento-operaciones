import { NextRequest } from "next/server";
import { jsonError } from "@/app/lib/api";
import { getOrCreateThumbnail } from "@/app/lib/whatsapp-thumbs";

export const runtime = "nodejs";

const SHA_RE = /^[0-9a-f]{64}$/;

function imageResponse(bytes: Buffer, cacheSeconds: number): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": `private, max-age=${cacheSeconds}`,
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");

  try {
    const result = await getOrCreateThumbnail(sha256);
    if (result.status === "not_found") return jsonError("Fotografía no encontrada", 404);
    if (result.status === "not_image") return jsonError("La miniatura solo aplica a imágenes", 415);
    return imageResponse(result.buffer, result.cached ? 60 * 60 * 24 * 7 : 60 * 60);
  } catch (err) {
    return jsonError("No se pudo generar la miniatura", 500, String(err));
  }
}
