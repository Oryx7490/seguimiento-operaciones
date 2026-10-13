import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(["pending", "approved", "rejected", "registered"]);

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const status = sp.get("status")?.trim() || "pending";
  const from = sp.get("from")?.trim() || null;
  const to = sp.get("to")?.trim() || null;
  const technicianId = sp.get("technician_id")?.trim() || null;
  const limitRaw = Number(sp.get("limit"));
  const offsetRaw = Number(sp.get("offset"));
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 60;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;

  if (status !== "all" && !STATUSES.has(status)) return jsonError("status inválido");
  if (from && !DATE_RE.test(from)) return jsonError("from inválido");
  if (to && !DATE_RE.test(to)) return jsonError("to inválido");

  const where: string[] = [];
  const vals: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    vals.push(value);
    where.push(clause.replaceAll("$N", `$${vals.length}`));
  };
  if (status !== "all") add("c.status = $N", status);
  if (from) add("c.event_date >= $N::date", from);
  if (to) add("c.event_date <= $N::date", to);
  if (technicianId) {
    const tid = parseId(technicianId);
    if (!tid) return jsonError("technician_id inválido");
    add("c.technician_id = $N::uuid", tid);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  vals.push(limit, offset);

  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.sha256, c.sender_id, c.sender_display_name, c.technician_id, t.display_name AS technician_name,
              c.match_status, c.match_source, c.event_type,
              to_char(c.event_date, 'YYYY-MM-DD') AS event_date,
              to_char(c.event_time, 'HH24:MI:SS') AS event_time,
              to_char(c.shift_in, 'HH24:MI:SS') AS shift_in,
              to_char(c.shift_out, 'HH24:MI:SS') AS shift_out,
              c.worked_hours, c.location, c.app, c.code, c.confidence, c.ambiguity, c.status, c.created_at,
              (SELECT m.body_text FROM whatsapp_capture.message_media mm
                 JOIN whatsapp_capture.messages m ON m.id = mm.message_id
                WHERE mm.id = c.message_media_id) AS caption,
              count(*) OVER() AS total
         FROM attendance_candidates c
         LEFT JOIN technicians t ON t.id = c.technician_id
         ${whereSql}
        ORDER BY c.event_date DESC NULLS LAST, c.created_at DESC
        LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
      vals
    );
    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    const items = rows.map(({ total: _t, ...r }) => r);
    return jsonOk({ items, total, limit, offset });
  } catch (err) {
    return jsonError("No se pudieron leer los candidatos de asistencia", 500, String(err));
  }
}
