"use client";

import { useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { formatDate } from "@/app/lib/format";
import { Field, PrimaryButton, SecondaryButton, TextInput } from "@/app/components/ui";
import type { ClosureController, Controller } from "@/app/lib/types";

interface Closure {
  installation_done: boolean;
  mandatory_activities_completed: boolean;
  hours_justified: boolean;
  delivery_sheet_attachment_id: string | null;
  receiver_name: string | null;
  reception_date: string | null;
  finiquito_attachment_id: string | null;
  fiscal_complement_attachment_id: string | null;
  digital_signature_attachment_id: string | null;
  final_note: string | null;
  closed_at: string | null;
}

interface Att {
  id: string;
  file_name: string;
  attachment_type?: string;
}

interface ScreenRef {
  id: string;
  screen_type: string;
}

interface Row {
  key: string;
  screen_id: string;
  controller_id: string;
  controller_name: string;
  quantity: string;
  serial_numbers: string;
}

const REQUIREMENTS: Array<{ key: keyof Closure; label: string }> = [
  { key: "installation_done", label: "Instalación realizada" },
  { key: "mandatory_activities_completed", label: "Actividades obligatorias completadas" },
  { key: "hours_justified", label: "Horas justificadas" },
];

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

function toRows(initial: ClosureController[]): Row[] {
  return initial.map((c) => ({
    key: c.id ?? newKey(),
    screen_id: c.screen_id ?? "",
    controller_id: c.controller_id ?? "",
    controller_name: c.controller_name ?? "",
    quantity: String(c.quantity ?? 1),
    serial_numbers: c.serial_numbers ?? "",
  }));
}

export default function ProjectClosure({
  projectId,
  status,
  closure,
  attachments,
  screens,
  closureControllers,
  onChanged,
}: {
  projectId: string;
  status: string;
  closure: Closure | null;
  attachments: Att[];
  screens: ScreenRef[];
  closureControllers: ClosureController[];
  onChanged: () => void;
}) {
  const [c, setC] = useState<Closure>({
    installation_done: closure?.installation_done ?? false,
    mandatory_activities_completed: closure?.mandatory_activities_completed ?? false,
    hours_justified: closure?.hours_justified ?? false,
    delivery_sheet_attachment_id: closure?.delivery_sheet_attachment_id ?? null,
    receiver_name: closure?.receiver_name ?? "",
    reception_date: closure?.reception_date ?? "",
    finiquito_attachment_id: closure?.finiquito_attachment_id ?? null,
    fiscal_complement_attachment_id: closure?.fiscal_complement_attachment_id ?? null,
    digital_signature_attachment_id: closure?.digital_signature_attachment_id ?? null,
    final_note: closure?.final_note ?? "",
    closed_at: closure?.closed_at ?? null,
  });
  const [rows, setRows] = useState<Row[]>(toRows(closureControllers ?? []));
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const catalog = useResource<{ controllers: Controller[] }>("/api/controllers");
  const controllers = catalog.data?.controllers ?? [];
  const screenName = (id: string) => screens.find((s) => s.id === id)?.screen_type ?? "General";

  const isClosed = status === "closed";

  function addRow() {
    setRows([
      ...rows,
      { key: newKey(), screen_id: "", controller_id: "", controller_name: "", quantity: "1", serial_numbers: "" },
    ]);
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows(rows.filter((r) => r.key !== key));
  }

  function resolvedName(r: Row): string {
    if (r.controller_id) {
      const found = controllers.find((x) => x.id === r.controller_id);
      if (found) return `${found.brand ? found.brand + " " : ""}${found.name}`.trim();
    }
    return r.controller_name.trim();
  }

  function buildClosureControllers(): Array<{
    screen_id: string | null;
    controller_id: string | null;
    controller_name: string;
    quantity: number;
    serial_numbers: string | null;
  }> | { __error: string } {
    const out: Array<{
      screen_id: string | null;
      controller_id: string | null;
      controller_name: string;
      quantity: number;
      serial_numbers: string | null;
    }> = [];
    for (const r of rows) {
      const name = resolvedName(r);
      if (!name) return { __error: "Cada equipo definitivo requiere un modelo" };
      const q = Number(r.quantity);
      if (!Number.isFinite(q) || q <= 0) return { __error: "La cantidad de cada equipo debe ser > 0" };
      out.push({
        screen_id: r.screen_id || null,
        controller_id: r.controller_id || null,
        controller_name: name,
        quantity: q,
        serial_numbers: r.serial_numbers.trim() || null,
      });
    }
    return out;
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setOk(null);
    const cc = buildClosureControllers();
    if ("__error" in cc) {
      setErr(cc.__error);
      setSaving(false);
      return;
    }
    try {
      await fetchJson(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          closure: {
            installation_done: c.installation_done,
            mandatory_activities_completed: c.mandatory_activities_completed,
            hours_justified: c.hours_justified,
            delivery_sheet_attachment_id:
              c.delivery_sheet_attachment_id ??
              attachments.find((a) => a.attachment_type === "delivery_sheet")?.id ??
              attachments[0]?.id ??
              null,
            receiver_name: c.receiver_name,
            reception_date: c.reception_date,
            finiquito_attachment_id: c.finiquito_attachment_id,
            fiscal_complement_attachment_id: c.fiscal_complement_attachment_id,
            digital_signature_attachment_id: c.digital_signature_attachment_id,
            final_note: c.final_note,
          },
          closure_controllers: cc,
        }),
      });
      setOk("Checklist guardado.");
      onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function closeProject() {
    setClosing(true);
    setErr(null);
    setOk(null);
    try {
      await fetchJson(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ close_project: true }),
      });
      setOk("Proyecto cerrado.");
      onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      setClosing(false);
    }
  }

  const closedRows = closureControllers ?? [];

  return (
    <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-800">Cierre del proyecto</h2>
        {isClosed && <span className="text-[11px] font-semibold text-emerald-600">Proyecto cerrado</span>}
      </header>

      <div className="space-y-4 p-4">
        {isClosed ? (
          <div className="space-y-2 text-sm text-zinc-600">
            <p>
              Hoja de entrega:{" "}
              <strong>{attachments.find((a) => a.id === c.delivery_sheet_attachment_id)?.file_name ?? "—"}</strong>
            </p>
            <p>
              Recibe: <strong>{c.receiver_name || "—"}</strong> ·{" "}
              {c.reception_date ? formatDate(c.reception_date) : "—"}
            </p>
            {c.final_note && <p>Nota final: {c.final_note}</p>}
            {c.closed_at && <p className="text-xs text-zinc-400">Cerrado {formatDate(c.closed_at)}</p>}
            <div className="pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Equipos definitivos</p>
              {closedRows.length === 0 ? (
                <p className="mt-1 text-xs text-zinc-400">Sin equipos registrados.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {closedRows.map((r, i) => (
                    <li key={r.id ?? i} className="text-xs">
                      <strong>{screenName(r.screen_id ?? "")}</strong> — {r.controller_name} ×{r.quantity}
                      {r.serial_numbers && (
                        <span className="text-zinc-400"> · SN: {r.serial_numbers}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {REQUIREMENTS.map((r) => (
                <li key={r.key} className="flex items-center gap-3 text-sm text-zinc-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(c[r.key])}
                      onChange={(e) => setC({ ...c, [r.key]: e.target.checked })}
                      className="rounded border-zinc-300"
                    />
                    {r.label}
                  </label>
                </li>
              ))}
              <li className="flex items-center gap-3 text-sm text-zinc-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(c.delivery_sheet_attachment_id)}
                    onChange={(e) =>
                      setC({
                        ...c,
                        delivery_sheet_attachment_id: e.target.checked ? (
                          attachments.find((a) => a.attachment_type === "delivery_sheet")?.id ??
                          attachments[0]?.id ??
                          null
                        ) : null,
                      })
                    }
                    className="rounded border-zinc-300"
                  />
                  Hoja de entrega firmada adjunta
                </label>
              </li>
            </ul>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Hoja de entrega (adjunto)" hint="Súbela en la sección Adjuntos">
                <select
                  value={c.delivery_sheet_attachment_id ?? ""}
                  onChange={(e) =>
                    setC({ ...c, delivery_sheet_attachment_id: e.target.value || null })
                  }
                  className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800"
                >
                  <option value="">Selecciona un adjunto…</option>
                  {(attachments.length > 0
                    ? attachments
                    : []
                  ).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.file_name}
                      {a.attachment_type == null ? "" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nombre de quien recibe">
                <TextInput value={c.receiver_name ?? ""} onChange={(v) => setC({ ...c, receiver_name: v })} placeholder="Nombre y puesto" />
              </Field>
              <Field label="Fecha de recepción">
                <TextInput type="date" value={c.reception_date ?? ""} onChange={(v) => setC({ ...c, reception_date: v })} />
              </Field>
              <Field label="Nota final (opcional)">
                <TextInput value={c.final_note ?? ""} onChange={(v) => setC({ ...c, final_note: v })} placeholder="Observaciones de cierre" />
              </Field>
            </div>

            {/* Equipos definitivos utilizados (con números de serie) */}
            <div className="border-t border-zinc-100 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Equipos definitivos instalados
                </p>
                <button
                  type="button"
                  onClick={addRow}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                >
                  Agregar equipo
                </button>
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">
                Registra los controladores realmente utilizados y sus números de serie. Pueden diferir de la cotización.
              </p>

              {rows.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-400">Sin equipos registrados.</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Pantalla</th>
                        <th className="px-2 py-1.5 text-left">Modelo</th>
                        <th className="px-2 py-1.5 text-center">Cant.</th>
                        <th className="px-2 py-1.5 text-left">Números de serie</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {rows.map((r) => {
                        const active = controllers.filter((x) => x.active);
                        const current = r.controller_id ? controllers.find((x) => x.id === r.controller_id) : null;
                        const opts = current && !current.active ? [current, ...active] : active;
                        return (
                          <tr key={r.key}>
                            <td className="px-2 py-1.5">
                              <select
                                value={r.screen_id}
                                onChange={(e) => updateRow(r.key, { screen_id: e.target.value })}
                                className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs text-zinc-800"
                              >
                                <option value="">General</option>
                                {screens.map((s) => (
                                  <option key={s.id} value={s.id}>{s.screen_type}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex flex-col gap-1">
                                <select
                                  value={r.controller_id}
                                  onChange={(e) =>
                                    updateRow(r.key, {
                                      controller_id: e.target.value,
                                      controller_name: "",
                                    })
                                  }
                                  className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs text-zinc-800"
                                >
                                  <option value="">Escribir modelo…</option>
                                  {opts.map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.brand ? `${x.brand} ` : ""}{x.name}
                                    </option>
                                  ))}
                                </select>
                                {!r.controller_id && (
                                  <input
                                    value={r.controller_name}
                                    onChange={(e) => updateRow(r.key, { controller_name: e.target.value })}
                                    placeholder="Modelo / marca"
                                    className="w-40 rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs text-zinc-800"
                                  />
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <input
                                type="number"
                                min={1}
                                value={r.quantity}
                                onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
                                className="w-14 rounded border border-zinc-300 bg-white px-1.5 py-1 text-center text-xs text-zinc-800"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                value={r.serial_numbers}
                                onChange={(e) => updateRow(r.key, { serial_numbers: e.target.value })}
                                placeholder="SN-001, SN-002…"
                                className="w-48 rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs text-zinc-800"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <button
                                type="button"
                                onClick={() => removeRow(r.key)}
                                className="rounded border border-red-200 px-1.5 py-1 text-[11px] text-red-600 hover:bg-red-50"
                              >
                                Quitar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}
            {ok && <p className="text-xs text-emerald-600">{ok}</p>}

            <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
              <SecondaryButton onClick={() => void save()} disabled={saving}>
                {saving ? "Guardando…" : "Guardar checklist"}
              </SecondaryButton>
              <PrimaryButton onClick={() => void closeProject()} disabled={closing}>
                {closing ? "Cerrando…" : "Cerrar proyecto"}
              </PrimaryButton>
            </div>
          </>
        )}
      </div>
    </section>
  );
}