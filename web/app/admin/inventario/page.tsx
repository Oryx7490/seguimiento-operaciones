"use client";

import { useMemo, useRef, useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { Field, Modal, PrimaryButton, SecondaryButton, Spinner, TextInput } from "@/app/components/ui";
import type { InventoryLot, InventoryResponse } from "@/app/lib/types";

type RowKey = string;

interface Aggregate {
  brand: string;
  lot: string;
  invQty: number;
  location: string | null;
  usedTotal: number;
  projects: Map<string, { code: string; name: string; used: number; screens: Set<string> }>;
}

interface LotFormData {
  brand: string;
  lot: string;
  count: string;
  location: string;
}

const EMPTY_FORM: LotFormData = { brand: "", lot: "", count: "", location: "" };

function keyOf(brand: string, lot: string): RowKey {
  return `${brand}${String.fromCharCode(1)}${lot}`;
}

function parseCsv(text: string): Array<{ manufacturer_brand: string; lot_number: string; module_count: number; location?: string }> {
  const rows: Array<{ manufacturer_brand: string; lot_number: string; module_count: number; location?: string }> = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  for (const line of lines) {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const brand = cells[0] ?? "";
    const lot = cells[1] ?? "";
    const count = Number(cells[2]);
    const location = cells[3]?.trim();
    if (!brand && !lot && !Number.isFinite(count)) continue;
    if (Number.isInteger(count) && count > 0) {
      rows.push({ manufacturer_brand: brand, lot_number: lot, module_count: count, location: location || undefined });
    }
  }
  return rows;
}

function downloadTemplate() {
  const csv = "marca, lote, cantidad, ubicacion\nROE, LOT-2024-001, 64, Bodega CDMX\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "inventario_plantilla.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function InventoryPage() {
  const { data, error, reload } = useResource<InventoryResponse>("/api/inventory");
  const [editing, setEditing] = useState<InventoryLot | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [view, setView] = useState<"lote" | "proyecto">("lote");
  const [sortCol, setSortCol] = useState<"brand" | "lot" | "inv" | "used" | "diff">("brand");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const inventory = useMemo(() => data?.inventory ?? [], [data]);
  const usage = useMemo(() => data?.usage ?? [], [data]);

  const aggregate: Aggregate[] = useMemo(() => {
    const byKey = new Map<RowKey, Aggregate>();
    for (const lot of inventory) {
      byKey.set(keyOf(lot.manufacturer_brand, lot.lot_number), {
        brand: lot.manufacturer_brand,
        lot: lot.lot_number,
        invQty: lot.module_count,
        location: lot.location,
        usedTotal: 0,
        projects: new Map(),
      });
    }
    for (const u of usage) {
      const k = keyOf(u.manufacturer_brand, u.lot_number);
      let agg = byKey.get(k);
      if (!agg) {
        agg = { brand: u.manufacturer_brand, lot: u.lot_number, invQty: 0, location: null, usedTotal: 0, projects: new Map() };
        byKey.set(k, agg);
      }
      agg.usedTotal += u.module_count;
      const proj = agg.projects.get(u.project_id) ?? { code: u.project_code, name: u.project_name, used: 0, screens: new Set<string>() };
      proj.used += u.module_count;
      if (u.screen_type) proj.screens.add(u.screen_type);
      agg.projects.set(u.project_id, proj);
    }
    return [...byKey.values()];
  }, [inventory, usage]);

  const projects = useMemo(() => {
    const m = new Map<string, { id: string; code: string; name: string }>();
    for (const u of usage) m.set(u.project_id, { id: u.project_id, code: u.project_code, name: u.project_name });
    return [...m.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [usage]);

  const filtered = useMemo(() => {
    let rows = aggregate;
    if (projectFilter) {
      rows = rows
        .map((a) => {
          const proj = a.projects.get(projectFilter);
          return proj ? { ...a, usedTotal: proj.used, projects: new Map([[projectFilter, proj]]) } : null;
        })
        .filter((x): x is Aggregate => x !== null);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (a) =>
          a.brand.toLowerCase().includes(q) ||
          a.lot.toLowerCase().includes(q) ||
          (a.location ?? "").toLowerCase().includes(q)
      );
    }
    const dir = sortDir;
    return [...rows].sort((a, b) => {
      const x = sortCol === "brand" ? a.brand : sortCol === "lot" ? a.lot : sortCol === "inv" ? a.invQty : sortCol === "used" ? a.usedTotal : a.invQty - a.usedTotal;
      const y = sortCol === "brand" ? b.brand : sortCol === "lot" ? b.lot : sortCol === "inv" ? b.invQty : sortCol === "used" ? b.usedTotal : b.invQty - b.usedTotal;
      if (typeof x === "string") return (x as string).localeCompare(y as string) * dir;
      return ((x as number) - (y as number)) * dir;
    });
  }, [aggregate, search, projectFilter, sortCol, sortDir]);

  const projectsRows: Array<{ project_id: string; code: string; name: string; rows: Aggregate[] }> = useMemo(() => {
    const byProject = new Map<string, { project_id: string; code: string; name: string; rows: Aggregate[] }>();
    for (const a of aggregate) {
      for (const [pid, proj] of a.projects) {
        let g = byProject.get(pid);
        if (!g) {
          g = { project_id: pid, code: proj.code, name: proj.name, rows: [] };
          byProject.set(pid, g);
        }
        g.rows.push({ ...a, usedTotal: proj.used, projects: new Map([[pid, proj]]) });
      }
    }
    return [...byProject.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [aggregate]);

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortCol(col);
      setSortDir(1);
    }
  }

  function arrow(col: typeof sortCol) {
    return sortCol === col ? (sortDir === 1 ? " ↑" : " ↓") : "";
  }

  async function saveLot(lotForm: LotFormData) {
    setSaving(true);
    setErr(null);
    const payload = {
      manufacturer_brand: lotForm.brand,
      lot_number: lotForm.lot,
      module_count: Number(lotForm.count),
      location: lotForm.location.trim() || null,
    };
    try {
      if (editing === "new") {
        await fetchJson("/api/inventory", { method: "POST", body: JSON.stringify(payload) });
      } else if (editing) {
        await fetchJson(`/api/inventory/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      setOk(editing === "new" ? "Lote agregado." : "Lote actualizado.");
      setEditing(null);
      reload();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeLot(lot: InventoryLot) {
    if (!confirm(`¿Eliminar el lote "${lot.manufacturer_brand} ${lot.lot_number}" del inventario?`)) return;
    try {
      await fetchJson(`/api/inventory/${lot.id}`, { method: "DELETE" });
      setOk("Lote eliminado.");
      reload();
    } catch (e) {
      setErr(String(e));
    }
  }

  async function onImportFile(f: File) {
    setImporting(true);
    setErr(null);
    setOk(null);
    try {
      const text = await f.text();
      const rows = parseCsv(text);
      if (rows.length === 0) throw new Error("No se encontraron filas válidas en el CSV");
      const res = await fetchJson<{ added: number; updated: number; skipped: number; errors: string[] }>("/api/inventory/import", {
        method: "POST",
        body: JSON.stringify({ rows }),
      });
      setOk(`Importación: ${res.added} nuevos, ${res.updated} actualizados, ${res.skipped} omitidos.`);
      reload();
    } catch (e) {
      setErr(String(e));
    } finally {
      setImporting(false);
    }
  }

  function statusOf(row: Aggregate): { label: string; cls: string; text: string } {
    const diff = row.invQty - row.usedTotal;
    if (row.invQty === 0 && row.usedTotal > 0) return { label: "No en inventario", cls: "bg-amber-100 text-amber-700", text: `${row.usedTotal} usados sin registro` };
    if (diff < 0) return { label: "Faltante", cls: "bg-red-100 text-red-700", text: `Faltan ${-diff}` };
    if (diff > 0) return { label: "Sobrante", cls: "bg-emerald-100 text-emerald-700", text: `Sobran ${diff}` };
    return { label: "Ok", cls: "bg-zinc-100 text-zinc-600", text: "Sin sobrante" };
  }

  if (!data && !error) return <div className="p-6"><Spinner /></div>;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Inventario de módulos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Inventario inicial (importado o capturado) vs lotes usados en los cierres de proyectos: faltantes y sobrantes.
          </p>
        </div>
        <div className="flex gap-2">
          <SecondaryButton onClick={downloadTemplate} className="text-xs px-2 py-1">Plantilla CSV</SecondaryButton>
          <SecondaryButton onClick={() => fileRef.current?.click()} disabled={importing} className="text-xs px-2 py-1">
            {importing ? "Importando…" : "Importar CSV"}
          </SecondaryButton>
          <PrimaryButton onClick={() => setEditing("new")} className="text-xs px-2 py-1">Agregar lote</PrimaryButton>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {err && <p className="mb-2 text-xs text-red-600">{err}</p>}
      {ok && <p className="mb-2 text-xs text-emerald-600">{ok}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TextInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar marca, lote o ubicación…"
          className="!w-64"
        />
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800"
        >
          <option value="">Todos los proyectos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded-md border border-zinc-300 text-sm">
          <button
            onClick={() => setView("lote")}
            className={`px-3 py-1.5 ${view === "lote" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
          >
            Por lote
          </button>
          <button
            onClick={() => setView("proyecto")}
            className={`px-3 py-1.5 ${view === "proyecto" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
          >
            Por proyecto
          </button>
        </div>
      </div>

      {view === "lote" ? (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="cursor-pointer px-3 py-2 text-left" onClick={() => toggleSort("brand")}>Marca{arrow("brand")}</th>
                <th className="cursor-pointer px-3 py-2 text-left" onClick={() => toggleSort("lot")}>Lote{arrow("lot")}</th>
                <th className="px-3 py-2 text-left">Ubicación</th>
                <th className="cursor-pointer px-3 py-2 text-right" onClick={() => toggleSort("inv")}>Inventario{arrow("inv")}</th>
                <th className="cursor-pointer px-3 py-2 text-right" onClick={() => toggleSort("used")}>Usado{arrow("used")}</th>
                <th className="cursor-pointer px-3 py-2 text-right" onClick={() => toggleSort("diff")}>Diferencia{arrow("diff")}</th>
                <th className="px-3 py-2 text-left">Pantallas donde se ocupó</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-4 text-sm text-zinc-400">Sin datos.</td></tr>
              ) : (
                filtered.map((row) => {
                  const st = statusOf(row);
                  const screens = new Set<string>();
                  for (const proj of row.projects.values()) for (const s of proj.screens) screens.add(s);
                  return (
                    <tr key={keyOf(row.brand, row.lot)} className="hover:bg-zinc-50">
                      <td className="px-3 py-2 font-medium text-zinc-800">{row.brand}</td>
                      <td className="px-3 py-2 text-zinc-600">{row.lot}</td>
                      <td className="px-3 py-2 text-zinc-500">{row.location ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-zinc-700">{row.invQty || "—"}</td>
                      <td className="px-3 py-2 text-right text-zinc-700">{row.usedTotal || "0"}</td>
                      <td className="px-3 py-2 text-right font-medium text-zinc-800">{row.invQty - row.usedTotal}</td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {screens.size === 0 ? "—" : [...screens].join(", ")}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`} title={st.text}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {inventory.some((l) => l.manufacturer_brand === row.brand && l.lot_number === row.lot) && (
                            <button
                              onClick={() => setEditing(inventory.find((l) => l.manufacturer_brand === row.brand && l.lot_number === row.lot) ?? null)}
                              className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                            >
                              Editar
                            </button>
                          )}
                          {inventory.some((l) => l.manufacturer_brand === row.brand && l.lot_number === row.lot) && (
                            <button
                              onClick={() => removeLot(inventory.find((l) => l.manufacturer_brand === row.brand && l.lot_number === row.lot)!)}
                              className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          {projectsRows.length === 0 ? (
            <p className="text-sm text-zinc-400">Aún no hay lotes usados en cierres.</p>
          ) : (
            projectsRows
              .filter((g) => !projectFilter || g.project_id === projectFilter)
              .map((g) => (
                <div key={g.project_id} className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
                  <div className="border-b border-zinc-100 bg-zinc-50 px-3 py-2">
                    <h2 className="text-sm font-semibold text-zinc-800">
                      {g.code} — {g.name}
                    </h2>
                  </div>
                  <table className="min-w-full text-sm">
                    <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Marca</th>
                        <th className="px-3 py-2 text-left">Lote</th>
                        <th className="px-3 py-2 text-left">Pantalla</th>
                        <th className="px-3 py-2 text-right">Usado</th>
                        <th className="px-3 py-2 text-right">Inventario</th>
                        <th className="px-3 py-2 text-right">Diferencia</th>
                        <th className="px-3 py-2 text-left">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {g.rows.map((row) => {
                        const st = statusOf(row);
                        const proj = row.projects.get(g.project_id)!;
                        const screens = [...proj.screens];
                        return (
                          <tr key={keyOf(row.brand, row.lot)} className="hover:bg-zinc-50">
                            <td className="px-3 py-2 font-medium text-zinc-800">{row.brand}</td>
                            <td className="px-3 py-2 text-zinc-600">{row.lot}</td>
                            <td className="px-3 py-2 text-xs text-zinc-500">{screens.length ? screens.join(", ") : "General"}</td>
                            <td className="px-3 py-2 text-right text-zinc-700">{row.usedTotal}</td>
                            <td className="px-3 py-2 text-right text-zinc-700">{row.invQty || "—"}</td>
                            <td className="px-3 py-2 text-right font-medium text-zinc-800">{row.invQty - row.usedTotal}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`} title={st.text}>
                                {st.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))
          )}
        </div>
      )}

      {editing && (
        <LotModal
          key={editing === "new" ? "new" : editing.id}
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={saveLot}
          saving={saving}
        />
      )}
    </div>
  );
}

function LotModal({
  editing,
  onClose,
  onSave,
  saving,
}: {
  editing: InventoryLot | "new";
  onClose: () => void;
  onSave: (form: LotFormData) => Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = useState<LotFormData>(
    editing === "new"
      ? EMPTY_FORM
      : {
          brand: editing.manufacturer_brand,
          lot: editing.lot_number,
          count: String(editing.module_count),
          location: editing.location ?? "",
        }
  );
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!form.brand.trim()) return setErr("Indica la marca del fabricante");
    if (!form.lot.trim()) return setErr("Indica el número de lote");
    const n = Number(form.count);
    if (!Number.isInteger(n) || n <= 0) return setErr("La cantidad de módulos debe ser un entero > 0");
    setErr(null);
    await onSave(form);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing === "new" ? "Agregar lote" : "Editar lote"}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={() => void submit()} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Marca del fabricante">
          <TextInput value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} placeholder="P. ej. Novastar" />
        </Field>
        <Field label="Número de lote">
          <TextInput value={form.lot} onChange={(v) => setForm({ ...form, lot: v })} placeholder="P. ej. LOT-2024-001" />
        </Field>
        <Field label="Cantidad de módulos">
          <TextInput value={form.count} onChange={(v) => setForm({ ...form, count: v })} type="number" />
        </Field>
        <Field label="Ubicación (opcional)">
          <TextInput value={form.location} onChange={(v) => setForm({ ...form, location: v })} placeholder="P. ej. Bodega CDMX" />
        </Field>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}