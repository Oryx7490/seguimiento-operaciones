import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId } from "@/app/lib/api";
import { deleteStorageObject, storageDownloadUrl } from "@/app/lib/storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `SELECT storage_key, file_name, mime_type FROM technician_documents WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) return jsonError("documento no encontrado", 404);
    const url = await storageDownloadUrl(rows[0].storage_key);
    const src = await fetch(url);
    if (!src.ok) return jsonError("No se pudo descargar el archivo", 502);
    const bytes = new Uint8Array(await src.arrayBuffer());
    const safe = rows[0].file_name.replace(/[\r\n"]/g, "_");
    return new Response(bytes, {
      headers: {
        "Content-Type": rows[0].mime_type || "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${safe}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return jsonError("No se pudo generar la descarga", 500, String(err));
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `SELECT storage_key FROM technician_documents WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) return jsonError("documento no encontrado", 404);
    await pool.query(`DELETE FROM technician_documents WHERE id = $1`, [id]);
    try {
      await deleteStorageObject(rows[0].storage_key);
    } catch {
      /* el objeto pudo no existir; el registro ya se eliminó */
    }
    return jsonOk({ deleted: id });
  } catch (err) {
    return jsonError("No se pudo eliminar el documento", 500, String(err));
  }
}
