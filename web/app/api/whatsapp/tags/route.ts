import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

/** Lista global de etiquetas con conteo. */
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT min(tag) AS tag, lower(tag) AS key, count(*)::int AS count
         FROM whatsapp_capture.media_tags
        GROUP BY lower(tag)
        ORDER BY count DESC, lower(tag)`
    );
    return jsonOk({ tags: rows });
  } catch (err) {
    return jsonError("No se pudieron leer las etiquetas", 500, String(err));
  }
}

function normalizeTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tag = raw.trim().replace(/\s+/g, " ");
  if (tag.length === 0 || tag.length > 40) return null;
  return tag;
}

/** Renombra una etiqueta en todas las fotos: { from, to }. */
export async function PATCH(request: NextRequest) {
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
    // Colapsa duplicados donde el destino ya existía en el mismo objeto.
    await client.query(
      `DELETE FROM whatsapp_capture.media_tags dst
        WHERE lower(dst.tag) = lower($2)
          AND EXISTS (
            SELECT 1 FROM whatsapp_capture.media_tags src
             WHERE src.sha256 = dst.sha256 AND lower(src.tag) = lower($1)
          )`,
      [from, to]
    );
    const { rowCount } = await client.query(
      `UPDATE whatsapp_capture.media_tags SET tag = $2 WHERE lower(tag) = lower($1)`,
      [from, to]
    );
    await client.query("COMMIT");
    return jsonOk({ renamed: rowCount });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo renombrar la etiqueta", 500, String(err));
  } finally {
    client.release();
  }
}
