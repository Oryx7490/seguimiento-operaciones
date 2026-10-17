import pool from "@/app/lib/db";
import { getCurrentUserId, jsonError } from "@/app/lib/api";
import type { NextRequest } from "next/server";

export const EXPENSE_PHOTO_SECTION = "admin.gastos_fotos";

export async function requireExpensePhotoAccess(action: "view" | "update", request?: NextRequest) {
  const expectedWorkerToken = process.env.WORKER_TOKEN;
  if (action === "update" && expectedWorkerToken && request?.headers.get("x-worker-token") === expectedWorkerToken) {
    return { userId: null, response: null };
  }
  const userId = await getCurrentUserId();
  if (!userId) return { userId: null, response: jsonError("Se requiere una sesión", 401) };

  const column = action === "view" ? "can_view" : "can_update";
  const { rows } = await pool.query(
    `SELECT 1
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = $1 AND rp.section_key = $2 AND rp.${column} = true
      LIMIT 1`,
    [userId, EXPENSE_PHOTO_SECTION]
  );
  if (rows.length === 0) return { userId, response: jsonError("No tienes permiso para revisar gastos desde fotos", 403) };
  return { userId, response: null };
}

export const EXPENSE_PHOTO_CATEGORIES = [
  "factura",
  "ticket",
  "recibo",
  "hoja_servicio",
  "hoja_entrega",
  "orden_compra",
  "nota_gasto",
  "documento_general",
  "sin_documento",
  "otro",
] as const;

export function validDate(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
