import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId, getCurrentUserId } from "@/app/lib/api";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(["justificada", "injustificada", "incapacidad", "asueto", "permiso", "vacaciones"]);

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from")?.trim() || null;
  const to = sp.get("to")?.trim() || null;
  if (from && !DATE_RE.test(from)) return jsonError("from inválido");
  if (to && !DATE_RE.test(to)) return jsonError("to inválido");

  const where: string[] = [];
  const vals: unknown[] = [];
  if (from) {
    vals.push(from);
    where.push(`date >= $${vals.length}::date`);
  }
  if (to) {
    vals.push(to);
    where.push(`date <= $${vals.length}::date`);
  }

  try {
    const { rows } = await pool.query(
      `SELECT technician_id, to_char(date,'YYYY-MM-DD') AS date, kind, notes
         FROM attendance_absences
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY date, technician_id`,
      vals
    );
    return jsonOk({ absences: rows });
  } catch (err) {
    return jsonError("No se pudieron leer las incidencias", 500, String(err));
  }
}

export async function PUT(request: NextRequest) {
  let body: { technician_id?: string; date?: string; kind?: string; notes?: string | null };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }
  const technicianId = body.technician_id ? parseId(body.technician_id) : null;
  if (!technicianId) return jsonError("technician_id inválido");
  const date = body.date ?? "";
  if (!DATE_RE.test(date)) return jsonError("date inválida");
  const kind = body.kind ?? "";
  if (!KINDS.has(kind)) return jsonError("kind inválido");

  try {
    const actor = await getCurrentUserId();
    const { rows } = await pool.query(
      `INSERT INTO attendance_absences (technician_id, date, kind, notes, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (technician_id, date) DO UPDATE
         SET kind = EXCLUDED.kind, notes = EXCLUDED.notes, updated_at = now()
       RETURNING technician_id, to_char(date,'YYYY-MM-DD') AS date, kind, notes`,
      [technicianId, date, kind, body.notes?.trim() || null, actor]
    );
    return jsonOk({ absence: rows[0] });
  } catch (err) {
    return jsonError("No se pudo guardar la incidencia", 500, String(err));
  }
}

export async function DELETE(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const technicianId = sp.get("technician_id") ? parseId(sp.get("technician_id") as string) : null;
  const date = sp.get("date")?.trim() || "";
  if (!technicianId) return jsonError("technician_id inválido");
  if (!DATE_RE.test(date)) return jsonError("date inválida");
  try {
    await pool.query(`DELETE FROM attendance_absences WHERE technician_id = $1 AND date = $2::date`, [technicianId, date]);
    return jsonOk({ deleted: true });
  } catch (err) {
    return jsonError("No se pudo eliminar la incidencia", 500, String(err));
  }
}
