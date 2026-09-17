import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import pool from "@/app/lib/db";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface AgentIdentity {
  tokenId: string;
  tokenName: string;
  actorId: string;
}

export async function authenticateAgent(req: NextRequest): Promise<AgentIdentity | null> {
  const header = req.headers.get("authorization");
  const bearer = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const token = bearer || req.headers.get("x-agent-token");
  if (!token) return null;

  const { rows } = await pool.query<{ token_id: string; token_name: string; actor_id: string }>(
    `SELECT t.id AS token_id, t.name AS token_name, u.id AS actor_id
       FROM agent_tokens t
       JOIN users u ON u.is_agent
      WHERE t.token_hash = $1 AND t.active AND t.revoked_at IS NULL
      ORDER BY u.created_at
      LIMIT 1`,
    [hashToken(token)]
  );
  if (rows.length === 0) return null;

  await pool.query(`UPDATE agent_tokens SET last_used_at = now() WHERE id = $1`, [rows[0].token_id]);
  return { tokenId: rows[0].token_id, tokenName: rows[0].token_name, actorId: rows[0].actor_id };
}

export function agentReason(identity: AgentIdentity, action: string): string {
  return `${action} por agente CLI (${identity.tokenName})`;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Token de agente inválido o ausente" }, { status: 401 });
}
