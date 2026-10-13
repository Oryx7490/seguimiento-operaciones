import pool from "@/app/lib/db";

const TZ = "America/Mexico_City";

// La fecha ingresada en project_screens es de calendario (sin hora). Tomamos
// el día UTC almacenado y lo ubicamos al inicio de ese día en Ciudad de México.
const INSTALLATION_AT_SQL = `COALESCE(
  ((ps.screen_installed_at AT TIME ZONE 'UTC')::date::timestamp AT TIME ZONE 'America/Mexico_City'),
  (ph.actual_end_date::timestamp AT TIME ZONE 'America/Mexico_City')
)`;

export interface WeekPeriod {
  year: number;
  weekNumber: number;
  weekEnding: string; // YYYY-MM-DD (domingo)
  startsAt: Date;
  endsAt: Date;
  startsIso: string;
  endsIso: string;
}

function zonedDate(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0) {
  // m 1-based? JS Date month 0-based; easier construct in local-like form
  // Use Date with TZ by formatting; simpler: build UTC then adjust conceptually? Or use Intl
  return new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}-06:00`);
}

export function getWeekEnding(d: Date = new Date()): WeekPeriod {
  // Get current date in CDMX roughly? Build by shifting; simpler: compute by getting day index (Sun=0)
  // Use UTC arithmetic as base, adjust to CDMX
  const utc = new Date(d.toISOString());
  // Map to CDMX offset approx not needed if we use SQL; but for API we return ISO with TZ logic in SQL
  // Compute week ending Sunday
  const day = utc.getUTCDay(); // 0 Sun
  const diffToSunday = day; // days since last Sunday? or to next? if today Sunday, diff 0
  const sunday = new Date(utc);
  sunday.setUTCDate(utc.getUTCDate() + (7 - day) % 7);
  if (day === 0) {
    // it's Sunday; use this Sunday? for "semana que termina el domingo" current week ends today
  }
  // if not Sunday, move to next Sunday? Or current week's ending is next Sunday? Standard: week ending Sunday
  const weekEndingDate = new Date(utc);
  const add = (7 - utc.getUTCDay()) % 7;
  weekEndingDate.setUTCDate(utc.getUTCDate() + add);
  const y = weekEndingDate.getUTCFullYear();
  const m = weekEndingDate.getUTCMonth() + 1;
  const dd = weekEndingDate.getUTCDate();
  const weekEndingStr = `${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;

  // Monday of that week? week ending Sunday means Monday is weekEnding-6
  const monday = new Date(weekEndingDate);
  monday.setUTCDate(weekEndingDate.getUTCDate() - 6);
  const sundayEnd = new Date(weekEndingDate);
  sundayEnd.setUTCHours(23, 59, 59, 999);

  // ISO week number (approx)
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const firstJan = new Date(thursday.getUTCFullYear(), 0, 1);
  const weekNumber = Math.ceil((((thursday.getTime() - firstJan.getTime()) / 86400000) + firstJan.getUTCDay() + 1) / 7);

  return {
    year: y,
    weekNumber,
    weekEnding: weekEndingStr,
    startsAt: monday,
    endsAt: sundayEnd,
    startsIso: monday.toISOString(),
    endsIso: sundayEnd.toISOString(),
  };
}

