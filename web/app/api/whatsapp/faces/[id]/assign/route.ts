import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId, getCurrentUserId } from "@/app/lib/api";

export const runtime = "nodejs";

async function loadFace(faceId: string) {
  const { rows } = await pool.query(
    `SELECT f.id, f.sha256, fa.identity_id, fa.source, fa.confidence,
            fi.display_name, fi.technician_id, fi.user_id
       FROM whatsapp_capture.faces f
       LEFT JOIN whatsapp_capture.face_assignments fa ON fa.face_id = f.id
       LEFT JOIN whatsapp_capture.face_identities fi ON fi.id = fa.identity_id
      WHERE f.id = $1`,
    [faceId]
  );
  return rows[0] ?? null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");

  let body: { technician_id?: unknown; user_id?: unknown; display_name?: unknown; identity_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }

  const identityIdParam = typeof body.identity_id === "string" ? parseId(body.identity_id) : null;
  const technicianId = typeof body.technician_id === "string" ? parseId(body.technician_id) : null;
  const userId = typeof body.user_id === "string" ? parseId(body.user_id) : null;
  let displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";

  if (!identityIdParam && !technicianId && !userId && !displayName) {
    return jsonError("Indica identity_id, technician_id, user_id o display_name");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const face = await client.query(`SELECT id FROM whatsapp_capture.faces WHERE id = $1`, [id]);
    if (face.rowCount === 0) {
      await client.query("ROLLBACK");
      return jsonError("Rostro no encontrado", 404);
    }

    // Corrección directa a una identidad existente (p. ej. desde la auditoría de entrenamiento).
    if (identityIdParam) {
      const idn = await client.query(`SELECT id FROM whatsapp_capture.face_identities WHERE id = $1`, [identityIdParam]);
      if (idn.rowCount === 0) {
        await client.query("ROLLBACK");
        return jsonError("Identidad no encontrada", 404);
      }
      const reviewer = await getCurrentUserId();
      await client.query(
        `INSERT INTO whatsapp_capture.face_assignments (face_id, identity_id, source, confidence, reviewed_by, updated_at)
         VALUES ($1, $2, 'manual', NULL, $3, now())
         ON CONFLICT (face_id) DO UPDATE
           SET identity_id = EXCLUDED.identity_id, source = 'manual', confidence = NULL,
               reviewed_by = EXCLUDED.reviewed_by, updated_at = now()`,
        [id, identityIdParam, reviewer]
      );
      await client.query("COMMIT");
      return jsonOk({ face: await loadFace(id) });
    }

    if (technicianId) {
      const t = await client.query(`SELECT display_name FROM technicians WHERE id = $1`, [technicianId]);
      if (t.rowCount === 0) {
        await client.query("ROLLBACK");
        return jsonError("Técnico no encontrado", 404);
      }
      displayName = displayName || t.rows[0].display_name;
    } else if (userId) {
      const u = await client.query(`SELECT name FROM users WHERE id = $1`, [userId]);
      if (u.rowCount === 0) {
        await client.query("ROLLBACK");
        return jsonError("Usuario no encontrado", 404);
      }
      displayName = displayName || u.rows[0].name;
    }

    // Reutiliza la identidad existente del técnico/usuario, o la crea.
    let identityId: string;
    const found = await client.query(
      `SELECT id FROM whatsapp_capture.face_identities
        WHERE ($1::uuid IS NOT NULL AND technician_id = $1)
           OR ($2::uuid IS NOT NULL AND user_id = $2)
           OR (display_name = $3)
        LIMIT 1`,
      [technicianId, userId, displayName]
    );
    if (found.rowCount && found.rowCount > 0) {
      identityId = found.rows[0].id;
      await client.query(
        `UPDATE whatsapp_capture.face_identities
            SET display_name = $2,
                technician_id = COALESCE($3, technician_id),
                user_id = COALESCE($4, user_id),
                updated_at = now()
          WHERE id = $1`,
        [identityId, displayName, technicianId, userId]
      );
    } else {
      const created = await client.query(
        `INSERT INTO whatsapp_capture.face_identities (display_name, technician_id, user_id)
         VALUES ($1, $2, $3) RETURNING id`,
        [displayName, technicianId, userId]
      );
      identityId = created.rows[0].id;
    }

    const reviewer = await getCurrentUserId();
    await client.query(
      `INSERT INTO whatsapp_capture.face_assignments (face_id, identity_id, source, confidence, reviewed_by, updated_at)
       VALUES ($1, $2, 'manual', NULL, $3, now())
       ON CONFLICT (face_id) DO UPDATE
         SET identity_id = EXCLUDED.identity_id, source = 'manual', confidence = NULL,
             reviewed_by = EXCLUDED.reviewed_by, updated_at = now()`,
      [id, identityId, reviewer]
    );

    await client.query("COMMIT");
    return jsonOk({ face: await loadFace(id) });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo asignar el rostro", 500, String(err));
  } finally {
    client.release();
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    await pool.query(`DELETE FROM whatsapp_capture.face_assignments WHERE face_id = $1`, [id]);
    return jsonOk({ face: await loadFace(id) });
  } catch (err) {
    return jsonError("No se pudo quitar la asignación", 500, String(err));
  }
}
