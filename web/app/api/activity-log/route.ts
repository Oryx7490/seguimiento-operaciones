import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk } from "@/app/lib/api";
import { queryActivityLog } from "@/app/lib/audit";
import { currentUser } from "@/app/lib/session";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const me = await currentUser();

  const { rows: facets } = await pool.query(
    `SELECT action, count(*)::int AS total FROM activity_log GROUP BY action ORDER BY total DESC`
  );
  const { rows: actors } = await pool.query(
    `SELECT DISTINCT actor_id, actor_name FROM activity_log
      WHERE actor_id IS NOT NULL ORDER BY actor_name`
  );

  try {
    const result = await queryActivityLog({
      entity_type: params.get("entity_type") || undefined,
      entity_id: params.get("entity_id") || undefined,
      action: params.get("action") || undefined,
      actor_id: params.get("actor_id") || undefined,
      project_id: params.get("project_id") || undefined,
      ticket_id: params.get("ticket_id") || undefined,
      search: params.get("q") || undefined,
      from: params.get("from") || undefined,
      to: params.get("to") || undefined,
      limit: params.has("limit") ? Number(params.get("limit")) : undefined,
      offset: params.has("offset") ? Number(params.get("offset")) : undefined,
    });

    return jsonOk({
      ...result,
      me: me ? { id: me.id, name: me.name } : null,
      filters: {
        actions: facets.map((f) => ({ value: f.action, total: f.total })),
        actors: actors.map((a) => ({ id: a.actor_id, name: a.actor_name })),
      },
    });
  } catch (err) {
    return jsonError("No se pudo leer la bitácora", 500, String(err));
  }
}
