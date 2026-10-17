import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk } from "@/app/lib/api";
import { requireWhatsappBackupManager } from "@/app/lib/whatsapp-backups";
import { deleteStorageObjectInBucket } from "@/app/lib/storage";

export const runtime = "nodejs";
const SHA_RE = /^[0-9a-f]{64}$/;

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const auth = await requireWhatsappBackupManager();
  if (auth.response) return auth.response;
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");

  const client = await pool.connect();
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [sha256]);
    locked = true;
    const { rows } = await client.query(
      `SELECT archive_sha256, bucket, object_key, size_bytes, state
         FROM whatsapp_capture.export_archives WHERE archive_sha256 = $1`,
      [sha256]
    );
    if (!rows[0]) return jsonError("Respaldo no encontrado", 404);
    if (rows[0].state === "deleted") return jsonOk({ deleted: true, freed_bytes: 0, message: "El ZIP ya estaba eliminado." });
    const active = await client.query(
      `SELECT 1 FROM whatsapp_capture.export_archive_uploads
        WHERE archive_sha256 = $1 AND status = 'importing' LIMIT 1`,
      [sha256]
    );
    if (active.rowCount) return jsonError("El respaldo está procesándose; inténtalo de nuevo cuando termine", 409);

    await deleteStorageObjectInBucket(rows[0].bucket, rows[0].object_key);
    await client.query(
      `UPDATE whatsapp_capture.export_archives
          SET state = 'deleted', deleted_at = now(), updated_at = now()
        WHERE archive_sha256 = $1`,
      [sha256]
    );
    return jsonOk({ deleted: true, freed_bytes: Number(rows[0].size_bytes), message: "ZIP eliminado de MinIO; los mensajes y multimedia importados se conservaron." });
  } catch (err) {
    return jsonError("No se pudo eliminar el respaldo ZIP", 500, String(err));
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [sha256]).catch(() => {});
    client.release();
  }
}
