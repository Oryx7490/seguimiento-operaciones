import pool from "@/app/lib/db";
import TechnicianView from "@/app/components/technician-view";
import type { Technician } from "@/app/lib/types";

export const dynamic = "force-dynamic";

export default async function TecnicoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { t } = await searchParams;
  const raw = typeof t === "string" ? t : "";
  const { rows } = await pool.query(
    `SELECT t.id, t.display_name, t.phone, t.active AS technician_active,
            u.id AS user_id, u.email, u.username, u.active AS user_active, u.timezone
     FROM technicians t
     JOIN users u ON u.id = t.user_id
     WHERE t.active = true
     ORDER BY t.display_name`
  );
  const technicians = rows as Technician[];
  const initialTechId = technicians.some((x) => x.id === raw) ? raw : (technicians[0]?.id ?? "");
  return <TechnicianView initialTechId={initialTechId} technicians={technicians} />;
}