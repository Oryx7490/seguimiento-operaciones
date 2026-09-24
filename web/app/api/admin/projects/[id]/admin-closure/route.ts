import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

async function getActorId(): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`
  );
  return rows[0]?.id ?? null;
}

const FLAGS = ["cobro", "facturacion", "evidencias", "finiquito", "complemento_fiscal"] as const;

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

  const sets: Record<string, boolean | string | null> = {};
  for (const key of FLAGS) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "boolean") return jsonError(`${key} debe ser boolean`);
      sets[key] = body[key];
    }
  }
  const note = body.note === undefined ? undefined : body.note === null ? null : String(body.note);
  if (note !== undefined) sets.note = note;

  if (Object.keys(sets).length === 0) return jsonError("No hay campos para actualizar");

  const actorId = await getActorId();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT id FROM projects WHERE id = $1 FOR UPDATE`, [id]);
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonError("proyecto no encontrado", 404);
    }

    const cols = Object.keys(sets);
    const vals = Object.values(sets);
    await client.query(
      `INSERT INTO project_admin_closure (project_id, ${cols.join(", ")}, updated_by)
       VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}, $${cols.length + 2})
       ON CONFLICT (project_id) DO UPDATE SET
         ${cols.map((col) => `\n           ${col} = EXCLUDED.${col}`).join(",")},
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [id, ...vals, actorId]
    );

    await client.query("COMMIT");
    return jsonOk({ saved: true });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo guardar el checklist de cierre", 500, String(err));
  } finally {
    client.release();
  }
}