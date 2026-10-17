import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk } from "@/app/lib/api";
import { requireExpensePhotoAccess } from "@/app/lib/expense-photo-review";

const DESTINATION_TYPES = new Set(["project", "ticket", "maintenance_policy"]);
type DestinationRow = { [key: string]: string | null; id: string; code: string | null; title: string; status: string; context: string | null };

export async function GET(request: NextRequest) {
  const access = await requireExpensePhotoAccess("view");
  if (access.response) return access.response;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const type = request.nextUrl.searchParams.get("type") ?? "project";
  if (!DESTINATION_TYPES.has(type)) return jsonError("type inválido");
  if (q.length < 2) return jsonOk({ items: [] });

  const pattern = `%${q}%`;
  try {
    let rows: DestinationRow[];
    if (type === "project") {
      const result = await pool.query<DestinationRow>(
        `SELECT p.id, p.code, p.name AS title, p.status,
                concat_ws(' · ', c.name, l.name) AS context
           FROM projects p
           LEFT JOIN clients c ON c.id = p.client_id
           LEFT JOIN locations l ON l.id = p.location_id
          WHERE p.status NOT IN ('closed', 'cancelled')
            AND (p.code ILIKE $1 OR p.name ILIKE $1 OR c.name ILIKE $1 OR l.name ILIKE $1)
          ORDER BY CASE WHEN p.code ILIKE $2 THEN 0 WHEN p.name ILIKE $2 THEN 1 ELSE 2 END,
                   p.planned_start_date NULLS LAST, p.code
          LIMIT 5`,
        [pattern, q]
      );
      rows = result.rows;
    } else if (type === "ticket") {
      const result = await pool.query<DestinationRow>(
        `SELECT t.id, t.code, t.title, t.status,
                concat_ws(' · ', COALESCE(c.name, CASE WHEN t.ticket_type = 'internal' THEN 'RGB' END), l.name) AS context
           FROM tickets t
           LEFT JOIN clients c ON c.id = t.client_id
           LEFT JOIN locations l ON l.id = t.location_id
          WHERE t.status <> 'cancelled' AND t.archived_at IS NULL
            AND (t.code ILIKE $1 OR t.title ILIKE $1 OR t.description ILIKE $1 OR c.name ILIKE $1 OR l.name ILIKE $1)
          ORDER BY CASE WHEN t.code ILIKE $2 THEN 0 WHEN t.title ILIKE $2 THEN 1 ELSE 2 END,
                   t.opened_at DESC, t.code
          LIMIT 5`,
        [pattern, q]
      );
      rows = result.rows;
    } else {
      const result = await pool.query<DestinationRow>(
        `SELECT p.id, NULL::text AS code, p.name AS title, p.status,
                concat_ws(' · ', c.name, l.name) AS context
           FROM maintenance_policies p
           JOIN clients c ON c.id = p.client_id
           LEFT JOIN locations l ON l.id = p.location_id
          WHERE p.name ILIKE $1 OR c.name ILIKE $1 OR l.name ILIKE $1 OR p.description ILIKE $1
          ORDER BY CASE WHEN p.status = 'active' THEN 0 WHEN p.status = 'paused' THEN 1 ELSE 2 END,
                   p.start_date DESC NULLS LAST, c.name, p.name
          LIMIT 5`,
        [pattern]
      );
      rows = result.rows;
    }
    return jsonOk({ items: rows.map((row) => ({ ...row, type })) });
  } catch (err) {
    return jsonError("No se pudieron buscar proyectos, tickets o pólizas", 500, String(err));
  }
}
