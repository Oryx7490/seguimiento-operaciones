import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.contact_name, c.contact_email, c.contact_phone, c.active,
              (SELECT count(*) FROM locations l WHERE l.client_id = c.id AND l.active) AS location_count,
              (SELECT count(*) FROM client_contacts cc WHERE cc.client_id = c.id AND cc.active) AS contacts_count,
              (SELECT count(*) FROM comments cm WHERE cm.client_id = c.id) AS comments_count,
              (SELECT count(DISTINCT a.id) FROM activities a
                 LEFT JOIN activity_projects ap ON ap.activity_id = a.id
                 LEFT JOIN projects p ON p.id = ap.project_id
                 LEFT JOIN tickets t ON t.id = a.ticket_id
                WHERE p.client_id = c.id OR t.client_id = c.id) AS activity_count
       FROM clients c ORDER BY c.name`
    );
    return jsonOk({ clients: rows });
  } catch (err) {
    return jsonError("No se pudieron leer los clientes", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const name = body.name?.trim();
  if (!name) return jsonError("name es obligatorio");

  try {
    const { rows } = await pool.query(
      `INSERT INTO clients (name, contact_name, contact_email, contact_phone, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, contact_name, contact_email, contact_phone, active`,
      [name, body.contact_name?.trim() ?? null, body.contact_email?.trim() ?? null, body.contact_phone?.trim() ?? null, body.active ?? true]
    );
    return jsonOk({ client: rows[0] }, 201);
  } catch (err) {
    return jsonError("No se pudo crear el cliente", 500, String(err));
  }
}