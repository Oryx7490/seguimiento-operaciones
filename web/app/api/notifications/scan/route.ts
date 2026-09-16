import { jsonError, jsonOk } from "@/app/lib/api";
import { runAlertScan } from "@/app/lib/alerts";

export async function POST() {
  try {
    const result = await runAlertScan();
    return jsonOk(result);
  } catch (err) {
    return jsonError("No se pudieron generar las alertas", 500, String(err));
  }
}
