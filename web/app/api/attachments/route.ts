import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId } from "@/app/lib/api";
import { deleteStorageObject, putStorageObject } from "@/app/lib/storage";

const ATTACHMENT_TYPES = [
  "delivery_sheet",
  "photo",
  "quote",
  "evidence",
  "digital_signature",
  "finiquito",
  "fiscal_complement",
  "other",
];

const MAX_BYTES = 25 * 1024 * 1024;

function formString(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function getActorId(value: FormDataEntryValue | null): Promise<string | null> {
  if (typeof value === "string" && value) {
    const { rows } = await pool.query(`SELECT id FROM users WHERE id = $1`, [value]);
    if (rows.length > 0) return rows[0].id;
  }
  const { rows } = await pool.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`);
  return rows.length > 0 ? rows[0].id : null;
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("FormData inválido");

  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Falta el campo file");
  if (file.size === 0) return jsonError("Archivo vacío");
  if (file.size > MAX_BYTES) return jsonError("El archivo supera 25 MB");

  const projectId = formString(form, "project_id");
  const ticketId = formString(form, "ticket_id");
  const projectUuid = projectId ? parseId(projectId) : null;
  const ticketUuid = ticketId ? parseId(ticketId) : null;
  if (projectUuid && ticketUuid) return jsonError("Indica solo project_id o ticket_id");
  if (!projectUuid && !ticketUuid) return jsonError("Falta project_id o ticket_id");

  const attachmentType = formString(form, "attachment_type") ?? "other";
  if (!ATTACHMENT_TYPES.includes(attachmentType)) return jsonError("Tipo de adjunto inválido");

  const actorId = await getActorId(form.get("actor_id"));
  if (!actorId) return jsonError("Sin usuario registrado para la subida");

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const id = randomUUID();
  const storageKey = `attachments/${id}${ext ? `.${ext}` : ""}`;

  try {
    await putStorageObject(storageKey, buffer, file.type || "application/octet-stream");
    const { rows } = await pool.query(
      `INSERT INTO attachments (id, project_id, ticket_id, file_name, storage_key, mime_type,
                                size_bytes, attachment_type, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, project_id, ticket_id, file_name, attachment_type, mime_type, size_bytes, created_at`,
      [id, projectUuid, ticketUuid, file.name, storageKey, file.type || null, file.size, attachmentType, actorId]
    );
    return jsonOk({ attachment: rows[0] }, 201);
  } catch (err) {
    try {
      await deleteStorageObject(storageKey);
    } catch {
      /* conservar el error original */
    }
    return jsonError("No se pudo subir el adjunto", 500, String(err));
  }
}