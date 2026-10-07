import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId } from "@/app/lib/api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!parseId(id)) return jsonError("id inválido");
  try {
    const { rows } = await pool.query(
      `SELECT il.id, il.manufacturer_brand, il.lot_number, il.module_count,
              il.location, il.width_mm, il.height_mm, il.status,
              ((COALESCE(il.width_mm, 320) * COALESCE(il.height_mm, 160)) / 1000000)::text AS module_m2_exact,
              COALESCE(SUM(CASE WHEN pml.project_id <> $1 THEN COALESCE(pml.module_count, 0) ELSE 0 END), 0)::int AS used_elsewhere
         FROM inventory_lots il
         LEFT JOIN project_closure_module_lots pml
           ON LOWER(pml.manufacturer_brand) = LOWER(il.manufacturer_brand)
          AND LOWER(pml.lot_number) = LOWER(il.lot_number)
        WHERE il.status = 'available'
           OR EXISTS (
                SELECT 1 FROM project_closure_module_lots own
                 WHERE own.project_id = $1
                   AND LOWER(own.manufacturer_brand) = LOWER(il.manufacturer_brand)
                   AND LOWER(own.lot_number) = LOWER(il.lot_number)
              )
        GROUP BY il.id, il.manufacturer_brand, il.lot_number, il.module_count,
                 il.location, il.width_mm, il.height_mm, il.status
        ORDER BY il.manufacturer_brand, il.lot_number`,
      [id],
    );
    return jsonOk({
      inventory: rows.map((row) => {
        const unitM2 = (Number(row.width_mm ?? 320) * Number(row.height_mm ?? 160)) / 1_000_000;
        const availableModules = Math.max(0, Number(row.module_count) - Number(row.used_elsewhere));
        return {
          ...row,
          module_count: Number(row.module_count),
          used_elsewhere: Number(row.used_elsewhere),
          available_modules: availableModules,
          module_m2: unitM2,
          module_m2_exact: String(row.module_m2_exact ?? unitM2),
          used_m2: Number(row.used_elsewhere) * unitM2,
          available_m2: availableModules * unitM2,
        };
      }),
    });
  } catch (err) {
    return jsonError("No se pudo leer el inventario disponible para el cierre", 500, String(err));
  }
}
