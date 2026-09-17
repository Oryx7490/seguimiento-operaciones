import pool from "@/app/lib/db";
import { ServiceError } from "@/app/lib/services/errors";

export interface PhaseInput {
  name?: string;
  catalog_phase_id?: string | null;
  sort_order?: number;
  owner_id?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
}

export interface CreateProjectInput {
  name?: string;
  client_id?: string | null;
  location_id?: string | null;
  priority_id?: string | null;
  coordinator_id?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  phases?: PhaseInput[];
}

export interface CreatedProject {
  id: string;
  code: string;
  name: string;
  status: string;
  health_status: string;
  created_at: string;
}

export async function createProject(
  input: CreateProjectInput,
  actorId: string | null,
  reason = "Alta de proyecto"
): Promise<CreatedProject> {
  const name = input.name?.trim();
  if (!name) throw new ServiceError("name es obligatorio");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const codeRes = await client.query(
      `SELECT 'PR-' || lpad(nextval('project_code_seq')::text, 3, '0') AS code`
    );
    const projectRes = await client.query<CreatedProject>(
      `INSERT INTO projects (code, name, client_id, location_id, priority_id, coordinator_id,
                             planned_start_date, planned_end_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, code, name, status, health_status, created_at`,
      [
        codeRes.rows[0].code,
        name,
        input.client_id || null,
        input.location_id || null,
        input.priority_id || null,
        input.coordinator_id || null,
        input.planned_start_date || null,
        input.planned_end_date || null,
        actorId,
      ]
    );
    const projectId = projectRes.rows[0].id;

    let phases: PhaseInput[] | undefined = input.phases;
    if (!phases || phases.length === 0) {
      const catalog = await client.query<{ id: string; name: string; sort_order: number }>(
        `SELECT id, name, sort_order FROM phase_catalog WHERE active = true ORDER BY sort_order`
      );
      phases = catalog.rows.map((r) => ({
        catalog_phase_id: r.id,
        name: r.name,
        sort_order: r.sort_order,
      }));
    }
    for (const [idx, ph] of (phases ?? []).entries()) {
      const phName = ph.name?.trim();
      if (!phName) throw new ServiceError("Cada fase debe tener un nombre");
      await client.query(
        `INSERT INTO project_phases (project_id, name, catalog_phase_id, sort_order, owner_id,
                                     planned_start_date, planned_end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          projectId,
          phName,
          ph.catalog_phase_id || null,
          ph.sort_order ?? idx + 1,
          ph.owner_id || null,
          ph.planned_start_date || null,
          ph.planned_end_date || null,
        ]
      );
    }

    if (actorId) {
      await client.query(
        `INSERT INTO status_history (entity_type, entity_id, from_status, to_status, changed_by, reason)
         VALUES ('project', $1, NULL, 'new', $2, $3)`,
        [projectId, actorId, reason]
      );
    }

    await client.query("COMMIT");
    return projectRes.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof ServiceError) throw err;
    throw new ServiceError("No se pudo crear el proyecto", 500);
  } finally {
    client.release();
  }
}
