import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { getCurrentUser, jsonError, jsonOk, parseId } from "@/app/lib/api";
import { refreshMessagesForAlias, validIsoDate } from "@/app/lib/whatsapp-participants";

async function manager() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: jsonError("Se requiere una sesión", 401) };
  if (user.role !== "admin" && user.role !== "coordinator") {
    return { user, response: jsonError("Se requiere rol de administración o coordinación", 403) };
  }
  return { user, response: null };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; aliasId: string }> }) {
  const auth = await manager();
  if (auth.response) return auth.response;
  const { id, aliasId } = await params;
  if (!parseId(id) || !parseId(aliasId)) return jsonError("id o aliasId inválido");
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT id, participant_id, identifier_type, normalized_value, category, valid_from, valid_to, is_verified
         FROM whatsapp_capture.participant_aliases
        WHERE id = $1 AND participant_id = $2 FOR UPDATE`, [aliasId, id]
    );
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      return jsonError("Alias no encontrado", 404);
    }
    const alias = current.rows[0];
    const updates: string[] = [];
    const values: unknown[] = [aliasId, id];
    const add = (column: string, value: unknown) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };
    let targetValidTo: string | null = alias.valid_to;
    if (body.valid_to !== undefined) {
      const validTo = validIsoDate(body.valid_to);
      if (validTo === undefined) {
        await client.query("ROLLBACK");
        return jsonError("valid_to debe ser una fecha ISO 8601 válida o null");
      }
      if (validTo && alias.valid_from && new Date(validTo) <= new Date(alias.valid_from)) {
        await client.query("ROLLBACK");
        return jsonError("valid_to debe ser posterior a valid_from");
      }
      targetValidTo = validTo;
      add("valid_to", validTo);
    }
    if (body.category !== undefined) {
      const validCategories = alias.identifier_type === "phone"
        ? ["primary", "permanent_secondary", "temporary", "previous"]
        : ["identity"];
      if (typeof body.category !== "string" || !validCategories.includes(body.category)) {
        await client.query("ROLLBACK");
        return jsonError("category inválida para este alias");
      }
      if (alias.identifier_type === "phone" && body.category === "previous" && !targetValidTo) {
        await client.query("ROLLBACK");
        return jsonError("Un teléfono anterior requiere valid_to");
      }
      add("category", body.category);
    }
    if (alias.identifier_type === "phone" && (body.category ?? alias.category) === "previous" && !targetValidTo) {
      await client.query("ROLLBACK");
      return jsonError("Un teléfono anterior requiere valid_to");
    }
    if (body.label !== undefined) {
      if (body.label !== null && typeof body.label !== "string") {
        await client.query("ROLLBACK");
        return jsonError("label debe ser texto o null");
      }
      add("label", typeof body.label === "string" ? body.label.trim() || null : null);
    }
    if (body.is_verified !== undefined) {
      if (typeof body.is_verified !== "boolean") {
        await client.query("ROLLBACK");
        return jsonError("is_verified debe ser booleano");
      }
      add("is_verified", body.is_verified);
    }
    if (!updates.length) {
      await client.query("ROLLBACK");
      return jsonError("No se recibieron campos para actualizar");
    }
    updates.push("updated_at = now()");
    const { rows } = await client.query(
      `UPDATE whatsapp_capture.participant_aliases SET ${updates.join(", ")}
        WHERE id = $1 AND participant_id = $2
        RETURNING id, participant_id, identifier_type, identifier_value, normalized_value,
                  category, label, valid_from, valid_to, is_verified, source, created_at, updated_at`,
      values
    );
    await refreshMessagesForAlias(client, rows[0]);
    await client.query("COMMIT");
    return jsonOk({ alias: rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof Error && err.message.includes("duplicate key")) {
      return jsonError("Ese identificador o teléfono principal ya está activo", 409);
    }
    return jsonError("No se pudo actualizar el alias", 500);
  } finally {
    client.release();
  }
}
