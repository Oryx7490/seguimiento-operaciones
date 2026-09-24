import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

// PATCH → marcar/desmarcar facturación de un ticket con cobro.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }
  if (typeof body !== "object" || body === null) return jsonError("Cuerpo JSON inválido");

  const cols: string[] = [];
  const vals: (string | boolean | null)[] = [];

  if (body.invoice_generated !== undefined) {
    if (typeof body.invoice_generated !== "boolean") return jsonError("invoice_generated debe ser boolean");
    cols.push("invoice_generated"); vals.push(body.invoice_generated);
  }
  if (body.invoice_id !== undefined) {
    const v = body.invoice_id === null ? null : String(body.invoice_id).trim() || null;
    cols.push("invoice_id"); vals.push(v);
  }

  if (cols.length === 0) return jsonError("No hay campos para actualizar");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT id FROM tickets WHERE id = $1 FOR UPDATE`, [id]);
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("ticket no encontrado", 404);
    }
    // Asegura la fila de cierre antes del update.
    await client.query(
      `INSERT INTO ticket_closures (ticket_id) VALUES ($1) ON CONFLICT (ticket_id) DO NOTHING`,
      [id]
    );
    await client.query(
      `UPDATE ticket_closures SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")},
              authorized_at = COALESCE(authorized_at, now())
       WHERE ticket_id = $1`,
      [id, ...vals]
    );
    await client.query("COMMIT");
    return jsonOk({ saved: true });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo guardar la facturación", 500, String(err));
  } finally {
    client.release();
  }
}