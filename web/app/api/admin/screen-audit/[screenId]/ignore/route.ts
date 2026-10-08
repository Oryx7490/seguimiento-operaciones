import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { getCurrentUserId, getCurrentUser, jsonError, jsonOk } from "@/app/lib/api";

export async function POST(req: NextRequest, { params }: { params: Promise<{ screenId: string }> }) {
  try {
    const { screenId } = await params;
    const body = await req.json();
    const issueKey = String(body.issue_key ?? "").trim();
    if (!issueKey) return jsonError("issue_key es obligatorio");
    const reason = body.reason ? String(body.reason).trim() : null;

    const user = await getCurrentUser();
    const actorId = await getCurrentUserId();

    const { rows } = await pool.query(
      `INSERT INTO screen_audit_ignores (screen_id, issue_key, reason, ignored_by_id, ignored_by_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (screen_id, issue_key) DO UPDATE
         SET reason = EXCLUDED.reason,
             ignored_by_id = EXCLUDED.ignored_by_id,
             ignored_by_name = EXCLUDED.ignored_by_name,
             ignored_at = now()
       RETURNING id, screen_id, issue_key, reason, ignored_by_name, ignored_at`,
      [screenId, issueKey, reason, actorId, user?.name ?? null]
    );

    return jsonOk({ ignore: rows[0] }, 201);
  } catch (err) {
    return jsonError("No se pudo guardar el aviso ignorado", 500, String(err));
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ screenId: string }> }) {
  try {
    const { screenId } = await params;
    const url = new URL(req.url);
    const issueKey = url.searchParams.get("issue_key");
    if (!issueKey || !issueKey.trim()) return jsonError("issue_key es obligatorio");
    await pool.query(
      `DELETE FROM screen_audit_ignores WHERE screen_id = $1 AND issue_key = $2`,
      [screenId, issueKey.trim()]
    );
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError("No se pudo eliminar el aviso ignorado", 500, String(err));
  }
}
