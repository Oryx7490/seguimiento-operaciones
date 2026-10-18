import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { getCurrentUser, jsonError, jsonOk, parseId } from "@/app/lib/api";
import {
  addAlias,
  COMPANY_STATUSES,
  listParticipants,
  listUnresolvedSenders,
  parseAlias,
  isTechnicianUserPair,
  syncTechnicianPhone,
} from "@/app/lib/whatsapp-participants";

export const runtime = "nodejs";

async function manager() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: jsonError("Se requiere una sesión", 401) };
  if (user.role !== "admin" && user.role !== "coordinator") {
    return { user, response: jsonError("Se requiere rol de administración o coordinación", 403) };
  }
  return { user, response: null };
}

function parsePage(request: NextRequest) {
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const rawOffset = request.nextUrl.searchParams.get("offset");
  const limit = rawLimit == null ? 50 : Number(rawLimit);
  const offset = rawOffset == null ? 0 : Number(rawOffset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return null;
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) return null;
  return { limit, offset };
}

export async function GET(request: NextRequest) {
  const auth = await manager();
  if (auth.response) return auth.response;
  const params = request.nextUrl.searchParams;
  const page = parsePage(request);
  if (!page) return jsonError("limit debe ser 1–200 y offset un entero no negativo");
  const q = params.get("q")?.trim() || null;
  if (q && q.length > 200) return jsonError("q no puede exceder 200 caracteres");
  const includeUnresolved = params.get("include_unresolved") !== "false";
  try {
    const [result, unresolved] = await Promise.all([
      listParticipants(q, page.limit, page.offset),
      includeUnresolved ? listUnresolvedSenders(q, Math.min(page.limit, 100)) : Promise.resolve([]),
    ]);
    return jsonOk({ ...result, unresolved_senders: unresolved, ...page });
  } catch {
    return jsonError("No se pudieron consultar las identidades de WhatsApp", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await manager();
  if (auth.response) return auth.response;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
  const companyStatus = typeof body.company_status === "string" ? body.company_status : "unclassified";
  const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  const userId = body.user_id == null || body.user_id === "" ? null : String(body.user_id);
  const technicianId = body.technician_id == null || body.technician_id === "" ? null : String(body.technician_id);
  if (!displayName) return jsonError("display_name es obligatorio");
  if (displayName.length > 200) return jsonError("display_name no puede exceder 200 caracteres");
  if (!COMPANY_STATUSES.includes(companyStatus as (typeof COMPANY_STATUSES)[number])) {
    return jsonError("company_status debe ser current, former, external o unclassified");
  }
  if (userId && !parseId(userId)) return jsonError("user_id inválido");
  if (technicianId && !parseId(technicianId)) return jsonError("technician_id inválido");
  if (technicianId && userId && !(await isTechnicianUserPair(technicianId, userId))) {
    return jsonError("El técnico no corresponde al usuario indicado");
  }
  const aliasesValue = body.aliases == null ? [] : body.aliases;
  if (!Array.isArray(aliasesValue) || aliasesValue.length > 50) return jsonError("aliases debe ser un arreglo de hasta 50 elementos");
  const aliases = aliasesValue.map(parseAlias);
  if (aliases.some((alias) => alias === null)) return jsonError("Uno o más alias son inválidos");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let linkedUserId = userId;
    if (!linkedUserId && technicianId) {
      const tech = await client.query(`SELECT user_id FROM technicians WHERE id = $1`, [technicianId]);
      if (!tech.rowCount) {
        await client.query("ROLLBACK");
        return jsonError("Técnico no encontrado", 404);
      }
      linkedUserId = tech.rows[0].user_id;
    }
    const { rows } = await client.query(
      `INSERT INTO whatsapp_capture.participants
         (display_name, company_status, user_id, technician_id, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, display_name, company_status, user_id, technician_id, notes, created_at, updated_at`,
      [displayName, companyStatus, linkedUserId, technicianId, notes, auth.user?.id ?? null]
    );
    const participant = rows[0];
    const createdAliases = [];
    for (const alias of aliases) {
      const createdAlias = await addAlias(client, participant.id, alias!, auth.user?.id ?? null);
      createdAliases.push(createdAlias);
      await syncTechnicianPhone(client, participant.id, createdAlias);
    }
    await client.query("COMMIT");
    return jsonOk({ participant: { ...participant, aliases: createdAliases } }, 201);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof Error && err.message.includes("duplicate key")) {
      return jsonError("El usuario, técnico o alias ya está asociado a otra identidad", 409);
    }
    return jsonError("No se pudo crear el participante", 500);
  } finally {
    client.release();
  }
}
