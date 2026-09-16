import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk } from "@/app/lib/api";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT key, value, description, updated_at FROM app_settings ORDER BY key`
    );
    return jsonOk({ settings: rows });
  } catch (err) {
    return jsonError("No se pudo leer la configuración", 500, String(err));
  }
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { values?: Record<string, unknown> }
    | null;
  if (!body?.values || typeof body.values !== "object") {
    return jsonError("Formato inválido");
  }
  const keys = Object.keys(body.values);
  if (keys.length === 0) return jsonError("Sin cambios");

  const { rows: known } = await pool.query<{ key: string }>(
    `SELECT key FROM app_settings WHERE key = ANY($1::text[])`,
    [keys]
  );
  const knownSet = new Set(known.map((k) => k.key));
  const unknown = keys.filter((k) => !knownSet.has(k));
  if (unknown.length > 0) return jsonError(`Parámetros desconocidos: ${unknown.join(", ")}`);

  try {
    for (const key of keys) {
      await pool.query(
        `UPDATE app_settings SET value = $2::jsonb, updated_at = now() WHERE key = $1`,
        [key, JSON.stringify(body.values[key])]
      );
    }
    const { rows } = await pool.query(
      `SELECT key, value, description, updated_at FROM app_settings ORDER BY key`
    );
    return jsonOk({ settings: rows });
  } catch (err) {
    return jsonError("No se pudo guardar la configuración", 500, String(err));
  }
}
