"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fetchJson, useResource } from "@/app/lib/client";
import { Field, Modal, PrimaryButton, SecondaryButton, Select, Spinner, TextInput, Textarea } from "@/app/components/ui";
import type { InventoryLot, InventoryResponse } from "@/app/lib/types";

type RowKey = string;

interface Aggregate {
  brand: string;
  lot: string;
  invQty: number;
  location: string | null;
  pitch: number | null;
  widthMm: number | null;
  heightMm: number | null;
  m2Unit: number;
  moduleType: string | null;
  ledType: string | null;
  obs: string | null;
  ics: [string | null, string | null, string | null];
  usedTotal: number;
  projects: Map<string, { code: string; name: string; used: number; screens: Set<string> }>;
}

interface LotFormData {
  brand: string;
  lot: string;
  count: string;
  location: string;
  pitch: string;
  widthMm: string;
  heightMm: string;
  moduleType: string;
  ledType: string;
  observations: string;
  ic1: string;
  ic2: string;
  ic3: string;
  status: string;
  eta: string;
}

const EMPTY_FORM: LotFormData = {
  brand: "",
  lot: "",
  count: "",
  location: "",
  pitch: "",
  widthMm: "320",
  heightMm: "160",
  moduleType: "",
  ledType: "",
  observations: "",
  ic1: "",
  ic2: "",
  ic3: "",
  status: "available",
  eta: "",
};

function keyOf(brand: string, lot: string): RowKey {
  return `${brand}${String.fromCharCode(1)}${lot}`;
}

const HEADER_ALIASES: Record<string, keyof Record<string, unknown>> = {
  marca: "manufacturer_brand",
  manufacturer_brand: "manufacturer_brand",
  man: "manufacturer_brand",
  brand: "manufacturer_brand",
  lote: "lot_number",
  lot: "lot_number",
  lote_no: "lot_number",
  cantidad: "module_count",
  cantidad_modulos: "module_count",
  module_count: "module_count",
  count: "module_count",
  pitch: "pitch_mm",
  pitch_mm: "pitch_mm",
  tipo: "module_type",
  tipo_modulo: "module_type",
  module_type: "module_type",
  tipo_led: "led_type",
  led_type: "led_type",
  led: "led_type",
  observaciones: "observations",
  observacion: "observations",
  obs: "observations",
  notes: "observations",
  integrado_1: "ic_serial_1",
  integrado1: "ic_serial_1",
  ic1: "ic_serial_1",
  integrado_2: "ic_serial_2",
  integrado2: "ic_serial_2",
  ic2: "ic_serial_2",
  integrado_3: "ic_serial_3",
  integrado3: "ic_serial_3",
  ic3: "ic_serial_3",
  ubicacion: "location",
  ubicaci_n: "location",
  location: "location",
  loc: "location",
};

function normHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[\s_]+/g, "_").replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i").replace(/ó/g, "o").replace(/ú/g, "u");
}

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) {
      out.push(cur.trim().replace(/^"|"$/g, ""));
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim().replace(/^"|"$/g, ""));
  return out;
}

interface CsvRow {
  manufacturer_brand?: string;
  lot_number?: string;
  module_count?: string;
  location?: string;
  pitch_mm?: string;
  module_type?: string;
  led_type?: string;
  observations?: string;
  ic_serial_1?: string;
  ic_serial_2?: string;
  ic_serial_3?: string;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const out: CsvRow[] = [];
  let headerMap: Record<number, string> | null = null;

  const first = lines[0].toLowerCase();
  if (first.includes("marca") || first.includes("lote") || first.includes("manufacturer")) {
    headerMap = {};
    splitLine(lines[0]).forEach((h, i) => {
      const key = HEADER_ALIASES[normHeader(h)];
      if (key) headerMap![i] = key;
    });
  }

