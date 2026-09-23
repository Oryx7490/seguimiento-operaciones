import pool from "@/app/lib/db";
import { ServiceError } from "@/app/lib/services/errors";

export interface CreateTicketInput {
  title?: string;
  description?: string;
  ticket_type?: string;
  client_id?: string | null;
  location_id?: string | null;
  priority_id?: string | null;
  coordinator_id?: string | null;
  reported_by?: string;
  channel_id?: string | null;
}

export interface CreatedTicket {
  id: string;
  code: string;
  title: string;
  ticket_type: string;
  status: string;
  opened_at: string;
}

export async function createTicket(
  input: CreateTicketInput,
  actorId: string | null,
  reason = "Apertura de ticket"
): Promise<CreatedTicket> {
  const title = input.title?.trim();
  const description = input.description?.trim();
  const type = input.ticket_type === "internal" ? "internal" : "external";
  const reportedBy = input.reported_by?.trim();

  if (!title) throw new ServiceError("title es obligatorio");
  if (!description) throw new ServiceError("description es obligatorio");
  if (!reportedBy) throw new ServiceError("reported_by es obligatorio");
  if (type === "external" && !input.client_id) {
    throw new ServiceError("client es obligatorio para tickets externos");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let clientId = input.client_id || null;
    if (type === "internal") {
      const rgb = await client.query<{ id: string }>(
        `SELECT id FROM clients WHERE lower(trim(name)) = 'rgb' ORDER BY created_at LIMIT 1`
      );
      if (rgb.rows.length === 0) throw new ServiceError("No existe el cliente RGB para tickets internos");
      clientId = rgb.rows[0].id;
    }
    const codeRes = await client.query(
      `SELECT 'TK-' || lpad(nextval('ticket_code_seq')::text, 3, '0') AS code`
    );
    const ticketRes = await client.query<CreatedTicket>(
      `INSERT INTO tickets (code, title, description, ticket_type, client_id, location_id,
                            priority_id, coordinator_id, reported_by, channel_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, code, title, ticket_type, status, opened_at`,
      [
        codeRes.rows[0].code,
        title,
        description,
        type,
        clientId,
        input.location_id || null,
        input.priority_id || null,
        input.coordinator_id || null,
        reportedBy,
        input.channel_id || null,
        actorId,
      ]
    );
    if (actorId) {
      await client.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('ticket', $1, NULL, 'new', $2, $3)`,
        [ticketRes.rows[0].id, actorId, reason]
      );
    }
    await client.query("COMMIT");
    return ticketRes.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof ServiceError) throw err;
    throw new ServiceError("No se pudo crear el ticket", 500);
  } finally {
    client.release();
  }
}
