import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export const runtime = "nodejs";

const SHA_RE = /^[0-9a-f]{64}$/;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sha256: string }> }) {
  const { sha256 } = await params;
  if (!SHA_RE.test(sha256)) return jsonError("sha256 inválido");

  try {
    const [faces, analysis] = await Promise.all([
      pool.query(
        `SELECT f.id, f.bbox, f.det_score, f.model_name,
                fa.identity_id, fa.source, fa.confidence,
                fi.display_name, fi.technician_id, fi.user_id,
                sfs.identity_id AS sface_identity_id,
                sfs.best_similarity AS sface_similarity,
                sfs.accepted AS sface_accepted,
                sfi.display_name AS sface_display_name
           FROM whatsapp_capture.faces f
           LEFT JOIN whatsapp_capture.face_assignments fa ON fa.face_id = f.id
           LEFT JOIN whatsapp_capture.face_identities fi ON fi.id = fa.identity_id
           LEFT JOIN whatsapp_capture.face_sface_suggestions sfs ON sfs.face_id = f.id
           LEFT JOIN whatsapp_capture.face_identities sfi ON sfi.id = sfs.identity_id
          WHERE f.sha256 = $1
          ORDER BY f.det_score DESC`,
        [sha256]
      ),
      pool.query(
        `SELECT result FROM whatsapp_capture.media_analyses
          WHERE sha256 = $1 AND analysis_type = 'face_detect' AND state = 'completed'
          ORDER BY completed_at DESC NULLS LAST LIMIT 1`,
        [sha256]
      ),
    ]);

    const meta = (analysis.rows[0]?.result ?? {}) as { width?: number; height?: number };
    return jsonOk({ faces: faces.rows, width: meta.width ?? null, height: meta.height ?? null });
  } catch (err) {
    return jsonError("No se pudieron leer los rostros", 500, String(err));
  }
}
