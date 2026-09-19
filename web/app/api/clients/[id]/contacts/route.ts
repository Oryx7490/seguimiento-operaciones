import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { getCurrentUserId, jsonOk, jsonError, parseId } from "@/app/lib/api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `SELECT cc.id, cc.client_id, cc.name, cc.position, cc.email, cc.phone, cc.active, cc.created_at, cc.updated_at
         FROM client_contacts cc JOIN clients c ON c.id = cc.client_id
        WHERE cc.client_id = $1 ORDER BY cc.active DESC, cc.name`,
      [id]
    );
    return jsonOk({ contacts: rows });
  } catch (err) {
    return jsonError("No se pudieron leer los contactos", 500, String(err));
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: { name?: string; position?: string | null; email?: string | null; phone?: string | null };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const name = body.name?.trim();
  if (!name) return jsonError("name es obligatorio");

  try {
    const actorId = await getCurrentUserId();
    const { rows } = await pool.query(
      `INSERT INTO client_contacts (client_id, name, position, email, phone, created_by)
       SELECT $1, $2, $3, $4, $5, $6
        WHERE EXISTS (SELECT 1 FROM clients WHERE id = $1)
       RETURNING id, client_id, name, position, email, phone, active, created_at, updated_at`,
      [id, name, body.position?.trim() || null, body.email?.trim() || null, body.phone?.trim() || null, actorId]
    );
    if (rows.length === 0) return jsonError("cliente no encontrado", 404);
    return jsonOk({ contact: rows[0] }, 201);
  } catch (err) {
    return jsonError("No se pudo crear el contacto", 500, String(err));
  }
}
