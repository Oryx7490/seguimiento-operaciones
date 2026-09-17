import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, uniqueViolation } from "@/app/lib/api";

const KINDS = ["official", "discretionary"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const year = new URL(req.url).searchParams.get("year");
  const params: unknown[] = [];
  let where = "";
  if (year) {
    if (!/^\d{4}$/.test(year)) return jsonError("year inválido");
    params.push(Number(year));
    where = `WHERE day >= make_date($1, 1, 1) AND day <= make_date($1, 12, 31)`;
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, to_char(day, 'YYYY-MM-DD') AS day, name, kind, active, notes, created_at, updated_at
         FROM non_working_days
         ${where}
        ORDER BY day`,
      params
    );
    return jsonOk({ days: rows });
  } catch (err) {
    return jsonError("No se pudieron leer los días no laborables", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: { day?: string; name?: string; kind?: string; notes?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const day = body.day?.trim();
  const name = body.name?.trim();
  const kind = body.kind ?? "discretionary";
  if (!day || !DATE_RE.test(day)) return jsonError("Fecha inválida (formato AAAA-MM-DD)");
  if (!name) return jsonError("El nombre es obligatorio");
  if (!KINDS.includes(kind)) return jsonError("Tipo inválido");

  try {
    const { rows } = await pool.query(
      `INSERT INTO non_working_days (day, name, kind, notes, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, to_char(day, 'YYYY-MM-DD') AS day, name, kind, active, notes, created_at, updated_at`,
      [day, name, kind, body.notes?.trim() || null, body.active ?? true]
    );
    return jsonOk({ day: rows[0] }, 201);
  } catch (err) {
    if (uniqueViolation(err)) return jsonError("Ya existe un día no laborable con esa fecha");
    return jsonError("No se pudo crear el día no laborable", 500, String(err));
  }
}
