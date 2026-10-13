import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, getCurrentUserId } from "@/app/lib/api";
import { storageDownloadUrlInBucket, whatsappBucket } from "@/app/lib/storage";

const SHA_RE = /^[0-9a-f]{64}$/;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");

  try {
    const { rows } = await pool.query(
      `SELECT bucket, object_key, content_type FROM whatsapp_capture.media_objects
        WHERE sha256 = $1 AND state = 'stored'`,
      [sha256]
    );
    if (rows.length === 0) return jsonError("Fotografía no encontrada", 404);

    const bucket = rows[0].bucket || whatsappBucket();
    const url = await storageDownloadUrlInBucket(bucket, rows[0].object_key, 5 * 60);
    const src = await fetch(url);
    if (!src.ok) return jsonError("No se pudo descargar la fotografía", 502);

    const bytes = new Uint8Array(await src.arrayBuffer());
    return new Response(bytes, {
      headers: {
        "Content-Type": rows[0].content_type || "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return jsonError("No se pudo servir la fotografía", 500, String(err));
  }
}

/** Campos administrables por contenido: nota, favorito y archivado. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");

  let body: { note?: unknown; is_favorite?: unknown; is_archived?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }

  const sets: string[] = [];
  const vals: unknown[] = [sha256];
  const push = (col: string, val: unknown) => {
    vals.push(val);
    sets.push(`${col} = $${vals.length}`);
  };

  if (body.note !== undefined) {
    if (body.note !== null && typeof body.note !== "string") return jsonError("note inválido");
    const note = typeof body.note === "string" ? body.note.trim() : null;
    if (note && note.length > 2000) return jsonError("note demasiado larga (máx 2000)");
    push("note", note && note.length > 0 ? note : null);
    const uid = await getCurrentUserId();
    push("note_updated_by", uid);
    sets.push("note_updated_at = now()");
  }
  if (body.is_favorite !== undefined) {
    if (typeof body.is_favorite !== "boolean") return jsonError("is_favorite debe ser boolean");
    push("is_favorite", body.is_favorite);
  }
  if (body.is_archived !== undefined) {
    if (typeof body.is_archived !== "boolean") return jsonError("is_archived debe ser boolean");
    push("is_archived", body.is_archived);
  }

  if (sets.length === 0) return jsonError("Nada que actualizar (note, is_favorite o is_archived)");

  try {
    const { rows } = await pool.query(
      `UPDATE whatsapp_capture.media_objects SET ${sets.join(", ")} WHERE sha256 = $1
        RETURNING sha256, note, is_favorite, is_archived, note_updated_at`,
      vals
    );
    if (rows.length === 0) return jsonError("Fotografía no encontrada", 404);
    return jsonOk({ media: rows[0] });
  } catch (err) {
    return jsonError("No se pudo actualizar la fotografía", 500, String(err));
  }
}
