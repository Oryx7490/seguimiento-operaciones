import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

// Pipeline de cierre de tickets: los que están listos para cerrar
// (resuelto / pendiente validación) más los que generaron cobro y aún
// no se facturan, para revisión administrativa antes de cerrar/cobrar.
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.code, t.title, t.ticket_type, t.status,
              c.name AS client_name,
              u.name AS coordinator_name,
              t.resolved_at, t.closed_at, t.updated_at,
              COALESCE(tc.billable, false)      AS billable,
              COALESCE(tc.warranty, false)      AS warranty,
              COALESCE(tc.client_resolved, false) AS client_resolved,
              COALESCE(tc.billing_authorized, false) AS billing_authorized,
              tc.charge_amount,
              tc.charge_description,
              COALESCE(tc.invoice_generated, false) AS invoice_generated,
              tc.invoice_id,
              tc.authorized_at,
              (t.status = 'resolved_pending_validation') AS pending_close
       FROM tickets t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN users   u ON u.id = t.coordinator_id
       LEFT JOIN ticket_closures tc ON tc.ticket_id = t.id
       WHERE t.status = 'resolved_pending_validation'
          OR (COALESCE(tc.billable, false) = true
              AND tc.charge_amount > 0
              AND t.status NOT IN ('cancelled')
              AND COALESCE(tc.invoice_generated, false) = false)
       ORDER BY
         (CASE WHEN t.status = 'resolved_pending_validation' THEN 0 ELSE 1 END),
         t.resolved_at NULLS LAST, t.updated_at DESC`
    );

    return jsonOk({ tickets: rows });
  } catch (err) {
    return jsonError("No se pudo leer el pipeline de cierres de tickets", 500, String(err));
  }
}