export async function computeWeeklyMetrics(startsIso: string, endsIso: string, periodId: string) {
  const client = await pool.connect();
  try {
    // m2 installed, mp installed, screens count
    const m2 = await client.query(
      `SELECT COALESCE(SUM((CASE WHEN ps.is_irregular THEN COALESCE(ps.area_m2,0) ELSE COALESCE(ps.width_m*ps.height_m,0) END) * ps.quantity), 0)::numeric AS m2_installed,
              COALESCE(SUM(
                CASE WHEN ps.pitch_mm > 0 AND ps.width_m > 0 AND ps.height_m > 0
                     THEN (ps.width_m * ps.height_m) * (1000.0 / NULLIF(ps.pitch_mm,0)) * ps.quantity
                     ELSE 0 END
              ), 0)::numeric AS mp_installed,
              COALESCE(SUM(ps.quantity), 0)::int AS screens_count,
              COUNT(DISTINCT ps.project_id)::int AS projects_count
         FROM project_screens ps
         LEFT JOIN project_phases ph ON ph.project_id = ps.project_id AND ph.name = 'Instalación'
        WHERE ps.installed = true
          AND ps.cancelled = false
          AND ${INSTALLATION_AT_SQL} BETWEEN $1 AND $2`,
      [startsIso, endsIso]
    );

    const rows: Array<{ key: string; value: string | number; unit?: string; meta?: any }> = [
      { key: "m2_installed", value: m2.rows[0].m2_installed, unit: "m2" },
      { key: "mp_installed", value: m2.rows[0].mp_installed, unit: "mp" },
      { key: "screens_installed_count", value: m2.rows[0].screens_count, unit: "uds" },
      { key: "projects_with_installed_screens", value: m2.rows[0].projects_count },
    ];

    // by environment
    const env = await client.query(
      `SELECT COALESCE(ps.environment, 'unknown') AS env,
              COALESCE(SUM((CASE WHEN ps.is_irregular THEN COALESCE(ps.area_m2,0) ELSE COALESCE(ps.width_m*ps.height_m,0) END) * ps.quantity), 0)::numeric AS m2
         FROM project_screens ps
         LEFT JOIN project_phases ph ON ph.project_id = ps.project_id AND ph.name = 'Instalación'
        WHERE ps.installed = true AND ps.cancelled = false
          AND ${INSTALLATION_AT_SQL} BETWEEN $1 AND $2
        GROUP BY env`,
      [startsIso, endsIso]
    );
    for (const r of env.rows) {
      rows.push({ key: `m2_by_env_${r.env}`, value: r.m2, unit: "m2" });
    }

    // by voltage
    const volt = await client.query(
      `SELECT COALESCE(ps.voltage, 'unknown') AS v,
              COALESCE(SUM((CASE WHEN ps.is_irregular THEN COALESCE(ps.area_m2,0) ELSE COALESCE(ps.width_m*ps.height_m,0) END) * ps.quantity), 0)::numeric AS m2
         FROM project_screens ps
         LEFT JOIN project_phases ph ON ph.project_id = ps.project_id AND ph.name = 'Instalación'
        WHERE ps.installed = true AND ps.cancelled = false
          AND ${INSTALLATION_AT_SQL} BETWEEN $1 AND $2
        GROUP BY v`,
      [startsIso, endsIso]
    );
    for (const r of volt.rows) {
      rows.push({ key: `m2_by_voltage_${r.v}`, value: r.m2, unit: "m2" });
    }

    // tickets closed
    const tickets = await client.query(
      `SELECT COUNT(*)::int AS c
         FROM tickets
        WHERE status = 'closed'
          AND (closed_at BETWEEN $1 AND $2 OR (closed_at IS NULL AND updated_at BETWEEN $1 AND $2))`,
      [startsIso, endsIso]
    );
    rows.push({ key: "tickets_closed_week", value: tickets.rows[0].c });

    // activities completed
    const acts = await client.query(
      `SELECT COUNT(*)::int AS c
         FROM activities
        WHERE status = 'completed'
          AND (end_date BETWEEN $1::date AND $2::date OR (end_date IS NULL AND date BETWEEN $1::date AND $2::date))`,
      [startsIso, endsIso]
    );
    rows.push({ key: "activities_completed_week", value: acts.rows[0].c });

    // hours
    const hours = await client.query(
      `SELECT COALESCE(SUM(duration_hours), 0)::numeric AS h
         FROM time_entries
        WHERE date BETWEEN $1::date AND $2::date`,
      [startsIso, endsIso]
    );
    rows.push({ key: "hours_registered_week", value: hours.rows[0].h, unit: "h" });

    // projects closed in week
    const pcl = await client.query(
      `SELECT COUNT(*)::int AS c
         FROM projects
        WHERE status = 'closed'
          AND updated_at BETWEEN $1 AND $2`,
      [startsIso, endsIso]
    );
    rows.push({ key: "projects_closed_week", value: pcl.rows[0].c });

    const ctl = await client.query(
      `SELECT COALESCE(SUM(COALESCE(psc.quantity,1)), 0)::int AS c
         FROM screen_controllers psc
         JOIN project_screens ps ON ps.id = psc.screen_id
         JOIN projects pr ON pr.id = ps.project_id
         LEFT JOIN project_phases ph ON ph.project_id = ps.project_id AND ph.name = 'Instalación'
        WHERE ps.installed = true AND ps.cancelled = false
          AND ${INSTALLATION_AT_SQL} BETWEEN $1 AND $2`,
      [startsIso, endsIso]
    );
    rows.push({ key: "controllers_installed_week", value: ctl.rows[0].c, unit: "uds" });
    return rows;
  } finally {
    client.release();
  }
}

export async function saveSnapshot(periodId: string, metrics: Array<{ key: string; value: number | string; unit?: string; meta?: any }>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const m of metrics) {
      await client.query(
        `INSERT INTO weekly_kpi_metrics (period_id, key, value, unit, meta)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (period_id, key) DO UPDATE SET value = EXCLUDED.value, unit = EXCLUDED.unit, meta = EXCLUDED.meta`,
        [periodId, m.key, Number(m.value), m.unit || null, m.meta || null]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
