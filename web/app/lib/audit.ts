import type { Pool, PoolClient } from "pg";
import pool from "@/app/lib/db";
import { currentUser } from "@/app/lib/session";

/**
 * Bitácora de acciones.
 *
 * `status_history` solo guarda transiciones de estado; aquí queda todo lo demás
 * (crear, editar, eliminar, asignar, comentar, subir evidencia, inventariar).
 * Cada entrada guarda el usuario que la ejecutó y un resumen legible, para no
 * depender de joins al leerla.
 *
 * Los errores de escritura nunca deben tumbar la operación principal: si la
 * bitácora falla, la acción se conserva y el error solo se reporta en consola.
 */

export type Executor = Pool | PoolClient;

export interface AuditEntry {
  entity_type: string;
  entity_id?: string | null;
  entity_label?: string | null;
  action: string;
  summary: string;
  details?: Record<string, unknown>;
  project_id?: string | null;
  ticket_id?: string | null;
  /** Usuario acredited; por defecto el de la cookie. */
  actor_id?: string | null;
}

let warned = false;

export async function logActivity(executor: Executor, entry: AuditEntry): Promise<void> {
  try {
    let actorId = entry.actor_id ?? null;
    let actorName: string | null = null;
    let actorRole: string | null = null;
    if (actorId) {
      const { rows } = await executor.query(`SELECT name, role FROM users WHERE id = $1`, [actorId]);
      if (rows.length > 0) {
        actorName = rows[0].name;
        actorRole = rows[0].role;
      }
    } else {
      const user = await currentUser();
      actorId = user?.id ?? null;
      actorName = user?.name ?? null;
      actorRole = user?.role ?? null;
    }

    await executor.query(
      `INSERT INTO activity_log
         (entity_type, entity_id, entity_label, action, summary, details, project_id, ticket_id, actor_id, actor_name, actor_role)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)`,
      [
        entry.entity_type,
        entry.entity_id ?? null,
        entry.entity_label ?? null,
        entry.action,
        entry.summary,
        JSON.stringify(entry.details ?? {}),
        entry.project_id ?? null,
        entry.ticket_id ?? null,
        actorId,
        actorName,
        actorRole,
      ]
    );
  } catch (err) {
    if (!warned) {
      warned = true;
      console.error("[audit] no se pudo escribir la bitácora:", err);
    }
  }
}

/** Igual que `logActivity` pero sobre el pool principal (fuera de transacción). */
export function logActivityAsync(entry: AuditEntry): Promise<void> {
  return logActivity(pool, entry);
}

/** Lee entradas de la bitácora con filtros y paginación. */
export async function queryActivityLog(options: {
  entity_type?: string;
  entity_id?: string;
  action?: string;
  actor_id?: string;
  project_id?: string;
  ticket_id?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const where: string[] = [];
  const params: unknown[] = [];
  const push = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (options.entity_type) where.push(`entity_type = ${push(options.entity_type)}`);
  if (options.entity_id) where.push(`entity_id = ${push(options.entity_id)}`);
  if (options.action) where.push(`action = ${push(options.action)}`);
  if (options.actor_id) where.push(`actor_id = ${push(options.actor_id)}`);
  if (options.project_id) where.push(`project_id = ${push(options.project_id)}`);
  if (options.ticket_id) where.push(`ticket_id = ${push(options.ticket_id)}`);
  if (options.from) where.push(`created_at >= ${push(options.from)}::timestamptz`);
  if (options.to) where.push(`created_at <= ${push(options.to)}::timestamptz`);
  if (options.search) {
    const p = push(`%${options.search}%`);
    where.push(`(summary ILIKE ${p} OR entity_label ILIKE ${p} OR actor_name ILIKE ${p} OR details::text ILIKE ${p})`);
  }

  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const offset = Math.max(Number(options.offset) || 0, 0);

  const countResult = await pool.query(`SELECT count(*)::int AS total FROM activity_log ${clause}`, params);
  const rows = await pool.query(
    `SELECT id, entity_type, entity_id, entity_label, action, summary, details,
            project_id, ticket_id, actor_id, actor_name, actor_role, created_at
       FROM activity_log ${clause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${push(limit)} OFFSET ${push(offset)}`,
    params
  );

  return {
    entries: rows.rows,
    total: countResult.rows[0]?.total ?? 0,
    limit,
    offset,
  };
}
