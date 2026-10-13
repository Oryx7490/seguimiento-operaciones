import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError } from "@/app/lib/api";
import { authenticateAgent, unauthorized } from "@/app/lib/agent-auth";
import { storageDownloadUrlInBucket, whatsappBucket } from "@/app/lib/storage";

export const runtime = "nodejs";

const SHA_RE = /^[0-9a-f]{64}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sha256: string }> }
) {
  const identity = await authenticateAgent(request);
  if (!identity) return unauthorized();

  const { sha256: rawSha } = await params;
  const sha256 = rawSha.toLowerCase();
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");

  try {
    const { rows } = await pool.query(
      `SELECT mo.bucket, mo.object_key, mo.content_type
         FROM whatsapp_capture.media_objects mo
        WHERE mo.sha256 = $1 AND mo.state = 'stored'
          AND EXISTS (
            SELECT 1
              FROM whatsapp_capture.message_media mm
              JOIN whatsapp_capture.messages m ON m.id = mm.message_id
              JOIN whatsapp_capture.conversations c ON c.id = m.conversation_id
             WHERE mm.sha256 = mo.sha256
               AND mm.media_kind = 'image'
               AND mm.state = 'stored'
               AND m.direction = 'inbound'
               AND c.is_group = true
          )`,
      [sha256]
    );
    if (rows.length === 0) return jsonError("Fotografía no encontrada", 404);

    const bucket = rows[0].bucket || whatsappBucket();
    const url = await storageDownloadUrlInBucket(bucket, rows[0].object_key, 5 * 60);
    const source = await fetch(url);
    if (!source.ok) return jsonError("No se pudo descargar la fotografía", 502);

    const bytes = new Uint8Array(await source.arrayBuffer());
    const contentType = typeof rows[0].content_type === "string"
      && /^image\/[a-z0-9.+-]+$/i.test(rows[0].content_type)
      ? rows[0].content_type
      : "image/jpeg";
    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return jsonError("No se pudo servir la fotografía", 500);
  }
}
