import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, getCurrentUserId } from "@/app/lib/api";

const SHA_RE = /^[0-9a-f]{64}$/;

function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tag = raw.trim().replace(/\s+/g, " ");
  if (tag.length === 0 || tag.length > 40) return null;
  return tag;
}

async function listTags(sha256: string): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT tag FROM whatsapp_capture.media_tags WHERE sha256 = $1 ORDER BY lower(tag)`,
    [sha256]
  );
  return rows.map((r) => r.tag);
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");
  try {
    return jsonOk({ tags: await listTags(sha256) });
  } catch (err) {
    return jsonError("No se pudieron leer las etiquetas", 500, String(err));
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");

  let body: { tag?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }
  const tag = normalizeTag(body.tag);
  if (!tag) return jsonError("Etiqueta inválida (1 a 40 caracteres)");

  try {
    const exists = await pool.query(`SELECT 1 FROM whatsapp_capture.media_objects WHERE sha256 = $1`, [sha256]);
    if (exists.rowCount === 0) return jsonError("Fotografía no encontrada", 404);

    const uid = await getCurrentUserId();
    await pool.query(
      `INSERT INTO whatsapp_capture.media_tags (sha256, tag, source, created_by)
       VALUES ($1, $2, 'manual', $3)
       ON CONFLICT (sha256, lower(tag)) DO NOTHING`,
      [sha256, tag, uid]
    );
    const { rows } = await pool.query(
      `SELECT tag FROM whatsapp_capture.media_tags WHERE sha256 = $1 ORDER BY lower(tag)`,
      [sha256]
    );
    return jsonOk({ tags: rows.map((r) => r.tag) });
  } catch (err) {
    return jsonError("No se pudo agregar la etiqueta", 500, String(err));
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");

  const tag = normalizeTag(request.nextUrl.searchParams.get("tag"));
  if (!tag) return jsonError("Etiqueta inválida");

  try {
    await pool.query(`DELETE FROM whatsapp_capture.media_tags WHERE sha256 = $1 AND lower(tag) = lower($2)`, [sha256, tag]);
    const { rows } = await pool.query(
      `SELECT tag FROM whatsapp_capture.media_tags WHERE sha256 = $1 ORDER BY lower(tag)`,
      [sha256]
    );
    return jsonOk({ tags: rows.map((r) => r.tag) });
  } catch (err) {
    return jsonError("No se pudo eliminar la etiqueta", 500, String(err));
  }
}

/** Renombra una etiqueta en esta foto: { from, to }. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");

  let body: { from?: unknown; to?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }
  const from = normalizeTag(body.from);
  const to = normalizeTag(body.to);
  if (!from || !to) return jsonError("Etiquetas inválidas (1 a 40 caracteres)");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query(
      `SELECT 1 FROM whatsapp_capture.media_tags WHERE sha256 = $1 AND lower(tag) = lower($2)`,
      [sha256, to]
    );
    if (target.rowCount && target.rowCount > 0) {
      // El destino ya existe: se colapsa en una sola etiqueta.
      await client.query(`DELETE FROM whatsapp_capture.media_tags WHERE sha256 = $1 AND lower(tag) = lower($2)`, [sha256, from]);
    } else {
      await client.query(
        `UPDATE whatsapp_capture.media_tags SET tag = $2 WHERE sha256 = $1 AND lower(tag) = lower($3)`,
        [sha256, to, from]
      );
    }
    await client.query("COMMIT");
    return jsonOk({ tags: await listTags(sha256) });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo renombrar la etiqueta", 500, String(err));
  } finally {
    client.release();
  }
}
