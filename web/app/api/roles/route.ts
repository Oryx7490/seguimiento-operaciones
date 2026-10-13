import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";
import { currentUserId } from "@/app/lib/session";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return jsonError("No hay usuario activo", 401);
  const { rows } = await pool.query(
    `SELECT id, code, name, description, is_system, created_at, updated_at
       FROM roles
      ORDER BY name`
  );
  return jsonOk({ roles: rows });
}
