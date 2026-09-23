import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("client_id");
  let q = `SELECT l.id, l.client_id, l.name, l.address, l.city, l.site_contact, l.active,
                  c.name AS client_name
           FROM locations l LEFT JOIN clients c ON c.id = l.client_id
           WHERE l.active = true`;
  const values: unknown[] = [];
  if (clientId) {
    q += ` AND l.client_id = $1`;
    values.push(clientId);
  }
  q += ` ORDER BY c.name NULLS LAST, l.name`;
  try {
    const { rows } = await pool.query(q, values);
    return jsonOk({ locations: rows });
  } catch (err) {
    return jsonError("No se pudieron leer las ubicaciones", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: {
    client_id?: string;
    name?: string;
    address?: string;
    city?: string;
    site_contact?: string;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const name = body.name?.trim();
  if (!name) return jsonError("name es obligatorio");

  const clientId = body.client_id !== undefined && body.client_id !== null ? body.client_id.trim() : null;
  if (clientId && !parseUuid(clientId)) return jsonError("client_id inválido");

  try {
    if (clientId) {
      const exists = await pool.query(`SELECT id FROM clients WHERE id = $1`, [clientId]);
      if (exists.rows.length === 0) return jsonError("cliente no encontrado", 404);
    }
    const { rows } = await pool.query(
      `INSERT INTO locations (client_id, name, address, city, site_contact, active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, client_id, name, address, city, site_contact, active`,
      [clientId, name, body.address?.trim() ?? null, body.city?.trim() ?? null, body.site_contact?.trim() ?? null, body.active ?? true]
    );
    return jsonOk({ location: rows[0] }, 201);
  } catch (err) {
    return jsonError("No se pudo crear la ubicación", 500, String(err));
  }
}

function parseUuid(id: string): string | null {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRe.test(id) ? id : null;
}