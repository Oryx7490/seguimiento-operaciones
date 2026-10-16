import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { getCurrentUser, jsonError, jsonOk, parseId } from "@/app/lib/api";
import { COMPANY_STATUSES, isTechnicianUserPair } from "@/app/lib/whatsapp-participants";

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
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.display_name, p.company_status, p.user_id, u.name AS user_name,
              p.technician_id, t.display_name AS technician_name, p.notes, p.created_at, p.updated_at,
              (SELECT count(*)::int FROM whatsapp_capture.messages m WHERE m.participant_id = p.id) AS message_count,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'id', a.id, 'identifier_type', a.identifier_type, 'identifier_value', a.identifier_value,
                'category', a.category, 'label', a.label, 'valid_from', a.valid_from,
                'valid_to', a.valid_to, 'is_verified', a.is_verified, 'source', a.source
              ) ORDER BY a.identifier_type, a.category, a.created_at)
                FROM whatsapp_capture.participant_aliases a WHERE a.participant_id = p.id), '[]'::jsonb) AS aliases
         FROM whatsapp_capture.participants p
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN technicians t ON t.id = p.technician_id
        WHERE p.id = $1`,
      [id]
    );
    if (!rows.length) return jsonError("Participante no encontrado", 404);
    return jsonOk({ participant: rows[0] });
  } catch {
    return jsonError("No se pudo consultar el participante", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT user_id, technician_id FROM whatsapp_capture.participants WHERE id = $1 FOR UPDATE`, [id]
    );
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      return jsonError("Participante no encontrado", 404);
    }

    const updates: string[] = [];
    const values: unknown[] = [id];
    const add = (column: string, value: unknown) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };
    if (body.display_name !== undefined) {
      if (typeof body.display_name !== "string" || !body.display_name.trim() || body.display_name.trim().length > 200) {
        await client.query("ROLLBACK");
        return jsonError("display_name inválido");
      }
      add("display_name", body.display_name.trim());
    }
    if (body.company_status !== undefined) {
      if (typeof body.company_status !== "string" || !COMPANY_STATUSES.includes(body.company_status as (typeof COMPANY_STATUSES)[number])) {
        await client.query("ROLLBACK");
        return jsonError("company_status inválido");
      }
      add("company_status", body.company_status);
    }
    if (body.notes !== undefined) {
      if (body.notes !== null && typeof body.notes !== "string") {
        await client.query("ROLLBACK");
        return jsonError("notes debe ser texto o null");
      }
      add("notes", typeof body.notes === "string" ? body.notes.trim() || null : null);
    }
    const userId = body.user_id === undefined ? current.rows[0].user_id : body.user_id == null || body.user_id === "" ? null : String(body.user_id);
    const technicianId = body.technician_id === undefined ? current.rows[0].technician_id : body.technician_id == null || body.technician_id === "" ? null : String(body.technician_id);
    if (userId && !parseId(userId)) {
      await client.query("ROLLBACK");
      return jsonError("user_id inválido");
    }
    if (technicianId && !parseId(technicianId)) {
      await client.query("ROLLBACK");
      return jsonError("technician_id inválido");
    }
    if (technicianId && userId && !(await isTechnicianUserPair(technicianId, userId))) {
      await client.query("ROLLBACK");
      return jsonError("El técnico no corresponde al usuario indicado");
    }
    if (body.user_id !== undefined) add("user_id", userId);
    if (body.technician_id !== undefined) add("technician_id", technicianId);
    if (!updates.length) {
      await client.query("ROLLBACK");
      return jsonError("No se recibieron campos para actualizar");
    }
    const updated = await client.query(
      `UPDATE whatsapp_capture.participants SET ${updates.join(", ")}, updated_at = now()
        WHERE id = $1
        RETURNING id, display_name, company_status, user_id, technician_id, notes, created_at, updated_at`,
      values
    );
    await client.query("COMMIT");
    return jsonOk({ participant: updated.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof Error && err.message.includes("duplicate key")) {
      return jsonError("Ese usuario o técnico ya está vinculado a otro participante", 409);
    }
    return jsonError("No se pudo actualizar el participante", 500);
  } finally {
    client.release();
  }
}
