import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId } from "@/app/lib/api";
import { requireWhatsappBackupManager } from "@/app/lib/whatsapp-backups";
import {
  putStorageFileInBucket,
  storageObjectExistsInBucket,
  whatsappBackupBucket,
} from "@/app/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 900;

const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const RETENTION_DAYS = 7;
const DEFAULT_TIMEZONE = "America/Mexico_City";
const execFileAsync = promisify(execFile);

async function fileSha256(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function safeFilename(value: string) {
  const base = path.basename(value).replace(/[^a-zA-Z0-9._ ()-]/g, "_").slice(0, 240);
  return base.toLowerCase().endsWith(".zip") ? base : `${base || "respaldo"}.zip`;
}

async function hasZipSignature(filePath: string) {
  const handle = await open(filePath, "r");
  try {
    const head = Buffer.alloc(4);
    const { bytesRead } = await handle.read(head, 0, 4, 0);
    if (bytesRead < 4) return false;
    return head[0] === 0x50 && head[1] === 0x4b &&
      ((head[2] === 0x03 && head[3] === 0x04) ||
        (head[2] === 0x05 && head[3] === 0x06) ||
        (head[2] === 0x07 && head[3] === 0x08));
  } finally {
    await handle.close();
  }
}

export async function GET() {
  const auth = await requireWhatsappBackupManager();
  if (auth.response) return auth.response;
  try {
    const [archives, usage] = await Promise.all([
      pool.query(
        `SELECT a.archive_sha256, a.source_filename, a.size_bytes, a.state,
                a.deletion_eligible, a.retention_until, a.created_at, a.updated_at, a.deleted_at,
                COALESCE(upload_stats.upload_count, 0)::int AS upload_count,
                COALESCE(upload_stats.group_names, ARRAY[]::text[]) AS group_names,
                COALESCE(upload_stats.uploader_names, ARRAY[]::text[]) AS uploader_names,
                latest.status AS latest_upload_status,
                latest.error_message AS latest_error,
                latest.uploaded_at AS latest_uploaded_at,
                latest.group_name AS latest_group_name,
                latest.uploader_name AS latest_uploader_name
           FROM whatsapp_capture.export_archives a
           LEFT JOIN LATERAL (
             SELECT count(*)::int AS upload_count,
                    array_remove(array_agg(DISTINCT c.display_name), NULL) AS group_names,
                    array_remove(array_agg(DISTINCT u.name), NULL) AS uploader_names
               FROM whatsapp_capture.export_archive_uploads x
               JOIN whatsapp_capture.conversations c ON c.id = x.conversation_id
               LEFT JOIN users u ON u.id = x.uploaded_by
              WHERE x.archive_sha256 = a.archive_sha256
           ) upload_stats ON true
           LEFT JOIN LATERAL (
             SELECT x.status, x.error_message, x.uploaded_at, c.display_name AS group_name, u.name AS uploader_name
               FROM whatsapp_capture.export_archive_uploads x
               JOIN whatsapp_capture.conversations c ON c.id = x.conversation_id
               LEFT JOIN users u ON u.id = x.uploaded_by
              WHERE x.archive_sha256 = a.archive_sha256
              ORDER BY x.uploaded_at DESC, x.id DESC
              LIMIT 1
           ) latest ON true
          ORDER BY a.updated_at DESC
          LIMIT 100`
      ),
      pool.query(
        `SELECT count(*)::int AS count, COALESCE(sum(size_bytes), 0)::bigint AS size_bytes
           FROM whatsapp_capture.export_archives WHERE state = 'stored'`
      ),
    ]);
    return jsonOk({
      archives: archives.rows.map((row) => ({ ...row, archive_sha256: String(row.archive_sha256).trim() })),
      storage: usage.rows[0],
      retention_days: RETENTION_DAYS,
      max_archive_bytes: MAX_ARCHIVE_BYTES,
    });
  } catch (err) {
    return jsonError("No se pudieron consultar los respaldos de WhatsApp", 500, String(err));
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireWhatsappBackupManager();
  if (auth.response) return auth.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("No se pudo leer la carga multipart del respaldo");
  }
  const file = form.get("file");
  const conversationId = String(form.get("conversation_id") ?? "");
  const dateFormat = String(form.get("date_format") ?? "auto");
  const timezone = String(form.get("timezone") ?? DEFAULT_TIMEZONE);
  if (!(file instanceof File)) return jsonError("Selecciona un archivo ZIP");
  if (!parseId(conversationId)) return jsonError("Selecciona un grupo válido");
  if (!file.name.toLowerCase().endsWith(".zip")) return jsonError("El archivo debe tener extensión .zip");
  if (file.size < 4 || file.size > MAX_ARCHIVE_BYTES) {
    return jsonError(`El ZIP debe pesar entre 4 bytes y ${Math.floor(MAX_ARCHIVE_BYTES / (1024 * 1024))} MiB`);
  }
  if (dateFormat !== "auto" && dateFormat !== "dmy" && dateFormat !== "mdy") return jsonError("El formato de fecha debe ser automático, día/mes/año o mes/día/año");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return jsonError("La zona horaria no es válida");
  }

  const conversation = await pool.query(
    `SELECT id, display_name FROM whatsapp_capture.conversations WHERE id = $1 AND is_group = true`,
    [conversationId]
  );
  if (!conversation.rows[0]) return jsonError("No se encontró el grupo seleccionado", 404);

  const tempDir = await mkdtemp(path.join(tmpdir(), "whatsapp-export-"));
  const sourceFilename = safeFilename(file.name);
  const tempPath = path.join(tempDir, sourceFilename);
  let lockKey: string | null = null;
  let client: PoolClient | null = null;
  let locked = false;
  try {
    await pipeline(Readable.fromWeb(file.stream() as never), createWriteStream(tempPath, { flags: "wx" }));
    if (!(await hasZipSignature(tempPath))) return jsonError("El archivo no parece ser un ZIP válido");
    const archiveSha = await fileSha256(tempPath);
    lockKey = archiveSha;
    const bucket = whatsappBackupBucket();
    const objectKey = `archives/${archiveSha.slice(0, 2)}/${archiveSha}.zip`;

    client = await pool.connect();
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [archiveSha]);
    locked = true;

    const exists = await storageObjectExistsInBucket(bucket, objectKey);
    if (!exists) {
      await putStorageFileInBucket(bucket, objectKey, tempPath, {
        "Content-Type": "application/zip",
        "X-Amz-Meta-Sha256": archiveSha,
        "X-Amz-Meta-Deletion-Eligible": "true",
        "X-Amz-Meta-Retention-Days": String(RETENTION_DAYS),
      });
    }

    await client.query("BEGIN");
    await client.query(
      `INSERT INTO whatsapp_capture.export_archives
         (archive_sha256, bucket, object_key, source_filename, size_bytes, state, deletion_eligible, retention_until, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, 'stored', true, now() + ($6 || ' days')::interval, now(), NULL)
       ON CONFLICT (archive_sha256) DO UPDATE SET
         bucket = EXCLUDED.bucket,
         object_key = EXCLUDED.object_key,
         source_filename = EXCLUDED.source_filename,
         size_bytes = EXCLUDED.size_bytes,
         state = 'stored',
         deletion_eligible = true,
         retention_until = EXCLUDED.retention_until,
         updated_at = now(),
         deleted_at = NULL`,
      [archiveSha, bucket, objectKey, sourceFilename, file.size, String(RETENTION_DAYS)]
    );
    const upload = await client.query(
      `INSERT INTO whatsapp_capture.export_archive_uploads
         (archive_sha256, conversation_id, uploaded_by, source_filename, size_bytes, status)
       VALUES ($1, $2, $3, $4, $5, 'uploaded') RETURNING id`,
      [archiveSha, conversationId, auth.user?.id ?? null, sourceFilename, file.size]
    );
    const uploadId: string = upload.rows[0].id;
    await client.query("COMMIT");

    const previous = await client.query(
      `SELECT id, status, total_messages, inserted_messages, matched_messages
         FROM whatsapp_capture.export_batches WHERE conversation_id = $1 AND archive_sha256 = $2`,
      [conversationId, archiveSha]
    );
    if (previous.rows.length > 0) {
      await client.query(
        `UPDATE whatsapp_capture.export_archive_uploads
            SET status = 'already_imported', import_result = $2::jsonb, completed_at = now()
          WHERE id = $1`,
        [uploadId, JSON.stringify({ already_imported: true, batch: previous.rows[0] })]
      );
      return jsonOk({
        archive_sha256: archiveSha,
        stored: true,
        deduplicated: exists,
        status: "already_imported",
        batch: previous.rows[0],
        message: "Este respaldo ya estaba importado para el grupo; se registró esta nueva carga sin duplicar los mensajes.",
      }, 201);
    }

    await client.query(
      `UPDATE whatsapp_capture.export_archive_uploads SET status = 'importing' WHERE id = $1`,
      [uploadId]
    );
    let importStatus = "failed";
    let importResult: Record<string, unknown> = {};
    let importError: string | null = null;
    try {
      const scriptPath = path.resolve(process.cwd(), "scripts/import-whatsapp-export.mjs");
      const importArgs = [scriptPath, tempPath, "--conversation-id", conversationId];
      if (dateFormat !== "auto") importArgs.push("--date-format", dateFormat);
      importArgs.push("--timezone", timezone, "--apply");
      const { stdout } = await execFileAsync(
        process.execPath,
        importArgs,
        { cwd: process.cwd(), timeout: 15 * 60 * 1000, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" }
      );
      importResult = JSON.parse(stdout) as Record<string, unknown>;
      if (importResult.already_imported === true) importStatus = "already_imported";
      else importStatus = importResult.status === "partial" ? "partial" : "imported";
    } catch (err) {
      const childError = err as Error & { stdout?: string; stderr?: string };
      importError = (childError.stderr || childError.message || "No se pudo importar el respaldo").slice(0, 4000);
      if (childError.stdout) {
        try { importResult = JSON.parse(childError.stdout) as Record<string, unknown>; } catch { /* conservar el error de proceso */ }
      }
    }
    await client.query(
      `UPDATE whatsapp_capture.export_archive_uploads
          SET status = $2, import_result = $3::jsonb, error_message = $4, completed_at = now()
        WHERE id = $1`,
      [uploadId, importStatus, JSON.stringify(importResult), importError]
    );
    return jsonOk({
      archive_sha256: archiveSha,
      stored: true,
      deduplicated: exists,
      status: importStatus,
      result: importResult,
      error: importError,
      message: importStatus === "failed"
        ? "El ZIP quedó guardado en MinIO, pero no se pudo importar. Revisa el error y vuelve a subirlo para reintentar."
        : importStatus === "partial"
          ? "El ZIP se guardó y se importó parcialmente; revisa el reporte antes de borrar el respaldo."
          : "El ZIP quedó guardado y sus mensajes y archivos fueron procesados.",
    }, 201);
  } catch (err) {
    await client?.query("ROLLBACK").catch(() => {});
    return jsonError("No se pudo guardar o procesar el respaldo", 500, String(err));
  } finally {
    if (locked && client && lockKey) await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [lockKey]).catch(() => {});
    client?.release();
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
