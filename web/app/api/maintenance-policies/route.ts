import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId, getCurrentUserId } from "@/app/lib/api";
import { logActivityAsync } from "@/app/lib/audit";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const POLICY_TYPES = new Set(["content_changes", "corrective_preventive"]);
const STATUSES = new Set(["active", "paused", "ended"]);

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const status = sp.get("status")?.trim() || null;
  const clientId = sp.get("client_id")?.trim() || null;
  if (status && status !== "all" && !STATUSES.has(status)) return jsonError("status inválido");
  if (clientId && !parseId(clientId)) return jsonError("client_id inválido");

  const where: string[] = [];
  const vals: unknown[] = [];
  if (status && status !== "all") {
    vals.push(status);
    where.push(`p.status = $${vals.length}`);
  }
  if (clientId) {
    vals.push(clientId);
    where.push(`p.client_id = $${vals.length}::uuid`);
  }

  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.client_id, c.name AS client_name, p.location_id, l.name AS location_name,
              p.name, p.policy_type, p.description, p.start_date, p.end_date, p.status, p.notes,
              (SELECT count(*)::int FROM activities a WHERE a.maintenance_policy_id = p.id) AS activity_count
         FROM maintenance_policies p
         JOIN clients c ON c.id = p.client_id
         LEFT JOIN locations l ON l.id = p.location_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY p.status = 'active' DESC, c.name, p.name`,
      vals
    );
    return jsonOk({ policies: rows });
  } catch (err) {
    return jsonError("No se pudieron leer las pólizas", 500, String(err));
  }
}

interface PolicyBody {
  client_id?: string;
  location_id?: string | null;
  name?: string;
  policy_type?: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string;
  notes?: string | null;
}

export async function POST(request: NextRequest) {
  let body: PolicyBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }

  const clientId = body.client_id ? parseId(body.client_id) : null;
  if (!clientId) return jsonError("client_id inválido");
  const name = (body.name ?? "").trim();
  if (!name) return jsonError("El nombre de la póliza es obligatorio");
  const policyType = body.policy_type ?? "";
  if (!POLICY_TYPES.has(policyType)) return jsonError("policy_type inválido");
  if (body.start_date && !DATE_RE.test(body.start_date)) return jsonError("start_date inválido");
  if (body.end_date && !DATE_RE.test(body.end_date)) return jsonError("end_date inválido");
  const status = body.status && STATUSES.has(body.status) ? body.status : "active";
  const locationId = body.location_id ? parseId(body.location_id) : null;
  if (body.location_id && !locationId) return jsonError("location_id inválido");

  try {
    const { rows } = await pool.query(
      `INSERT INTO maintenance_policies
         (client_id, location_id, name, policy_type, description, start_date, end_date, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, client_id, name, policy_type, status`,
      [clientId, locationId, name, policyType, body.description?.trim() || null, body.start_date || null, body.end_date || null, status, body.notes?.trim() || null]
    );
    const actor = await getCurrentUserId();
    logActivityAsync({
      entity_type: "maintenance_policy",
      entity_id: rows[0].id,
      entity_label: name,
      action: "create",
      summary: `Póliza creada: ${name}`,
      details: { policy_type: policyType, client_id: clientId },
      actor_id: actor,
    });
    return jsonOk({ policy: rows[0] }, 201);
  } catch (err) {
    return jsonError("No se pudo crear la póliza", 500, String(err));
  }
}
