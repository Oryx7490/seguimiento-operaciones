"use client";

import { useCallback, useEffect, useState } from "react";

type Cabinet = {
  id: string;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
};

type ScreenDocument = {
  schema_version: number;
  id: string;
  name: string;
  source: string;
  rows: number;
  columns: number;
  faces: {
    id: string;
    width_mm: number;
    height_mm: number;
    cabinets: Cabinet[];
  }[];
};

async function requestRectangle(rows: number, columns: number): Promise<ScreenDocument> {
  const response = await fetch("/api/led-designer/rectangle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rows, columns }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "No se pudo generar la pantalla.");
  return data as ScreenDocument;
}

const SVG = { width: 1120, height: 1020, maxDrawingWidth: 640, maxDrawingHeight: 620 };

export default function LedDesigner() {
  const [document, setDocument] = useState<ScreenDocument | null>(null);
  const [draftRows, setDraftRows] = useState("3");
  const [draftColumns, setDraftColumns] = useState("4");
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const applyLayout = useCallback(async (rows: number, columns: number) => {
    setGenerating(true);
    setError(null);
    try {
      const data = await requestRectangle(rows, columns);
      setDocument(data);
      setDraftRows(String(data.rows));
      setDraftColumns(String(data.columns));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Ocurrió un error inesperado.");
    } finally {
      setGenerating(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    requestRectangle(3, 4)
      .then((data) => {
        if (active) {
          setDocument(data);
          setDraftRows(String(data.rows));
          setDraftColumns(String(data.columns));
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "No se pudo generar la pantalla.");
      })
      .finally(() => {
        if (active) setInitialLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function submitLayout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rows = Number(draftRows);
    const columns = Number(draftColumns);
    if (
      !Number.isInteger(rows) ||
      !Number.isInteger(columns) ||
      rows < 1 ||
      columns < 1 ||
      rows > 20 ||
      columns > 20 ||
      rows * columns > 400
    ) {
      setError("Usa filas y columnas enteras de 1 a 20; la pantalla admite hasta 400 gabinetes.");
      return;
    }
    void applyLayout(rows, columns);
  }

  const face = document?.faces[0];
  const scale = face
    ? Math.min(SVG.maxDrawingWidth / face.width_mm, SVG.maxDrawingHeight / face.height_mm)
    : 0;
  const drawingWidth = face ? face.width_mm * scale : 0;
  const drawingHeight = face ? face.height_mm * scale : 0;
  const originX = (SVG.width - drawingWidth) / 2;
  const originY = 190 + (SVG.maxDrawingHeight + 10 - drawingHeight) / 2;
  const x = (value: number) => originX + value * scale;
  const y = (value: number) => originY + (face ? face.height_mm - value : 0) * scale;
  const dimensionText = (millimeters: number) => `${millimeters} mm  (${(millimeters / 1000).toFixed(2)} m)`;
  const cabinetCount = face?.cabinets.length ?? 0;
  const cabinetArea = face?.cabinets[0]
    ? (face.cabinets[0].width_mm * face.cabinets[0].height_mm) / 1_000_000
    : 0;
  const totalArea = face
    ? face.cabinets.reduce((area, cabinet) => area + cabinet.width_mm * cabinet.height_mm, 0) / 1_000_000
    : 0;

  return (
    <div className="min-h-screen bg-[#f4f6f8] px-5 py-7 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-800">
              <span className="h-2 w-2 rounded-full bg-cyan-600" />
              Herramienta de diseño · Etapa E02
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Diseñador de pantallas LED</h1>
            <p className="mt-1 text-sm text-slate-500">Modulación rectangular · gabinete sintético de 960 × 960 mm</p>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
            Prototipo · datos de demostración
          </span>
        </header>

        {error && (
          <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <strong className="font-semibold">No se aplicó la modulación.</strong> {error}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-label="Vista 2D de la pantalla" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">Frente · vista 2D</h2>
                <p className="mt-0.5 text-xs text-slate-500">Proyección ortográfica · cada gabinete aparece delimitado</p>
              </div>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">1 cara</span>
            </div>
            <div className="bg-[linear-gradient(#f8fafc_1px,transparent_1px),linear-gradient(90deg,#f8fafc_1px,transparent_1px)] bg-[size:24px_24px] px-3 py-2 sm:px-8">
              {!face ? (
                <div className="flex h-[min(68vh,720px)] min-h-[420px] items-center justify-center text-sm text-slate-500">
                  {initialLoading || generating ? "Generando pantalla…" : "El motor no devolvió una cara dibujable."}
                </div>
              ) : (
                <svg viewBox={`0 0 ${SVG.width} ${SVG.height}`} className="mx-auto block max-h-[min(68vh,720px)] min-h-[420px] w-full" role="img" aria-label={`Pantalla de ${document.columns} columnas por ${document.rows} filas, ${dimensionText(face.width_mm)} por ${dimensionText(face.height_mm)}`}>
                  <defs>
                    <marker id="dimension-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse" markerUnits="strokeWidth">
                      <path d="M 7 1 L 1 4 L 7 7" fill="none" stroke="#0e7490" strokeWidth="1.2" />
                    </marker>
                    <linearGradient id="cabinet-face" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0" stopColor="#e5f8fb" />
                      <stop offset="1" stopColor="#c8edf2" />
                    </linearGradient>
                  </defs>
                  <text x={originX} y="68" fill="#64748b" fontSize="18" fontWeight="600">ELEVACIÓN FRONTAL · {document.id}</text>

                  {face.cabinets.map((cabinet, index) => {
                    const cabinetX = x(cabinet.x_mm);
                    const cabinetY = y(cabinet.y_mm + cabinet.height_mm);
                    const cabinetWidth = cabinet.width_mm * scale;
                    const cabinetHeight = cabinet.height_mm * scale;
                    const inset = Math.min(4, cabinetWidth / 12, cabinetHeight / 12);
                    const row = Math.floor(index / document.columns) + 1;
                    const column = (index % document.columns) + 1;
                    return (
                      <g key={cabinet.id}>
                        <rect x={cabinetX + inset} y={cabinetY + inset} width={cabinetWidth - inset * 2} height={cabinetHeight - inset * 2} rx="3" fill="url(#cabinet-face)" stroke="#0e7490" strokeWidth="2.5" />
                        <text x={cabinetX + cabinetWidth / 2} y={cabinetY + cabinetHeight / 2 + 5} textAnchor="middle" fill="#155e75" fontSize={Math.min(17, cabinetHeight / 5)} fontWeight="600">R{row} · C{column}</text>
                      </g>
                    );
                  })}

                  <path d={`M ${originX} ${originY - 16} V ${originY - 51} M ${originX + drawingWidth} ${originY - 16} V ${originY - 51}`} stroke="#94a3b8" strokeWidth="1.5" />
                  <line x1={originX} y1={originY - 40} x2={originX + drawingWidth} y2={originY - 40} stroke="#0e7490" strokeWidth="2" markerStart="url(#dimension-arrow)" markerEnd="url(#dimension-arrow)" />
                  <rect x={originX + drawingWidth / 2 - 108} y={originY - 66} width="216" height="30" rx="6" fill="white" />
                  <text x={originX + drawingWidth / 2} y={originY - 45} textAnchor="middle" fill="#155e75" fontSize="18" fontWeight="700">{dimensionText(face.width_mm)}</text>

                  <path d={`M ${originX + drawingWidth + 14} ${originY} H ${originX + drawingWidth + 48} M ${originX + drawingWidth + 14} ${originY + drawingHeight} H ${originX + drawingWidth + 48}`} stroke="#94a3b8" strokeWidth="1.5" />
                  <line x1={originX + drawingWidth + 36} y1={originY} x2={originX + drawingWidth + 36} y2={originY + drawingHeight} stroke="#0e7490" strokeWidth="2" markerStart="url(#dimension-arrow)" markerEnd="url(#dimension-arrow)" />
                  <rect x={originX + drawingWidth + 18} y={originY + drawingHeight / 2 - 17} width="178" height="34" rx="6" fill="white" />
                  <text x={originX + drawingWidth + 107} y={originY + drawingHeight / 2 + 7} textAnchor="middle" fill="#155e75" fontSize="17" fontWeight="700">{dimensionText(face.height_mm)}</text>

                  <line x1="230" y1="930" x2="355" y2="930" stroke="#334155" strokeWidth="4" />
                  <line x1="230" y1="922" x2="230" y2="938" stroke="#334155" strokeWidth="2" />
                  <line x1="355" y1="922" x2="355" y2="938" stroke="#334155" strokeWidth="2" />
                  <text x="230" y="963" fill="#64748b" fontSize="15">{Math.round(125 / scale)} mm</text>
                  <text x="560" y="990" textAnchor="middle" fill="#94a3b8" fontSize="14">Origen local: esquina inferior izquierda · unidad: mm</text>
                </svg>
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Modulación</p>
              <form onSubmit={submitLayout} className="mt-3 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-medium text-slate-600">
                    Columnas
                    <input aria-label="Columnas" type="number" inputMode="numeric" min="1" max="20" step="1" value={draftColumns} onChange={(event) => setDraftColumns(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-100" />
                  </label>
                  <label className="text-xs font-medium text-slate-600">
                    Filas
                    <input aria-label="Filas" type="number" inputMode="numeric" min="1" max="20" step="1" value={draftRows} onChange={(event) => setDraftRows(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-100" />
                  </label>
                </div>
                <button type="submit" disabled={generating} className="w-full rounded-lg bg-cyan-800 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-900 disabled:cursor-wait disabled:opacity-60">
                  {generating ? "Generando…" : "Aplicar modulación"}
                </button>
                <p className="text-[11px] leading-4 text-slate-500">De 1 a 20 filas o columnas, con un máximo de 400 gabinetes. Si una propuesta es inválida, se conserva la pantalla actual.</p>
              </form>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Resumen del diseño</p>
              <h2 className="mt-2 text-lg font-semibold">{document?.name ?? "Pantalla rectangular"}</h2>
              <div className="mt-4 divide-y divide-slate-100">
                <Metric label="Medida total" value={face ? `${(face.width_mm / 1000).toFixed(2)} × ${(face.height_mm / 1000).toFixed(2)} m` : "—"} />
                <Metric label="Gabinetes" value={String(cabinetCount)} />
                <Metric label="Área LED total" value={`${totalArea.toFixed(4)} m²`} />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Listado de gabinetes</h2>
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-100">
                <div className="grid grid-cols-[1fr_auto] bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-500">
                  <span>Modelo · demostración</span><span>Cantidad</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] items-center px-3 py-3 text-sm">
                  <span className="font-medium text-slate-700">960 × 960 mm</span><span className="font-semibold tabular-nums">{cabinetCount}</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">Área por gabinete: {cabinetArea.toFixed(4)} m²</p>
              {face && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-cyan-800">Ver posiciones de los {cabinetCount} gabinetes</summary>
                  <div className="mt-2 max-h-52 overflow-auto rounded-lg border border-slate-100">
                    <table className="w-full text-left text-[11px] tabular-nums">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="px-2 py-1.5">ID</th><th className="px-2 py-1.5">X</th><th className="px-2 py-1.5">Y</th></tr></thead>
                      <tbody>{face.cabinets.map((cabinet) => <tr key={cabinet.id} className="border-t border-slate-100"><td className="px-2 py-1.5 text-slate-700">{cabinet.id}</td><td className="px-2 py-1.5">{cabinet.x_mm}</td><td className="px-2 py-1.5">{cabinet.y_mm}</td></tr>)}</tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">Coordenadas X/Y en mm, con origen en la esquina inferior izquierda.</p>
                </details>
              )}
            </section>

            <section className="rounded-xl border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-xs leading-5 text-cyan-950">
              <strong>Referencia sintética.</strong> No representa una ficha comercial real. La edición pieza por pieza y el visor 3D vendrán en etapas posteriores.
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-slate-800">{value}</span>
    </div>
  );
}
