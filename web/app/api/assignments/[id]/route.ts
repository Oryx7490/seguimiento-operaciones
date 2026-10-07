import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";
import { logActivityAsync } from "@/app/lib/audit";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `UPDATE assignments SET unassigned_at = now()
       WHERE id = $1 AND unassigned_at IS NULL
       RETURNING id, project_id, ticket_id, technician_id`,
      [id]
    );
    if (rows.length === 0) return jsonError("asignación no encontrada", 404);
    const row = rows[0];
    const tech = await pool.query<{ name: string }>(`SELECT name FROM technicians WHERE id = $1`, [row.technician_id]);
    const target = row.project_id
      ? await pool.query<{ code: string }>(`SELECT code FROM projects WHERE id = $1`, [row.project_id])
      : await pool.query<{ code: string }>(`SELECT code FROM tickets WHERE id = $1`, [row.ticket_id]);
    await logActivityAsync({
      entity_type: "assignment",
      entity_id: row.id,
      entity_label: target.rows[0]?.code ?? null,
      action: "unassign",
      summary: `${tech.rows[0]?.name ?? "Técnico"} quitado de ${row.project_id ? "proyecto" : "ticket"} ${target.rows[0]?.code ?? ""}`.trim(),
      details: { technician_id: row.technician_id },
      project_id: row.project_id ?? null,
      ticket_id: row.ticket_id ?? null,
    });
    return jsonOk({ unassigned: rows[0].id });
  } catch (err) {
    return jsonError("No se pudo quitar la asignación", 500, String(err));
  }
}