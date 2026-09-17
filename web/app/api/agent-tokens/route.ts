import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, getCurrentUserId } from "@/app/lib/api";
import { hashToken } from "@/app/lib/agent-auth";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.name, t.active, t.last_used_at, t.revoked_at, t.created_at,
              u.name AS created_by_name
         FROM agent_tokens t
         LEFT JOIN users u ON u.id = t.created_by
        ORDER BY t.created_at DESC`
    );
    return jsonOk({ tokens: rows });
  } catch (err) {
    return jsonError("No se pudieron leer los tokens", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const name = body.name?.trim();
  if (!name) return jsonError("name es obligatorio");

  const token = `ag_${randomBytes(24).toString("hex")}`;
  const createdBy = await getCurrentUserId();

  try {
    const { rows } = await pool.query(
      `INSERT INTO agent_tokens (name, token_hash, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, name, active, created_at`,
      [name, hashToken(token), createdBy]
    );
    return jsonOk({ token, record: rows[0] }, 201);
  } catch (err) {
    return jsonError("No se pudo crear el token", 500, String(err));
  }
}
