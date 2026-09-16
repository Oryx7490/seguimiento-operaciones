import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk } from "@/app/lib/api";

const CHANNELS = ["system", "email", "whatsapp"];

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, code, channel, subject, body, description, active
         FROM notification_templates
        ORDER BY code, channel`
    );
    return jsonOk({ templates: rows });
  } catch (err) {
    return jsonError("No se pudieron leer las plantillas", 500, String(err));
  }
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { code?: string; channel?: string; subject?: string | null; body?: string; active?: boolean }
    | null;
  if (!body?.code || !body.channel || !CHANNELS.includes(body.channel)) {
    return jsonError("Falta code o channel válido");
  }
  if (typeof body.body !== "string" || body.body.trim() === "") {
    return jsonError("El cuerpo no puede estar vacío");
  }
  try {
    const { rows } = await pool.query(
      `UPDATE notification_templates
          SET subject = $3, body = $4, active = COALESCE($5, active), updated_at = now()
        WHERE code = $1 AND channel = $2
        RETURNING id, code, channel, subject, body, description, active`,
      [body.code, body.channel, body.subject ?? null, body.body, body.active ?? null]
    );
    if (rows.length === 0) return jsonError("Plantilla no encontrada", 404);
    return jsonOk({ template: rows[0] });
  } catch (err) {
    return jsonError("No se pudo guardar la plantilla", 500, String(err));
  }
}
