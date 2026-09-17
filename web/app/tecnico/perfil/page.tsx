import pool from "@/app/lib/db";
import TechnicianProfileView from "@/app/components/technician-profile-view";

export const dynamic = "force-dynamic";

export default async function TechnicianProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { t } = await searchParams;
  const raw = typeof t === "string" ? t : "";
  const { rows } = await pool.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM technicians WHERE active = true ORDER BY display_name`
  );
  const initialTechId = rows.some((x) => x.id === raw) ? raw : (rows[0]?.id ?? "");
  return <TechnicianProfileView initialTechId={initialTechId} technicians={rows} />;
}
