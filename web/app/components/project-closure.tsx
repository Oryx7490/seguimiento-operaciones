"use client";

import { useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { formatDate } from "@/app/lib/format";
import { decimalText, modulesForArea, multiplyDecimalText } from "@/app/lib/decimal";
import { Field, PrimaryButton, SecondaryButton, TextInput } from "@/app/components/ui";
import ProjectClosureFiles from "@/app/components/project-closure-files";
import type { ClosureController, ClosureModuleLot, Controller } from "@/app/lib/types";

interface Closure {
  installation_done: boolean;
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
  cancelled?: boolean;
  m2?: number;
  m2_exact?: string;
  quantity?: number;
}

interface Row {
  key: string;
  screen_id: string;
  controller_id: string;
  controller_name: string;
  quantity: string;
  serial_numbers: string;
}

interface LotRow {
  key: string;
  screen_id: string;
  manufacturer_brand: string;
  lot_number: string;
  module_count: string;
  module_count_auto?: boolean;
}

interface ClosureInventoryLot {
  id: string;
  manufacturer_brand: string;
  lot_number: string;
  module_count: number;
  status: string;
  available_modules: number;
  module_m2: number;
  module_m2_exact?: string;
  available_m2: number;
}

const REQUIREMENTS: Array<{ key: keyof Closure; label: string }> = [
  { key: "installation_done", label: "Instalación realizada" },
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

function toLotRows(initial: ClosureModuleLot[]): LotRow[] {
  return initial.map((l) => ({
    key: l.id ?? newKey(),
    screen_id: l.screen_id ?? "",
    manufacturer_brand: l.manufacturer_brand ?? "",
    lot_number: l.lot_number ?? "",
    module_count: l.module_count ? String(l.module_count) : "",
  }));
}

export default function ProjectClosure({
  projectId,
  status,
  closure,
  attachments,
  screens,
  closureControllers,
  closureModuleLots,
  defaultOpen,
  onChanged,
}: {
  projectId: string;
  status: string;
  closure: Closure | null;
  attachments: Att[];
  screens: ScreenRef[];
  closureControllers: ClosureController[];
  closureModuleLots: ClosureModuleLot[];
  defaultOpen: boolean;
  onChanged: () => void;
}) {
  const [c, setC] = useState<Closure>({
    installation_done: closure?.installation_done ?? false,
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
  const [lots, setLots] = useState<LotRow[]>(toLotRows(closureModuleLots ?? []));
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [open, setOpen] = useState(defaultOpen);

  const catalog = useResource<{ controllers: Controller[] }>("/api/controllers");
  const inventoryResource = useResource<{ inventory: ClosureInventoryLot[] }>(`/api/projects/${projectId}/closure-inventory`);
  const controllers = catalog.data?.controllers ?? [];
  const inventoryLots = inventoryResource.data?.inventory ?? [];
  const isClosed = status === "closed";
  const activeScreens = screens.filter((s) => !s.cancelled);
  const screenName = (id: string) => screens.find((s) => s.id === id)?.screen_type ?? "General";
  const screensWithLots = new Set(
    lots
      .filter((l) => l.screen_id && l.manufacturer_brand.trim() && l.lot_number.trim())
      .map((l) => l.screen_id),
  ).size;
  const closureChecks = [
    c.installation_done,
    c.hours_justified,
    Boolean(c.delivery_sheet_attachment_id),
    Boolean(c.receiver_name),
    Boolean(c.reception_date),
    activeScreens.length > 0 && screensWithLots >= activeScreens.length,
  ];
  const closureSummary = isClosed
    ? "Cerrado"
    : `${closureChecks.filter(Boolean).length}/${closureChecks.length} requisitos completos`;

  function inventoryKey(brand: string, lot: string): string {
    return `${brand.toLowerCase()}\u0001${lot.toLowerCase()}`;
  }

  function inventoryForRow(row: LotRow): ClosureInventoryLot | undefined {
    return inventoryLots.find((lot) => inventoryKey(lot.manufacturer_brand, lot.lot_number) === inventoryKey(row.manufacturer_brand, row.lot_number));
  }

  function screenById(id: string): ScreenRef | undefined {
    return activeScreens.find((s) => s.id === id);
  }

  /**
   * Módulos teóricos que cubre el área de la pantalla.
   * Pantalla en m² exactos (`m2_exact`, texto decimal de Postgres: width_m × height_m
   * o area_m2 en irregulares) multiplicado por `quantity`, porque una fila puede
   * representar N pantallas idénticas.
   * Módulo en m² exactos (`module_m2_exact` = width_mm × height_mm / 1e6, p. ej. 0.0512).
   * La división es decimal exacta (`modulesForArea`), no coma flotante: con `Math.ceil`
   * un ratio exacto como 13 salía como 13.000000000000002 y devolvía 14 módulos de más.
   */
  function suggestedModuleCount(screen: ScreenRef | undefined, lot: ClosureInventoryLot | undefined): number | null {
    if (!screen || !lot) return null;
    return modulesForArea(
      screen.m2_exact ?? screen.m2,
      screen.quantity || 1,
      lot.module_m2_exact ?? lot.module_m2
    );
  }

  function screenAreaText(screen: ScreenRef): string {
    return decimalText(screen.m2_exact ?? screen.m2);
  }

  function autoModuleCount(screenId: string, lot: ClosureInventoryLot | undefined): string | null {
    const suggested = suggestedModuleCount(screenById(screenId), lot);
    return suggested != null ? String(suggested) : null;
  }

  function recalculateLotRow(row: LotRow) {
    const lot = inventoryForRow(row);
    const next = autoModuleCount(row.screen_id, lot);
    if (next == null) return;
    updateLotRow(row.key, { module_count: next, module_count_auto: true });
  }

  async function confirmarDePlaneacion() {
    setErr(null);
    try {
      const res = await fetchJson<{ controllers: { screen_id: string; controller_id: string; quantity: number }[] }>(
        `/api/projects/${projectId}/screen-controllers`
      );
      const planned = res.controllers ?? [];
      if (planned.length === 0) {
        setErr("No hay equipos en la planeación para este proyecto.");
        return;
      }
      setRows((prev) => {
        const existing = new Set(prev.map((r) => `${r.screen_id}|${r.controller_id}`));
        const add = planned
          .filter((p) => !existing.has(`${p.screen_id}|${p.controller_id}`))
          .map((p) => ({
            key: newKey(),
            screen_id: p.screen_id,
            controller_id: p.controller_id,
            controller_name: controllers.find((c) => c.id === p.controller_id)?.name ?? "",
            quantity: String(p.quantity),
            serial_numbers: "",
          }));
        return [...prev, ...add];
      });
      setOk("Equipos de planeación confirmados.");
    } catch (e) {
      setErr(String(e));
    }
  }

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

  function addLotRow() {
    setLots([
      ...lots,
      { key: newKey(), screen_id: activeScreens[0]?.id ?? "", manufacturer_brand: "", lot_number: "", module_count: "" },
    ]);
  }

  function updateLotRow(key: string, patch: Partial<LotRow>) {
    setLots(lots.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLotRow(key: string) {
    setLots(lots.filter((l) => l.key !== key));
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

  function buildModuleLots():
    | Array<{
        screen_id: string | null;
        manufacturer_brand: string;
        lot_number: string;
        module_count: number | null;
      }>
    | { __error: string } {
    const out: Array<{
      screen_id: string | null;
      manufacturer_brand: string;
      lot_number: string;
      module_count: number | null;
    }> = [];
    for (const l of lots) {
      const brand = l.manufacturer_brand.trim();
      const lotNo = l.lot_number.trim();
      const countStr = l.module_count.trim();
      if (!brand && !lotNo && !l.screen_id && !countStr) continue; // fila vacía se ignora
      if (!brand) return { __error: "Cada lote de módulos requiere la marca del fabricante" };
      if (!lotNo) return { __error: `La marca "${brand}" requiere el número de lote` };
      if (!l.screen_id) return { __error: `El lote "${lotNo}" debe asociarse a una pantalla` };
      const inventoryLot = inventoryForRow(l);
      if (!inventoryLot) return { __error: `Selecciona un lote vigente del inventario para "${brand} ${lotNo}"` };
      const moduleCount = Number(countStr);
      if (!countStr || !Number.isInteger(moduleCount) || moduleCount <= 0) {
        return { __error: `El lote "${lotNo}" requiere una cantidad de módulos entera > 0` };
      }
      if (moduleCount > inventoryLot.available_modules) {
        return { __error: `El lote "${lotNo}" solo tiene ${inventoryLot.available_modules} módulos disponibles` };
      }
      if (!activeScreens.some((s) => s.id === l.screen_id)) {
        return { __error: `La pantalla seleccionada para el lote "${lotNo}" no está activa` };
      }
      out.push({
        screen_id: l.screen_id,
        manufacturer_brand: inventoryLot.manufacturer_brand,
        lot_number: inventoryLot.lot_number,
        module_count: moduleCount,
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
    const lotsData = buildModuleLots();
    if ("__error" in lotsData) {
      setErr(lotsData.__error);
      setSaving(false);
      return;
    }
    try {
      await fetchJson(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          closure: {
            installation_done: c.installation_done,
            hours_justified: c.hours_justified,
            delivery_sheet_attachment_id: c.delivery_sheet_attachment_id,
            receiver_name: c.receiver_name,
            reception_date: c.reception_date,
            finiquito_attachment_id: c.finiquito_attachment_id,
            fiscal_complement_attachment_id: c.fiscal_complement_attachment_id,
            digital_signature_attachment_id: c.digital_signature_attachment_id,
            final_note: c.final_note,
          },
          closure_controllers: cc,
          closure_module_lots: lotsData,
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
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex items-center gap-2 text-left" aria-expanded={open}>
          <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-zinc-300 text-sm leading-none text-zinc-500">{open ? "−" : "+"}</span>
          <h2 className="text-sm font-semibold text-zinc-800">Cierre del proyecto</h2>
          <span className="text-xs text-zinc-400">{closureSummary}</span>
        </button>
        {isClosed && <span className="text-[11px] font-semibold text-emerald-600">Proyecto cerrado</span>}
      </header>

      {open && <div className="space-y-4 border-t border-zinc-100 p-4">
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
            <div className="pt-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Lotes de módulos y fabricante</p>
              {(closureModuleLots ?? []).length === 0 ? (
                <p className="mt-1 text-xs text-zinc-400">Sin lotes registrados.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {(closureModuleLots ?? []).map((l) => (
                    <li key={l.id} className="text-xs">
                      <strong>{screenName(l.screen_id ?? "")}</strong> — {l.manufacturer_brand}
                      {l.lot_number && <span className="text-zinc-400"> · Lote: {l.lot_number}</span>}
                      {l.module_count != null && <span className="text-zinc-400"> · {l.module_count} módulos</span>}
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
            </ul>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Hoja de entrega firmada" hint="Puedes adjuntarla en Archivos del cierre, abajo.">
                <select
                  value={c.delivery_sheet_attachment_id ?? ""}
                  onChange={(e) =>
                    setC({ ...c, delivery_sheet_attachment_id: e.target.value || null })
                  }
                  className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800"
                >
                  <option value="">Selecciona la hoja firmada…</option>
                  {attachments.filter((a) => a.attachment_type === "delivery_sheet").map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.file_name}
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
<div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Equipos definitivos instalados
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={confirmarDePlaneacion}
                  className="rounded border border-zinc-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100"
                  title="Copia los controladores de la cotización (planeación) a equipos definitivos"
                >
                  Confirmar equipos de planeación
                </button>
                <button
                  type="button"
                  onClick={addRow}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                >
                  Agregar equipo
                </button>
              </div>
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

            {/* Lotes de módulos y marca del fabricante por pantalla */}
            <div className="border-t border-zinc-100 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Lotes de módulos por pantalla
                </p>
                <button
                  type="button"
                  onClick={addLotRow}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                >
                  Agregar lote
                </button>
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">
                Selecciona una marca y lote del inventario disponible. La cantidad se calcula por área de pantalla y se descontará al calcular existencias y m² usados.
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Pantallas con lote: {new Set(
                  lots
                    .filter((l) => l.screen_id && l.manufacturer_brand.trim() && l.lot_number.trim())
                    .map((l) => l.screen_id)
                ).size}/{activeScreens.length}
              </p>

              {lots.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-400">Sin lotes registrados.</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Pantalla</th>
                        <th className="px-2 py-1.5 text-left">Marca y lote del inventario</th>
                        <th className="px-2 py-1.5 text-left">Cant. módulos</th>
                        <th className="px-2 py-1.5 text-right">Disponible</th>
                        <th className="px-2 py-1.5 text-left">Observaciones</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {lots.map((l) => (
                        <tr key={l.key}>
                          <td className="px-2 py-1.5">
                            <select
                              value={l.screen_id}
                              onChange={(e) => {
                                const nextScreenId = e.target.value;
                                const canAuto = l.module_count_auto === true || l.module_count.trim() === "";
                                const next = canAuto ? autoModuleCount(nextScreenId, inventoryForRow(l)) : null;
                                updateLotRow(l.key, {
                                  screen_id: nextScreenId,
                                  ...(next != null ? { module_count: next, module_count_auto: true } : {}),
                                });
                              }}
                              className="rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs text-zinc-800"
                            >
                              {activeScreens.map((s) => (
                                <option key={s.id} value={s.id}>{s.screen_type}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={inventoryForRow(l) ? inventoryKey(l.manufacturer_brand, l.lot_number) : ""}
                              onChange={(e) => {
                                const selected = inventoryLots.find((lot) => inventoryKey(lot.manufacturer_brand, lot.lot_number) === e.target.value);
                                if (selected) {
                                  const suggested = autoModuleCount(l.screen_id, selected);
                                  updateLotRow(l.key, {
                                    manufacturer_brand: selected.manufacturer_brand,
                                    lot_number: selected.lot_number,
                                    module_count: suggested ?? (l.module_count || (selected.available_modules > 0 ? "1" : "")),
                                    module_count_auto: suggested != null,
                                  });
                                }
                              }}
                              className="w-56 rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs text-zinc-800"
                            >
                              <option value="">Selecciona marca y lote…</option>
                              {inventoryLots.map((lot) => (
                                <option
                                  key={lot.id}
                                  value={inventoryKey(lot.manufacturer_brand, lot.lot_number)}
                                  disabled={lot.available_modules <= 0 && inventoryKey(l.manufacturer_brand, l.lot_number) !== inventoryKey(lot.manufacturer_brand, lot.lot_number)}
                                >
                                  {lot.manufacturer_brand} · {lot.lot_number}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={1}
                                value={l.module_count}
                                max={inventoryForRow(l)?.available_modules}
                                onChange={(e) => updateLotRow(l.key, { module_count: e.target.value, module_count_auto: false })}
                                placeholder="Cant."
                                className="w-16 rounded border border-zinc-300 bg-white px-1.5 py-1 text-left text-xs text-zinc-800"
                              />
                              {inventoryForRow(l) && suggestedModuleCount(screenById(l.screen_id), inventoryForRow(l)) != null && (
                                <button
                                  type="button"
                                  onClick={() => recalculateLotRow(l)}
                                  title={`Calcular ${suggestedModuleCount(screenById(l.screen_id), inventoryForRow(l))} módulos para el área de la pantalla`}
                                  className="rounded border border-zinc-300 px-1.5 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100"
                                >
                                  Auto
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right align-top text-[11px] text-zinc-500">
                            {inventoryForRow(l) ? (
                              <>
                                <span className="block whitespace-nowrap">
                                  {inventoryForRow(l)!.available_modules} módulos
                                </span>
                                <span className="block whitespace-nowrap text-zinc-400">
                                  {multiplyDecimalText(inventoryForRow(l)!.module_m2_exact ?? inventoryForRow(l)!.module_m2, inventoryForRow(l)!.available_modules)} m²
                                </span>
                              </>
                            ) : (
                              <span className="text-zinc-300">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 align-top text-[10px] leading-4 text-zinc-400">
                            {(() => {
                              const lot = inventoryForRow(l);
                              const screen = screenById(l.screen_id);
                              if (!lot || !screen) return <span className="text-zinc-300">—</span>;
                              const areaText = screenAreaText(screen);
                              const unitText = decimalText(lot.module_m2_exact ?? lot.module_m2);
                              const suggested = suggestedModuleCount(screen, lot);
                              const usedText = multiplyDecimalText(lot.module_m2_exact ?? lot.module_m2, Number(l.module_count) || 0);
                              const totalAreaText = multiplyDecimalText(screen.m2_exact ?? screen.m2, screen.quantity || 1);
                              const count = Number(l.module_count) || 0;
                              return (
                                <>
                                  <span className="block">
                                    Área {areaText} m²{(screen.quantity || 1) > 1 ? ` × ${screen.quantity} = ${totalAreaText} m²` : ""}
                                  </span>
                                  <span className="block">
                                    Módulo {unitText} m² · usar {usedText} m²{suggested != null ? ` · exacto ${suggested}` : ""}
                                  </span>
                                  {suggested != null && count > 0 && count < suggested && (
                                    <span className="block text-amber-600">
                                      Faltan {suggested - count} módulos para cubrir el área exacta
                                    </span>
                                  )}
                                  {suggested != null && count > suggested && (
                                    <span className="block">
                                      Excede el mínimo exacto en {count - suggested} módulos
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          </td>
                          <td className="px-2 py-1.5 text-right align-top">
                            <button
                              type="button"
                              onClick={() => removeLotRow(l.key)}
                              className="rounded border border-red-200 px-1.5 py-1 text-[11px] text-red-600 hover:bg-red-50"
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      ))}
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
        <ProjectClosureFiles
          projectId={projectId}
          attachments={attachments}
          selectedDeliverySheetId={c.delivery_sheet_attachment_id}
          onDeliverySheetChange={(id) => setC((current) => ({ ...current, delivery_sheet_attachment_id: id }))}
          onChanged={onChanged}
        />
      </div>}
    </section>
  );
}
