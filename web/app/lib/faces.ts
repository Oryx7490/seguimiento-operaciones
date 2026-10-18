import type { PoolClient } from "pg";

/** Identidad facial del técnico (la crea si no existe). */
export async function ensureIdentityForTechnician(client: PoolClient, technicianId: string): Promise<string | null> {
  const found = await client.query(`SELECT id FROM whatsapp_capture.face_identities WHERE technician_id = $1 LIMIT 1`, [technicianId]);
  if (found.rowCount) return found.rows[0].id;
  const tech = await client.query(`SELECT display_name FROM technicians WHERE id = $1`, [technicianId]);
  if (tech.rowCount === 0) return null;
  const created = await client.query(
    `INSERT INTO whatsapp_capture.face_identities (display_name, technician_id) VALUES ($1, $2) RETURNING id`,
    [tech.rows[0].display_name, technicianId]
  );
  return created.rows[0].id;
}

/** Asigna un rostro a una identidad como etiqueta manual (entra al entrenamiento). */
export async function assignFaceToIdentity(client: PoolClient, faceId: string, identityId: string, actorId: string | null) {
  await client.query(
    `INSERT INTO whatsapp_capture.face_assignments (face_id, identity_id, source, confidence, reviewed_by, updated_at)
     VALUES ($1, $2, 'manual', NULL, $3, now())
     ON CONFLICT (face_id) DO UPDATE
       SET identity_id = EXCLUDED.identity_id, source = 'manual', confidence = NULL,
           reviewed_by = EXCLUDED.reviewed_by, updated_at = now()`,
    [faceId, identityId, actorId]
  );
}

/**
 * Aprende los rostros detectados en una foto para el técnico indicado.
 * Se usa al aprobar una actividad/asistencia: así la selección alimenta el
 * entrenamiento diario. Devuelve cuántos rostros se etiquetaron.
 */
export async function learnFacesForSha(client: PoolClient, sha256: string, technicianId: string, actorId: string | null): Promise<number> {
  const faces = await client.query(`SELECT id FROM whatsapp_capture.faces WHERE sha256 = $1`, [sha256]);
  if (faces.rowCount === 0) return 0;
  const identityId = await ensureIdentityForTechnician(client, technicianId);
  if (!identityId) return 0;
  for (const f of faces.rows as { id: string }[]) {
    await assignFaceToIdentity(client, f.id, identityId, actorId);
  }
  return faces.rowCount ?? 0;
}
