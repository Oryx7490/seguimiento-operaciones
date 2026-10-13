import sharp from "sharp";
import pool from "@/app/lib/db";
import {
  storageBucket,
  storageObjectExists,
  putStorageObject,
  getStorageObjectBuffer,
  storageDownloadUrlInBucket,
  whatsappBucket,
} from "@/app/lib/storage";

/** Fracción del tamaño original que conserva la miniatura. */
export const THUMB_RATIO = 0.25;

export function thumbnailKey(sha256: string): string {
  return `whatsapp-thumbs/25/${sha256}.jpg`;
}

export type ThumbResult =
  | { status: "ready"; buffer: Buffer; cached: boolean }
  | { status: "not_found" }
  | { status: "not_image" };

/**
 * Devuelve la miniatura (25% del ancho/alto original) desde la caché o la genera
 * con sharp y la guarda en MinIO. Idempotente: si ya existe, no reprocesa.
 */
export async function getOrCreateThumbnail(sha256: string, opts: { force?: boolean } = {}): Promise<ThumbResult> {
  const key = thumbnailKey(sha256);

  if (!opts.force && (await storageObjectExists(key))) {
    const buffer = await getStorageObjectBuffer(storageBucket(), key);
    return { status: "ready", buffer, cached: true };
  }

  const { rows } = await pool.query(
    `SELECT bucket, object_key, content_type FROM whatsapp_capture.media_objects
      WHERE sha256 = $1 AND state = 'stored'`,
    [sha256]
  );
  if (rows.length === 0) return { status: "not_found" };
  if (rows[0].content_type && !String(rows[0].content_type).startsWith("image/")) return { status: "not_image" };

  const bucket = rows[0].bucket || whatsappBucket();
  const url = await storageDownloadUrlInBucket(bucket, rows[0].object_key, 5 * 60);
  const src = await fetch(url);
  if (!src.ok) throw new Error("No se pudo descargar la fotografía");
  const original = Buffer.from(await src.arrayBuffer());

  const meta = await sharp(original).metadata();
  if (!meta.width || !meta.height) return { status: "not_image" };
  const width = Math.max(1, Math.round(meta.width * THUMB_RATIO));
  const height = Math.max(1, Math.round(meta.height * THUMB_RATIO));

  const buffer = await sharp(original)
    .resize(width, height, { fit: "inside" })
    .jpeg({ quality: 80, progressive: true })
    .toBuffer();

  await putStorageObject(key, buffer, "image/jpeg");
  return { status: "ready", buffer, cached: false };
}
