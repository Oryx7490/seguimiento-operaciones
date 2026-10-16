import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { getCurrentUser, jsonError, jsonOk, parseId } from "@/app/lib/api";
import { addAlias, parseAlias } from "@/app/lib/whatsapp-participants";

export const runtime = "nodejs";

async function manager() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: jsonError("Se requiere una sesión", 401) };
  if (user.role !== "admin" && user.role !== "coordinator") {
    return { user, response: jsonError("Se requiere rol de administración o coordinación", 403) };
  }
  return { user, response: null };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await manager();
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  const { rows } = await pool.query(
    `SELECT id, participant_id, identifier_type, identifier_value, normalized_value,
            category, label, valid_from, valid_to, is_verified, source, created_at, updated_at
       FROM whatsapp_capture.participant_aliases WHERE participant_id = $1
      ORDER BY identifier_type, category, created_at`, [id]
  );
  return jsonOk({ aliases: rows });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await manager();
  if (auth.response) return auth.response;
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const alias = parseAlias(body);
  if (!alias) return jsonError("Alias inválido: revisa tipo, valor, categoría y fechas");
  const replacePrimary = body.replace_primary === true;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const participant = await client.query(`SELECT id FROM whatsapp_capture.participants WHERE id = $1`, [id]);
    if (!participant.rowCount) {
      await client.query("ROLLBACK");
      return jsonError("Participante no encontrado", 404);
    }
    if (replacePrimary && alias.identifier_type === "phone" && alias.category === "primary") {
      const effectiveFrom = alias.valid_from ?? new Date().toISOString();
      alias.valid_from = effectiveFrom;
      await client.query(
        `UPDATE whatsapp_capture.participant_aliases
            SET category = 'previous', valid_to = $2, updated_at = now()
          WHERE participant_id = $1 AND identifier_type = 'phone'
            AND category = 'primary' AND valid_to IS NULL`,
        [id, effectiveFrom]
      );
    }
    const created = await addAlias(client, id, alias, auth.user?.id ?? null);
    await client.query("COMMIT");
    return jsonOk({ alias: created }, 201);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof Error && err.message.includes("duplicate key")) {
      return jsonError("Ese identificador ya está activo para otra identidad o ya existe un teléfono principal", 409);
    }
    return jsonError("No se pudo asociar el alias", 500);
  } finally {
    client.release();
  }
}