  for (let i = headerMap ? 1 : 0; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const row: CsvRow = {};
    if (headerMap) {
      cells.forEach((v, idx) => {
        const key = headerMap![idx];
        if (key && v) row[key as keyof CsvRow] = v;
      });
    } else {
      const set = (idx: number, key: keyof CsvRow) => {
        const v = cells[idx];
        if (v !== undefined && v !== "") row[key] = v;
      };
      set(0, "manufacturer_brand");
      set(1, "lot_number");
      set(2, "module_count");
      set(3, "pitch_mm");
      set(4, "module_type");
      set(5, "led_type");
      set(6, "observations");
      set(7, "ic_serial_1");
      set(8, "ic_serial_2");
      set(9, "ic_serial_3");
      set(10, "location");
    }
    if (!row.manufacturer_brand && !row.lot_number && !row.module_count) continue;
    out.push(row);
  }
  return out;
}

function downloadTemplate() {
  const csv = "marca,lote,cantidad,pitch_mm,tipo,tipo_led,observaciones,integrado_1,integrado_2,integrado_3,ubicacion\nROE,LOT-2024-001,64,2.5,P2.5,SMD 2121,Primer lote recibido,ICSN001,ICSN002,ICSN003,Bodega CDMX\n";
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
  const [prefill, setPrefill] = useState<Partial<LotFormData> | null>(null);
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
        pitch: lot.pitch_mm,
        widthMm: lot.width_mm != null ? Number(lot.width_mm) : null,
        heightMm: lot.height_mm != null ? Number(lot.height_mm) : null,
        m2Unit: ((Number(lot.width_mm ?? 320) * Number(lot.height_mm ?? 160)) / 1_000_000),
        moduleType: lot.module_type,
        ledType: lot.led_type,
        obs: lot.observations,
        ics: [lot.ic_serial_1, lot.ic_serial_2, lot.ic_serial_3],
        usedTotal: 0,
        projects: new Map(),
      });
    }
    for (const u of usage) {
      const k = keyOf(u.manufacturer_brand, u.lot_number);
      let agg = byKey.get(k);
      if (!agg) {
        agg = { brand: u.manufacturer_brand, lot: u.lot_number, invQty: 0, location: null, pitch: null, widthMm: null, heightMm: null, m2Unit: 0, moduleType: null, ledType: null, obs: null, ics: [null, null, null], usedTotal: 0, projects: new Map() };
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
          (a.location ?? "").toLowerCase().includes(q) ||
          (a.moduleType ?? "").toLowerCase().includes(q) ||
          (a.ledType ?? "").toLowerCase().includes(q) ||
          (a.obs ?? "").toLowerCase().includes(q) ||
          a.ics.some((s) => (s ?? "").toLowerCase().includes(q))
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

  function toPayload(form: LotFormData) {
    return {
      manufacturer_brand: form.brand,
      lot_number: form.lot,
      module_count: Number(form.count),
      location: form.location.trim() || null,
      pitch_mm: form.pitch.trim() === "" ? null : Number(form.pitch),
      width_mm: form.widthMm.trim() === "" ? 320 : Number(form.widthMm),
      height_mm: form.heightMm.trim() === "" ? 160 : Number(form.heightMm),
      module_type: form.moduleType.trim() || null,
      led_type: form.ledType.trim() || null,
      observations: form.observations.trim() || null,
      ic_serial_1: form.ic1.trim() || null,
      ic_serial_2: form.ic2.trim() || null,
      ic_serial_3: form.ic3.trim() || null,
      status: form.status,
      expected_arrival: form.status !== "available" ? form.eta.trim() || null : null,
    };
  }

  async function saveLot(form: LotFormData) {
    setSaving(true);
    setErr(null);
    try {
      if (editing === "new") {
        await fetchJson("/api/inventory", { method: "POST", body: JSON.stringify(toPayload(form)) });
      } else if (editing) {
        await fetchJson(`/api/inventory/${editing.id}`, { method: "PATCH", body: JSON.stringify(toPayload(form)) });
      }
      setOk(editing === "new" ? "Lote agregado." : "Lote actualizado.");
      setEditing(null);
      setPrefill(null);
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

  function findInventoryLot(brand: string, lot: string): InventoryLot | null {
    return inventory.find((l) => l.manufacturer_brand === brand && l.lot_number === lot) ?? null;
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
          <PrimaryButton onClick={() => { setPrefill(null); setEditing("new"); }} className="text-xs px-2 py-1">Agregar lote</PrimaryButton>
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
          placeholder="Buscar marca, lote, tipo, LED, observación…"
          className="!w-72"
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
                <th className="px-3 py-2 text-right">Pitch</th>
                <th className="px-3 py-2 text-right">m² / módulo</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">LED</th>
                <th className="px-3 py-2 text-left">Integrados de control</th>
                <th className="px-3 py-2 text-left">Ubicación</th>
                <th className="px-3 py-2 text-left">Observaciones</th>
                <th className="cursor-pointer px-3 py-2 text-right" onClick={() => toggleSort("inv")}>Inventario{arrow("inv")}</th>
                <th className="cursor-pointer px-3 py-2 text-right" onClick={() => toggleSort("used")}>Usado{arrow("used")}</th>
                <th className="px-3 py-2 text-right">m² usado</th>
                <th className="cursor-pointer px-3 py-2 text-right" onClick={() => toggleSort("diff")}>Diferencia{arrow("diff")}</th>
                <th className="px-3 py-2 text-right">m² restante</th>
                <th className="px-3 py-2 text-left">Disponibilidad</th>
                <th className="px-3 py-2 text-left">Proyectos donde se ocupó</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={17} className="px-3 py-4 text-sm text-zinc-400">Sin datos.</td></tr>
              ) : (
                filtered.map((row) => {
                  const st = statusOf(row);
                  const invLot = findInventoryLot(row.brand, row.lot);
                  return (
                    <tr key={keyOf(row.brand, row.lot)} className="hover:bg-zinc-50 align-top">
                      <td className="px-3 py-2 font-medium text-zinc-800">{row.brand}</td>
                      <td className="px-3 py-2 text-zinc-600">{row.lot}</td>
                      <td className="px-3 py-2 text-right text-zinc-600">{row.pitch != null ? `${formatNum(row.pitch)} mm` : "—"}</td>
                      <td className="px-3 py-2 text-right text-zinc-700">
                        <ModuleArea widthMm={row.widthMm} heightMm={row.heightMm} count={row.invQty} />
                      </td>
                      <td className="px-3 py-2 text-zinc-600">{row.moduleType ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-600">{row.ledType ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {row.ics.every((s) => !s) ? "—" : (
                          <span className="inline-flex flex-col gap-0.5">
                            {row.ics.map((s, i) => (
                              <span key={i} className={s ? "text-zinc-600" : "text-zinc-300"}>#{i + 1}: {s ?? "—"}</span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-zinc-500">{row.location ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {row.obs ? <span title={row.obs} className="block max-w-[180px] truncate">{row.obs}</span> : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-700">{row.invQty || "—"}</td>
                      <td className="px-3 py-2 text-right text-zinc-700">{row.usedTotal || "0"}</td>
                      <td className="px-3 py-2 text-right text-zinc-700">{row.m2Unit > 0 ? `${formatNum(row.usedTotal * row.m2Unit)} m²` : "—"}</td>
                      <td className="px-3 py-2 text-right font-medium text-zinc-800">{row.invQty - row.usedTotal}</td>
                      <td className="px-3 py-2 text-right font-medium text-zinc-800">{row.m2Unit > 0 ? `${formatNum((row.invQty - row.usedTotal) * row.m2Unit)} m²` : "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {(() => {
                          const inv = invLot;
                          if (!inv) return <span className="text-zinc-300">—</span>;
                          const map = {
                            available: { label: "Disponible", cls: "bg-emerald-100 text-emerald-700" },
                            ordered: { label: "Ordenado", cls: "bg-amber-100 text-amber-700" },
                            in_transit: { label: "En tránsito", cls: "bg-sky-100 text-sky-700" },
                          } as const;
                          const s = map[inv.status as keyof typeof map] ?? map.available;
                          return (
                            <span className="inline-flex flex-col items-start gap-0.5">
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
                              {inv.expected_arrival && (
                                <span className="text-[11px] text-zinc-400">llega {formatDateShort(inv.expected_arrival)}</span>
                              )}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {row.projects.size === 0 ? "—" : (
                          <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
                            {[...row.projects.entries()].map(([projectId, proj]) => (
                              <Link
                                key={projectId}
                                href={`/proyectos/${projectId}`}
                                title={`${proj.code} · ${proj.name}`}
                                className="text-sky-700 hover:underline"
                              >
                                {proj.name}
                              </Link>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`} title={st.text}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {invLot && (
                            <>
                              <button
                                onClick={() => { setPrefill(null); setEditing(invLot); }}
                                className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => removeLot(invLot)}
                                className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                              >
                                Eliminar
                              </button>
                            </>
                          )}
                          {!invLot && row.usedTotal > 0 && (
                            <button
                              onClick={() => {
                                setPrefill({ brand: row.brand, lot: row.lot, count: String(row.usedTotal) });
                                setEditing("new");
                              }}
                              className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100"
                            >
                              Registrar en inventario
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
                        <th className="px-3 py-2 text-right">m² usado</th>
                        <th className="px-3 py-2 text-right">Inventario</th>
                        <th className="px-3 py-2 text-right">Diferencia</th>
                        <th className="px-3 py-2 text-right">m² restante</th>
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
                            <td className="px-3 py-2 text-right text-zinc-700">{row.m2Unit > 0 ? `${formatNum(row.usedTotal * row.m2Unit)} m²` : "—"}</td>
                            <td className="px-3 py-2 text-right text-zinc-700">{row.invQty || "—"}</td>
                            <td className="px-3 py-2 text-right font-medium text-zinc-800">{row.invQty - row.usedTotal}</td>
                            <td className="px-3 py-2 text-right font-medium text-zinc-800">{row.m2Unit > 0 ? `${formatNum((row.invQty - row.usedTotal) * row.m2Unit)} m²` : "—"}</td>
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
          key={editing === "new" ? `new-${prefill?.brand ?? ""}-${prefill?.lot ?? ""}` : editing.id}
          editing={editing}
          onClose={() => { setEditing(null); setPrefill(null); }}
          onSave={saveLot}
          saving={saving}
          initial={prefill ?? undefined}
        />
      )}
    </div>
  );
}

function ModuleArea({ widthMm, heightMm, count }: { widthMm: number | null; heightMm: number | null; count: number }) {
  if (widthMm == null || heightMm == null || widthMm <= 0 || heightMm <= 0) return <span className="text-zinc-300">—</span>;
  const each = (widthMm / 1000) * (heightMm / 1000);
  const lot = count > 0 ? each * count : null;
  return (
    <span className="inline-flex flex-col items-end">
      <span className="font-medium">{each.toLocaleString("es-MX", { maximumFractionDigits: 4 })} m²</span>
      <span className="text-[10px] text-zinc-400">{formatNum(widthMm)} × {formatNum(heightMm)} mm</span>
      {lot != null && <span className="text-[10px] text-zinc-500">lote {lot.toLocaleString("es-MX", { maximumFractionDigits: 2 })} m²</span>}
    </span>
  );
}

function formatNum(v: number): string {
  return String(Number.isInteger(v) ? v : Math.round(v * 100) / 100);
}

function formatDateShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso;
}

function LotModal({
  editing,
  initial,
  onClose,
  onSave,
  saving,
}: {
  editing: InventoryLot | "new";
  initial?: Partial<LotFormData>;
  onClose: () => void;
  onSave: (form: LotFormData) => Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = useState<LotFormData>(
    editing === "new"
      ? { ...EMPTY_FORM, ...initial }
      : {
          brand: editing.manufacturer_brand,
          lot: editing.lot_number,
          count: String(editing.module_count),
          location: editing.location ?? "",
          pitch: editing.pitch_mm != null ? String(editing.pitch_mm) : "",
          widthMm: editing.width_mm != null ? String(Number(editing.width_mm)) : "320",
          heightMm: editing.height_mm != null ? String(Number(editing.height_mm)) : "160",
          moduleType: editing.module_type ?? "",
          ledType: editing.led_type ?? "",
          observations: editing.observations ?? "",
          ic1: editing.ic_serial_1 ?? "",
          ic2: editing.ic_serial_2 ?? "",
          ic3: editing.ic_serial_3 ?? "",
          status: editing.status ?? "available",
          eta: editing.expected_arrival ?? "",
        }
  );
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!form.brand.trim()) return setErr("Indica la marca del fabricante");
    if (!form.lot.trim()) return setErr("Indica el número de lote");
    const n = Number(form.count);
    if (!Number.isInteger(n) || n <= 0) return setErr("La cantidad de módulos debe ser un entero > 0");
    if (form.pitch.trim() !== "") {
      const p = Number(form.pitch);
      if (!Number.isFinite(p) || p < 0) return setErr("El pitch debe ser un número ≥ 0");
    }
    setErr(null);
    await onSave(form);
  }

  return (
    <Modal mark="W9"
      open
      onClose={onClose}
      title={editing === "new" ? (initial?.brand ? "Registrar lote usado" : "Agregar lote") : "Editar lote"}
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marca del fabricante">
            <TextInput value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} placeholder="P. ej. Novastar" />
          </Field>
          <Field label="Número de lote">
            <TextInput value={form.lot} onChange={(v) => setForm({ ...form, lot: v })} placeholder="P. ej. LOT-2024-001" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Cantidad de módulos">
            <TextInput value={form.count} onChange={(v) => setForm({ ...form, count: v })} type="number" />
          </Field>
          <Field label="Pitch (mm)">
            <TextInput value={form.pitch} onChange={(v) => setForm({ ...form, pitch: v })} type="number" placeholder="P. ej. 2.5" />
          </Field>
          <Field label="Ancho (mm)" hint="La mayoría mide 320">
            <TextInput value={form.widthMm} onChange={(v) => setForm({ ...form, widthMm: v })} type="number" />
          </Field>
          <Field label="Alto (mm)" hint="La mayoría mide 160">
            <TextInput value={form.heightMm} onChange={(v) => setForm({ ...form, heightMm: v })} type="number" />
          </Field>
          <Field label="Tipo de módulo">
            <TextInput value={form.moduleType} onChange={(v) => setForm({ ...form, moduleType: v })} placeholder="P. ej. P2.5" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo de LED">
            <TextInput value={form.ledType} onChange={(v) => setForm({ ...form, ledType: v })} placeholder="P. ej. SMD 2121 / DIP" />
          </Field>
          <Field label="Ubicación (opcional)">
            <TextInput value={form.location} onChange={(v) => setForm({ ...form, location: v })} placeholder="P. ej. Bodega CDMX" />
          </Field>
        </div>
        <Field label="Número de serie de los integrados de control" hint="Los 3 integrados de control del módulo (p. ej. tarjetas receptoras/scan).">
          <div className="grid grid-cols-3 gap-3">
            <TextInput value={form.ic1} onChange={(v) => setForm({ ...form, ic1: v })} placeholder="Integrado 1" />
            <TextInput value={form.ic2} onChange={(v) => setForm({ ...form, ic2: v })} placeholder="Integrado 2" />
            <TextInput value={form.ic3} onChange={(v) => setForm({ ...form, ic3: v })} placeholder="Integrado 3" />
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Disponibilidad" hint="Si aún no está físicamente, marca Ordenado o En tránsito y captura la fecha estimada de llegada.">
            <Select
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v })}
              options={[
                { value: "available", label: "Disponible físicamente" },
                { value: "ordered", label: "Ordenado (pedido en firme)" },
                { value: "in_transit", label: "En trayecto de envío" },
              ]}
            />
          </Field>
          {form.status !== "available" && (
            <Field label="Fecha estimada de llegada" hint="Se usa para las proyecciones de inventario.">
              <TextInput value={form.eta} onChange={(v) => setForm({ ...form, eta: v })} type="date" />
            </Field>
          )}
        </div>
        <Field label="Observaciones">
          <Textarea value={form.observations} onChange={(v) => setForm({ ...form, observations: v })} placeholder="Notas del lote…" />
        </Field>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}
