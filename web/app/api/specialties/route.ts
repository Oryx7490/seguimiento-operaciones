import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("all") === "true";
  const pending = searchParams.get("pending") === "true";
  try {
    if (pending) {
      const { rows } = await pool.query(
        `SELECT ts.technician_id, t.display_name, ts.specialty_id, s.name, ts.requested_at
           FROM technician_specialties ts
           JOIN technicians t ON t.id = ts.technician_id
           JOIN specialties s ON s.id = ts.specialty_id
          WHERE ts.status = 'pending'
          ORDER BY ts.requested_at`
      );
      return jsonOk({ proposals: rows });
    }

    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.active, s.created_at,
              (SELECT count(*) FROM technician_specialties ts
                WHERE ts.specialty_id = s.id AND ts.status = 'approved') AS technician_count
         FROM specialties s
         ${includeInactive ? "" : "WHERE s.active"}
        ORDER BY s.name`
    );
    return jsonOk({ specialties: rows });
  } catch (err) {
    return jsonError("No se pudieron leer las especialidades", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  const name = body.name?.trim();
  if (!name) return jsonError("name es obligatorio");

  try {
    const existing = await pool.query(
      `SELECT id, active FROM specialties WHERE lower(name) = lower($1)`,
      [name]
    );
    if (existing.rows.length > 0) {
      if (!existing.rows[0].active) {
        const { rows } = await pool.query(
          `UPDATE specialties SET active = true WHERE id = $1 RETURNING id, name, active`,
          [existing.rows[0].id]
        );
        return jsonOk({ specialty: rows[0], reactivated: true }, 200);
      }
      return jsonError("Ya existe una especialidad con ese nombre", 409);
    }
    const { rows } = await pool.query(
      `INSERT INTO specialties (name) VALUES ($1) RETURNING id, name, active, created_at`,
      [name]
    );
    return jsonOk({ specialty: rows[0] }, 201);
  } catch (err) {
    return jsonError("No se pudo crear la especialidad", 500, String(err));
  }
}
