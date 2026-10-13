import pool from "@/app/lib/db";
import { jsonOk, jsonError, parseId } from "@/app/lib/api";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT ps.id, ps.project_id, pr.code AS project_code, pr.name AS project_name,
              ps.screen_type, ps.quantity, ps.width_m, ps.height_m, ps.is_irregular, ps.area_m2, ps.pitch_mm,
              ps.environment, ps.voltage, ps.installed, ps.cancelled, ps.notes, ps.screen_catalog_id,
              ps.install_sort, ps.assembly_status
         FROM project_screens ps
         JOIN projects pr ON pr.id = ps.project_id
        WHERE ps.cancelled = false AND ps.installed = false
        ORDER BY ps.install_sort ASC NULLS LAST, pr.code, ps.screen_type`
    );
    return jsonOk({ screens: rows });
  } catch (err) {
    return jsonError("No se pudieron leer pantallas pendientes", 500, String(err));
  }
}

const ASSEMBLY_STATES = new Set(["to_assemble", "ready"]);

export async function PATCH(request: Request) {
  let body: { order?: unknown; states?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Cuerpo inválido");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Reordenamiento global de la lista de pendientes (V47).
    if (body.order !== undefined) {
      if (!Array.isArray(body.order) || body.order.length === 0) {
        await client.query("ROLLBACK");
        return jsonError("order debe ser una lista no vacía de identificadores");
      }
      const ids: string[] = [];
      for (const v of body.order) {
        if (typeof v !== "string" || !parseId(v)) {
          await client.query("ROLLBACK");
          return jsonError("Identificador de pantalla inválido en order");
        }
        ids.push(v);
      }
      if (new Set(ids).size !== ids.length) {
        await client.query("ROLLBACK");
        return jsonError("order tiene identificadores duplicados");
      }
      const { rows: existing } = await client.query(
        `SELECT id FROM project_screens WHERE id = ANY($1::uuid[])`,
        [ids]
      );
      if (existing.length !== ids.length) {
        await client.query("ROLLBACK");
        return jsonError("order incluye pantallas inexistentes");
      }
      for (let i = 0; i < ids.length; i++) {
        await client.query(`UPDATE project_screens SET install_sort = $2 WHERE id = $1`, [ids[i], i]);
      }
    }

    // Indicador de color (amarillo = por armar, verde = lista para instalar, null = sin marca).
    if (body.states !== undefined) {
      if (!Array.isArray(body.states) || body.states.length === 0) {
        await client.query("ROLLBACK");
        return jsonError("states debe ser una lista no vacía");
      }
      for (const st of body.states) {
        const id = (st as { id?: unknown })?.id;
        const raw = (st as { assembly_status?: unknown })?.assembly_status;
        if (typeof id !== "string" || !parseId(id)) {
          await client.query("ROLLBACK");
          return jsonError("Identificador de pantalla inválido en states");
        }
        const value = raw === null || raw === undefined || raw === "" ? null : String(raw);
        if (value !== null && !ASSEMBLY_STATES.has(value)) {
          await client.query("ROLLBACK");
          return jsonError("assembly_status inválido (usa 'to_assemble', 'ready' o null)");
        }
        await client.query(`UPDATE project_screens SET assembly_status = $2 WHERE id = $1`, [id, value]);
      }
    }

    if (body.order === undefined && body.states === undefined) {
      await client.query("ROLLBACK");
      return jsonError("Nada que actualizar (esperado order o states)");
    }

    await client.query("COMMIT");
    return jsonOk({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo actualizar la lista de pendientes", 500, String(err));
  } finally {
    client.release();
  }
}
