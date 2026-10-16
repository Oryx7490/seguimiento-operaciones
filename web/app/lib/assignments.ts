import type { PoolClient } from "pg";

/**
 * Asegura que cada técnico tenga una asignación activa al ticket.
 * Se usa cuando una actividad que atiende un ticket asigna técnicos: así el
 * ticket refleja que ya tiene una o más personas asignadas.
 * No quita asignaciones existentes (un técnico puede venir de otra actividad).
 * Devuelve cuántas asignaciones nuevas se crearon.
 */
export async function syncTicketAssignments(
  client: PoolClient,
  ticketId: string,
  technicianIds: string[],
  role = "técnico"
): Promise<number> {
  let added = 0;
  for (const technicianId of technicianIds) {
    const existing = await client.query(
      `SELECT 1 FROM assignments
        WHERE ticket_id = $1 AND technician_id = $2 AND unassigned_at IS NULL
        LIMIT 1`,
      [ticketId, technicianId]
    );
    if ((existing.rowCount ?? 0) === 0) {
      await client.query(
        `INSERT INTO assignments (ticket_id, technician_id, role) VALUES ($1, $2, $3)`,
        [ticketId, technicianId, role]
      );
      added++;
    }
  }
  return added;
}
