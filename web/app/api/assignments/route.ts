import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function POST(req: NextRequest) {
  let body: {
    project_id?: string;
    ticket_id?: string;
    technician_id?: string;
    role?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const hasProject = Boolean(body.project_id);
  const hasTicket = Boolean(body.ticket_id);
  if (hasProject === hasTicket) return jsonError("Debes indicar exactamente uno: project_id o ticket_id");
  if (!body.technician_id) return jsonError("technician_id es obligatorio");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const okTech = await client.query(
      `SELECT id FROM technicians WHERE id = $1 AND active = true`,
      [body.technician_id]
    );
    if (okTech.rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("técnico no encontrado o inactivo");
    }

    if (hasProject) {
      const ok = await client.query(`SELECT id FROM projects WHERE id = $1`, [body.project_id]);
      if (ok.rows.length === 0) {
        await client.query("ROLLBACK");
        return jsonError("proyecto no encontrado", 404);
      }
    } else {
      const ok = await client.query(`SELECT id FROM tickets WHERE id = $1`, [body.ticket_id]);
      if (ok.rows.length === 0) {
        await client.query("ROLLBACK");
        return jsonError("ticket no encontrado", 404);
      }
    }

    if (hasProject) {
      await client.query(
        `UPDATE assignments SET unassigned_at = now()
         WHERE project_id = $1 AND technician_id = $2 AND unassigned_at IS NULL`,
        [body.project_id, body.technician_id]
      );
    } else {
      await client.query(
        `UPDATE assignments SET unassigned_at = now()
         WHERE ticket_id = $1 AND technician_id = $2 AND unassigned_at IS NULL`,
        [body.ticket_id, body.technician_id]
      );
    }

    const { rows } = await client.query(
      `INSERT INTO assignments (project_id, ticket_id, technician_id, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, project_id, ticket_id, technician_id, role, assigned_at`,
      [hasProject ? body.project_id : null, hasTicket ? body.ticket_id : null, body.technician_id, body.role?.trim() || null]
    );
    await client.query("COMMIT");
    return jsonOk({ assignment: rows[0] }, 201);
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo crear la asignación", 500, String(err));
  } finally {
    client.release();
  }
}