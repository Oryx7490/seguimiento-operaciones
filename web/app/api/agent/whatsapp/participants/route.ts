import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId } from "@/app/lib/api";
import { authenticateAgent, unauthorized } from "@/app/lib/agent-auth";
import { listUnresolvedSenders } from "@/app/lib/whatsapp-participants";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const identity = await authenticateAgent(request);
  if (!identity) return unauthorized();
  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim() || null;
  if (q && q.length > 200) return jsonError("q no puede exceder 200 caracteres");
  const userId = params.get("user_id")?.trim() || null;
  const technicianId = params.get("technician_id")?.trim() || null;
  if (userId && !parseId(userId)) return jsonError("user_id inválido");
  if (technicianId && !parseId(technicianId)) return jsonError("technician_id inválido");
  const rawLimit = params.get("limit");
  const rawOffset = params.get("offset");
  const limit = rawLimit == null ? 50 : Number(rawLimit);
  const offset = rawOffset == null ? 0 : Number(rawOffset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return jsonError("limit debe ser un entero entre 1 y 200");
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) return jsonError("offset debe ser un entero no negativo");

  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    clauses.push(sql.replaceAll("$N", `$${values.length}`));
  };
  if (userId) add("p.user_id = $N::uuid", userId);
  if (technicianId) add("p.technician_id = $N::uuid", technicianId);
  if (q) add("(p.display_name ILIKE '%' || $N || '%' OR u.name ILIKE '%' || $N || '%' OR t.display_name ILIKE '%' || $N || '%')", q);
  const filter = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  try {
    const unresolved = params.get("include_unresolved") === "false" ? [] : await listUnresolvedSenders(q, Math.min(limit, 100));
    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT p.id, p.display_name, p.company_status, p.user_id, u.name AS user_name,
                p.technician_id, t.display_name AS technician_name,
                (SELECT count(*)::int FROM whatsapp_capture.messages m WHERE m.participant_id = p.id) AS message_count
           FROM whatsapp_capture.participants p
           LEFT JOIN users u ON u.id = p.user_id
           LEFT JOIN technicians t ON t.id = p.technician_id
           ${filter}
          ORDER BY p.display_name, p.id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      ),
      pool.query(
        `SELECT count(*)::int AS total
           FROM whatsapp_capture.participants p
           LEFT JOIN users u ON u.id = p.user_id
           LEFT JOIN technicians t ON t.id = p.technician_id
           ${filter}`,
        values
      ),
    ]);
    return jsonOk({ participants: rows, total: countRows[0]?.total ?? 0, unresolved_senders: unresolved, limit, offset });
  } catch {
    return jsonError("No se pudieron consultar los participantes de WhatsApp", 500);
  }
}
