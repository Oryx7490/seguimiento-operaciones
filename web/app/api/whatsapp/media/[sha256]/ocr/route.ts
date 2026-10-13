import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export const runtime = "nodejs";

const SHA_RE = /^[0-9a-f]{64}$/;

/** Texto extraído por OCR y candidato de asistencia para una foto. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");

  try {
    const { rows } = await pool.query(
      `SELECT state, result, error_message, created_at, completed_at
         FROM whatsapp_capture.media_analyses
        WHERE sha256 = $1 AND analysis_type = 'ocr'
        ORDER BY created_at DESC LIMIT 1`,
      [sha256]
    );
    if (rows.length === 0) return jsonOk({ ocr: null });
    const row = rows[0];
    const result = (row.result ?? {}) as Record<string, unknown>;
    return jsonOk({
      ocr: {
        state: row.state,
        error: row.error_message,
        created_at: row.created_at,
        completed_at: row.completed_at,
        text: result.text ?? "",
        lines: result.lines ?? [],
        mean_conf: result.mean_conf ?? null,
        parsed: result.parsed ?? null,
      },
    });
  } catch (err) {
    return jsonError("No se pudo leer el OCR", 500, String(err));
  }
}
