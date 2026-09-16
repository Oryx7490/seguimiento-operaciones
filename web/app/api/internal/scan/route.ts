import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/app/lib/api";
import { runAlertScan } from "@/app/lib/alerts";

export async function POST(req: NextRequest) {
  const expected = process.env.WORKER_TOKEN;
  const provided = req.headers.get("x-worker-token");
  if (!expected) return jsonError("WORKER_TOKEN no configurado", 503);
  if (provided !== expected) return jsonError("No autorizado", 401);
  try {
    const result = await runAlertScan();
    return jsonOk(result);
  } catch (err) {
    return jsonError("No se pudieron generar las alertas", 500, String(err));
  }
}
