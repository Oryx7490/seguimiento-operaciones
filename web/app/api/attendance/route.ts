import { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import pool from "@/app/lib/db";
import { jsonError, jsonOk, parseId } from "@/app/lib/api";
import { asNumber, getSettings } from "@/app/lib/notifications";
import {
  computeOvertime,
  hoursBetween,
  parseAttendanceDelimited,
  parseTime,
  resolveTechnician,
  type AliasRow,
  type ParsedAttendanceRow,
  type RosterTech,
} from "@/app/lib/overtime";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface IncomingRow {
  person_name?: string;
  date?: string;
  check_in?: string | null;
  check_out?: string | null;
}

function normalizeRows(body: { csv?: string; rows?: IncomingRow[] }): {
  rows: ParsedAttendanceRow[];
  skipped: number;
} {
  if (typeof body.csv === "string" && body.csv.trim()) {
    return parseAttendanceDelimited(body.csv);
  }
  if (Array.isArray(body.rows)) {
    const rows: ParsedAttendanceRow[] = [];
    let skipped = 0;
    for (const r of body.rows) {
      const person = String(r.person_name ?? "").trim();
      const date = String(r.date ?? "").trim();
      if (!person || !DATE_RE.test(date)) {
        skipped++;
        continue;
      }
      rows.push({
        person_name: person,
        date,
        check_in: parseTime(r.check_in ?? null),
        check_out: parseTime(r.check_out ?? null),
      });
    }
    return { rows, skipped };
  }
  return { rows: [], skipped: 0 };
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const technicianId = sp.get("technician_id");
  if (from && !DATE_RE.test(from)) return jsonError("from inválido");
  if (to && !DATE_RE.test(to)) return jsonError("to inválido");
  if (technicianId && !parseId(technicianId)) return jsonError("technician_id inválido");

  const where: string[] = [];
  const params: unknown[] = [];
  if (from) {
    params.push(from);
    where.push(`a.date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    where.push(`a.date <= $${params.length}`);
  }
  if (technicianId) {
    params.push(technicianId);
    where.push(`a.technician_id = $${params.length}`);
  }

  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.technician_id, a.person_name, to_char(a.date, 'YYYY-MM-DD') AS date,
              to_char(a.check_in, 'HH24:MI') AS check_in, to_char(a.check_out, 'HH24:MI') AS check_out,
              a.hours, a.overtime, a.notes, t.display_name
         FROM attendance_entries a
         LEFT JOIN technicians t ON t.id = a.technician_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY a.date, t.display_name NULLS LAST, a.person_name`,
      params
    );
    return jsonOk({ entries: rows });
  } catch (err) {
    return jsonError("No se pudo leer la asistencia", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: { filename?: string; csv?: string; rows?: IncomingRow[] };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  const { rows: parsed, skipped } = normalizeRows(body);
  if (parsed.length === 0) return jsonError("No se encontraron renglones válidos (se requiere persona, fecha y entrada/salida)");

  const dates = parsed.map((r) => r.date).sort();
  const periodStart = dates[0];
  const periodEnd = dates[dates.length - 1];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const rosterRes = await client.query<RosterTech>(`SELECT id, display_name FROM technicians WHERE active = true`);
    const aliasRes = await client.query<AliasRow>(`SELECT alias, technician_id FROM technician_aliases`);
    const settings = await getSettings();
    const dailyStd = asNumber(settings.overtime_daily_hours, 8);
    const weeklyStd = asNumber(settings.overtime_weekly_hours, 40);

    const batch = await client.query<{ id: string }>(
      `INSERT INTO attendance_batches (filename, period_start, period_end)
       VALUES ($1, $2, $3) RETURNING id`,
      [body.filename?.trim() || null, periodStart, periodEnd]
    );
    const batchId = batch.rows[0].id;

    let matched = 0;
    const unmatched: { person_name: string; date: string; status: string; candidates: string[] }[] = [];

    for (const row of parsed) {
      const match = resolveTechnician(row.person_name, rosterRes.rows, aliasRes.rows);
      const hours = hoursBetween(row.check_in, row.check_out);
      if (match.technician_id) {
        matched++;
        await client.query(
          `INSERT INTO attendance_entries
             (batch_id, technician_id, person_name, date, check_in, check_out, hours)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (technician_id, date) DO UPDATE
             SET batch_id = EXCLUDED.batch_id,
                 person_name = EXCLUDED.person_name,
                 check_in = EXCLUDED.check_in,
                 check_out = EXCLUDED.check_out,
                 hours = EXCLUDED.hours`,
          [batchId, match.technician_id, row.person_name, row.date, row.check_in, row.check_out, hours]
        );
      } else {
        unmatched.push({
          person_name: row.person_name,
          date: row.date,
          status: match.status,
          candidates: match.candidates,
        });
        await client.query(
          `INSERT INTO attendance_entries
             (batch_id, technician_id, person_name, date, check_in, check_out, hours)
           VALUES ($1, NULL, $2, $3, $4, $5, $6)`,
          [batchId, row.person_name, row.date, row.check_in, row.check_out, hours]
        );
      }
    }

    await recomputeOvertime(client, periodStart, periodEnd, dailyStd, weeklyStd);

    await client.query(
      `UPDATE attendance_batches SET rows_total = $2, rows_matched = $3 WHERE id = $1`,
      [batchId, parsed.length, matched]
    );

    await client.query("COMMIT");
    return jsonOk(
      {
        batch_id: batchId,
        total: parsed.length,
        matched,
        unmatched,
        skipped,
        period: { start: periodStart, end: periodEnd },
        settings: { daily_hours: dailyStd, weekly_hours: weeklyStd },
      },
      201
    );
  } catch (err) {
    await client.query("ROLLBACK");
    return jsonError("No se pudo importar la asistencia", 500, String(err));
  } finally {
    client.release();
  }
}

async function recomputeOvertime(
  client: PoolClient,
  from: string,
  to: string,
  dailyStd: number,
  weeklyStd: number
) {
  const { rows } = await client.query<{
    id: string;
    technician_id: string;
    date: string;
    hours: string | null;
  }>(
    `SELECT id, technician_id, to_char(date, 'YYYY-MM-DD') AS date, hours
       FROM attendance_entries
      WHERE technician_id IS NOT NULL
        AND date >= ($1::date - INTERVAL '7 days')
        AND date <= ($2::date + INTERVAL '7 days')
      ORDER BY technician_id, date`,
    [from, to]
  );

  const byTech = new Map<string, { ids: string[]; entries: { date: string; hours: number | null }[] }>();
  for (const r of rows) {
    const list = byTech.get(r.technician_id) ?? { ids: [], entries: [] };
    list.ids.push(r.id);
    list.entries.push({ date: r.date, hours: r.hours === null ? null : Number(r.hours) });
    byTech.set(r.technician_id, list);
  }

  for (const { ids, entries } of byTech.values()) {
    const ot = computeOvertime(entries, dailyStd, weeklyStd);
    for (let i = 0; i < ids.length; i++) {
      await client.query(`UPDATE attendance_entries SET overtime = $2 WHERE id = $1`, [
        ids[i],
        ot.get(entries[i].date) ?? 0,
      ]);
    }
  }
}
