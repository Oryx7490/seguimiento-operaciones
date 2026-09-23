import { NextRequest } from "next/server";
import pool from "@/app/lib/db";
import { jsonOk, jsonError } from "@/app/lib/api";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "";
  const category = searchParams.get("category") || "";
  const priority = searchParams.get("priority") || "";
  const assigned = searchParams.get("assigned") || "";

  try {
    const conditions: string[] = ["1=1"];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      values.push(status);
    }
    if (category) {
      conditions.push(`category = $${paramIdx++}`);
      values.push(category);
    }
    if (priority) {
      conditions.push(`priority = $${paramIdx++}`);
      values.push(priority);
    }
    if (assigned) {
      if (assigned === "me") {
        conditions.push(`assigned_to = $${paramIdx++}`);
        values.push("admin"); // TODO: get actual user
      } else if (assigned === "unassigned") {
        conditions.push(`assigned_to IS NULL`);
      }
    }

    const { rows } = await pool.query(
      `SELECT i.*, u.name AS assigned_to_name
       FROM improvements i
       LEFT JOIN users u ON u.id = i.assigned_to
       WHERE ${conditions.join(" AND ")}
       ORDER BY
         CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
         created_at DESC`,
      values
    );

    return jsonOk({ improvements: rows });
  } catch (err) {
    return jsonError("No se pudieron leer las mejoras", 500, String(err));
  }
}

export async function POST(req: NextRequest) {
  let body: {
    title: string;
    description?: string | null;
    category?: string;
    priority?: string;
    reporter_name?: string | null;
    reporter_email?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Cuerpo JSON inválido");
  }

  if (!body.title?.trim()) return jsonError("El título es obligatorio");
  if (body.category && !["feature", "bug", "ux", "other"].includes(body.category)) {
    return jsonError("category inválida");
  }
  if (body.priority && !["low", "medium", "high", "critical"].includes(body.priority)) {
    return jsonError("priority inválida");
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO improvements (title, description, category, priority, reporter_name, reporter_email)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, description, category, priority, status, reporter_name, reporter_email,
                 assigned_to, created_at, updated_at`,
      [
        body.title.trim(),
        body.description?.trim() || null,
        body.category || "feature",
        body.priority || "medium",
        body.reporter_name?.trim() || null,
        body.reporter_email?.trim() || null,
      ]
    );
    return jsonOk({ improvement: rows[0] }, 201);
  } catch (err) {
    return jsonError("No se pudo crear la mejora", 500, String(err));
  }
}