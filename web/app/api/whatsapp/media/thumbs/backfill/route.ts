import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";
import { getOrCreateThumbnail } from "@/app/lib/whatsapp-thumbs";

export const runtime = "nodejs";

/**
 * Genera (o completa) las miniaturas 25% de todas las imágenes ya almacenadas.
 * Idempotente: omite las que ya tienen caché en MinIO.
 */
export async function POST() {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT mo.sha256
         FROM whatsapp_capture.media_objects mo
        WHERE mo.state = 'stored' AND mo.content_type LIKE 'image/%'
        ORDER BY mo.sha256`
    );

    let generated = 0;
    let cached = 0;
    let notImage = 0;
    let failed = 0;
    const errors: { sha256: string; error: string }[] = [];

    for (const row of rows as { sha256: string }[]) {
      try {
        const result = await getOrCreateThumbnail(row.sha256);
        if (result.status === "ready") {
          if (result.cached) cached++;
          else generated++;
        } else if (result.status === "not_image") {
          notImage++;
        }
      } catch (err) {
        failed++;
        if (errors.length < 20) errors.push({ sha256: row.sha256, error: String(err) });
      }
    }

    return jsonOk({ total: rows.length, generated, cached, notImage, failed, errors });
  } catch (err) {
    return jsonError("No se pudieron generar las miniaturas", 500, String(err));
  }
}
