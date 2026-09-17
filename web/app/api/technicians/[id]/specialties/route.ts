import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

async function technicianExists(id: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM technicians WHERE id = $1`, [id]);
  return rows.length > 0;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `SELECT s.id AS specialty_id, s.name, s.active, ts.status, ts.requested_at
         FROM technician_specialties ts
         JOIN specialties s ON s.id = ts.specialty_id
        WHERE ts.technician_id = $1
        ORDER BY s.name`,
      [id]
    );
    return jsonOk({ specialties: rows });
  } catch (err) {
    return jsonError("No se pudieron leer las habilidades", 500, String(err));
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: { specialty_id?: string; name?: string; approve?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  try {
    if (!(await technicianExists(id))) return jsonError("técnico no encontrado", 404);

    let specialtyId = body.specialty_id && parseId(body.specialty_id) ? body.specialty_id : null;
    const name = body.name?.trim();
    const fromCatalog = Boolean(specialtyId);

    if (!specialtyId && !name) return jsonError("Indica specialty_id o name");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let createdNew = false;
      if (!specialtyId && name) {
        const existing = await client.query(
          `SELECT id FROM specialties WHERE lower(name) = lower($1)`,
          [name]
        );
        if (existing.rows.length > 0) {
          specialtyId = existing.rows[0].id;
        } else {
          const created = await client.query(
            `INSERT INTO specialties (name) VALUES ($1) RETURNING id`,
            [name]
          );
          specialtyId = created.rows[0].id;
          createdNew = true;
        }
      }

      // Del catálogo se aprueba directo; una propuesta nueva del técnico queda pendiente.
      const status = body.approve === true || fromCatalog || !createdNew ? "approved" : "pending";
      const { rows } = await client.query(
        `INSERT INTO technician_specialties (technician_id, specialty_id, status, reviewed_by, reviewed_at)
         VALUES ($1, $2, $3, CASE WHEN $3 = 'approved' THEN $4::uuid ELSE NULL END,
                 CASE WHEN $3 = 'approved' THEN now() ELSE NULL END)
         ON CONFLICT (technician_id, specialty_id)
         DO UPDATE SET status = EXCLUDED.status,
                       reviewed_by = EXCLUDED.reviewed_by,
                       reviewed_at = EXCLUDED.reviewed_at
         RETURNING technician_id, specialty_id, status`,
        [id, specialtyId, status, null]
      );
      await client.query("COMMIT");
      return jsonOk({ assignment: rows[0] }, 201);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return jsonError("No se pudo agregar la habilidad", 500, String(err));
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: { specialty_id?: string; status?: string; reviewed_by?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const specialtyId = body.specialty_id && parseId(body.specialty_id) ? body.specialty_id : null;
  if (!specialtyId) return jsonError("specialty_id inválido");
  if (body.status !== "approved" && body.status !== "pending") {
    return jsonError("status inválido");
  }

  const reviewedBy = body.reviewed_by && parseId(body.reviewed_by) ? body.reviewed_by : null;

  try {
    const { rows } = await pool.query(
      `UPDATE technician_specialties
          SET status = $3,
              reviewed_by = CASE WHEN $3 = 'approved' THEN $4::uuid ELSE NULL END,
              reviewed_at = CASE WHEN $3 = 'approved' THEN now() ELSE NULL END
        WHERE technician_id = $1 AND specialty_id = $2
        RETURNING technician_id, specialty_id, status`,
      [id, specialtyId, body.status, reviewedBy]
    );
    if (rows.length === 0) return jsonError("habilidad no encontrada", 404);
    return jsonOk({ assignment: rows[0] });
  } catch (err) {
    return jsonError("No se pudo actualizar la habilidad", 500, String(err));
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  const specialtyId = new URL(req.url).searchParams.get("specialty_id");
  if (!specialtyId || !parseId(specialtyId)) return jsonError("specialty_id inválido");

  try {
    const { rows } = await pool.query(
      `DELETE FROM technician_specialties
        WHERE technician_id = $1 AND specialty_id = $2
        RETURNING specialty_id`,
      [id, specialtyId]
    );
    if (rows.length === 0) return jsonError("habilidad no encontrada", 404);
    return jsonOk({ removed: rows[0].specialty_id });
  } catch (err) {
    return jsonError("No se pudo quitar la habilidad", 500, String(err));
  }
}
