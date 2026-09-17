import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId, getCurrentUserId } from "@/app/lib/api";
import { deleteStorageObject, putStorageObject } from "@/app/lib/storage";

export const DOC_TYPES = [
  "ine",
  "passport",
  "curp",
  "proof_address",
  "contract",
  "nss",
  "other",
];

const MAX_BYTES = 25 * 1024 * 1024;

function formString(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function GET(req: NextRequest) {
  const technicianId = new URL(req.url).searchParams.get("technician_id");
  if (!technicianId || !parseId(technicianId)) return jsonError("technician_id inválido");

  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.technician_id, d.doc_type, d.file_name, d.mime_type, d.size_bytes,
              d.notes, d.created_at, u.name AS uploaded_by_name
         FROM technician_documents d
         LEFT JOIN users u ON u.id = d.uploaded_by
        WHERE d.technician_id = $1
        ORDER BY d.created_at DESC`,
      [technicianId]
    );
    return jsonOk({ documents: rows });
  } catch (err) {
    return jsonError("No se pudieron leer los documentos", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("FormData inválido");

  const technicianId = formString(form, "technician_id");
  if (!technicianId || !parseId(technicianId)) return jsonError("technician_id inválido");

  const docType = formString(form, "doc_type") ?? "other";
  if (!DOC_TYPES.includes(docType)) return jsonError("Tipo de documento inválido");

  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Falta el campo file");
  if (file.size === 0) return jsonError("Archivo vacío");
  if (file.size > MAX_BYTES) return jsonError("El archivo supera 25 MB");

  const notes = formString(form, "notes");
  const uploadedBy = await getCurrentUserId();

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const id = randomUUID();
  const storageKey = `technician-documents/${id}${ext ? `.${ext}` : ""}`;

  try {
    await putStorageObject(storageKey, buffer, file.type || "application/octet-stream");
    const { rows } = await pool.query(
      `INSERT INTO technician_documents (id, technician_id, doc_type, file_name, storage_key,
                                         mime_type, size_bytes, notes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, technician_id, doc_type, file_name, mime_type, size_bytes, notes, created_at`,
      [id, technicianId, docType, file.name, storageKey, file.type || null, file.size, notes, uploadedBy]
    );
    return jsonOk({ document: rows[0] }, 201);
  } catch (err) {
    try {
      await deleteStorageObject(storageKey);
    } catch {
      /* conservar el error original */
    }
    return jsonError("No se pudo subir el documento", 500, String(err));
  }
}
