"use client";

import { useEffect, useRef, useState } from "react";

type Vector3 = [number, number, number];

type CabinetModel = {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  depth_mm: number | null;
  status: "demo" | "reference" | "verified" | "approved";
  source: string;
  material: string;
  environment: "interior" | "exterior";
  stock_qty: number | null;
};

type Placement = {
  id: string;
  model_id: string;
  face_id: string;
  x_mm: number;
  y_mm: number;
  rotation_deg: number;
  grid: { row: number; column: number } | null;
};

type Face = {
  id: string;
  name: string;
  origin_mm: Vector3;
  u_axis: Vector3;
  v_axis: Vector3;
  normal: Vector3;
  width_mm: number;
  height_mm: number;
};

type ScreenDocument = {
  schema_version: 2;
  id: string;
  name: string;
  source: string;
  units: "mm";
  template: { type: "rectangle"; params: { rows: number; columns: number; model_id: string } };
  catalog: { revision: string; models: CabinetModel[] };
  faces: Face[];
  placements: Placement[];
  joins: unknown[];
};

type Summary = {
  cabinet_count: number;
  active_area_mm2: number;
  active_area_m2: number;
  faces: { face_id: string; name: string; width_mm: number; height_mm: number; cabinet_count: number; active_area_m2: number }[];
  models: { model_id: string; name: string; status: string; width_mm: number; height_mm: number; depth_mm: number | null; quantity: number; area_m2: number }[];
  warnings: string[];
};

type DesignResponse = { engine_version: string; document: ScreenDocument; summary: Summary };

type Issue = { field: string; message: string };

class EngineError extends Error {
  constructor(message: string, readonly issues: Issue[] = []) {
    super(message);
  }
}

type DisplayError = { message: string; issues: Issue[] };

async function requestRectangle(rows: number | null, columns: number | null, modelId: string, signal: AbortSignal): Promise<DesignResponse> {
  const response = await fetch("/api/led-designer/rectangle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rows, columns, model_id: modelId }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new EngineError(data.error ?? "No se pudo generar la pantalla.", Array.isArray(data.issues) ? data.issues : []);
  }
  return data as DesignResponse;
}

function toDisplayError(reason: unknown): DisplayError {
  if (reason instanceof EngineError) return { message: reason.message, issues: reason.issues };
  if (reason instanceof Error) return { message: reason.message, issues: [] };
  return { message: "Ocurrió un error inesperado.", issues: [] };
}

type FitProposal = {
  rows: number;
  columns: number;
  width_mm: number;
  height_mm: number;
  diff_width_mm: number;
  diff_height_mm: number;
  cabinet_count: number;
  area_mm2: number;
  area_m2: number;
};

type FitResponse = {
  engine_version: string;
  target_width_mm: number;
  target_height_mm: number;
  model_id: string;
  proposals: FitProposal[];
};

async function requestFit(widthMm: number | null, heightMm: number | null, modelId: string): Promise<FitResponse> {
  const response = await fetch("/api/led-designer/fit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target_width_mm: widthMm, target_height_mm: heightMm, model_id: modelId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new EngineError(data.error ?? "No se pudieron calcular propuestas.", Array.isArray(data.issues) ? data.issues : []);
  }
  return data as FitResponse;
}

function formatDiff(diffMm: number): string {
  const sign = diffMm > 0 ? "+" : "";
  return `${sign}${diffMm} mm (${sign}${(diffMm / 1000).toFixed(2)} m)`;
}

// Margen derecho reservado para la cota vertical.
const SVG = { width: 1120, height: 1020, maxDrawingWidth: 860, maxDrawingHeight: 620, rightMargin: 210 };

export default function LedDesigner() {
  const [result, setResult] = useState<DesignResponse | null>(null);
  const [draftRows, setDraftRows] = useState("3");
  const [draftColumns, setDraftColumns] = useState("4");
  const [error, setError] = useState<DisplayError | null>(null);
  const [generating, setGenerating] = useState(true);
  const [targetWidth, setTargetWidth] = useState("4");
  const [targetHeight, setTargetHeight] = useState("3");
  const [targetUnit, setTargetUnit] = useState<"mm" | "m">("m");
  const [fit, setFit] = useState<FitResponse | null>(null);
  const [fitError, setFitError] = useState<DisplayError | null>(null);
  const [fitting, setFitting] = useState(false);
  const [showTarget, setShowTarget] = useState(true);
  const [catalog, setCatalog] = useState<{ revision: string; models: CabinetModel[] } | null>(null);
  const [selectedModelId, setSelectedModelId] = useState("hierro-960x960");
  const [newName, setNewName] = useState("");
  const [newWidth, setNewWidth] = useState("");
  const [newHeight, setNewHeight] = useState("");
  const [newStock, setNewStock] = useState("");
  const [catalogError, setCatalogError] = useState<DisplayError | null>(null);
  const [catalogNotice, setCatalogNotice] = useState<string | null>(null);
  const [addingModel, setAddingModel] = useState(false);
  // Sólo la solicitud más reciente puede actualizar el diseño: una respuesta
  // antigua nunca sustituye el resultado de una edición posterior.
  const latestRequest = useRef<{ id: number; controller: AbortController } | null>(null);

  async function runLayout(rows: number | null, columns: number | null, modelId: string) {
    latestRequest.current?.controller.abort();
    const request = { id: (latestRequest.current?.id ?? 0) + 1, controller: new AbortController() };
    latestRequest.current = request;
    const isCurrent = () => latestRequest.current === request;
    try {
      const data = await requestRectangle(rows, columns, modelId, request.controller.signal);
      if (!isCurrent()) return;
      setResult(data);
      setError(null);
      setDraftRows(String(data.document.template.params.rows));
      setDraftColumns(String(data.document.template.params.columns));
      setSelectedModelId(data.document.template.params.model_id);
    } catch (reason: unknown) {
      if (isCurrent()) setError(toDisplayError(reason));
    } finally {
      if (isCurrent()) setGenerating(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/led-designer/catalog", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new EngineError(data.error ?? "No se pudo leer el catálogo.");
        return data as { revision: string; models: CabinetModel[] };
      })
      .then((data) => {
        if (!active) return;
        setCatalog(data);
        const fallback = data.models.some((model) => model.id === "hierro-960x960")
          ? "hierro-960x960"
          : (data.models[0]?.id ?? "hierro-960x960");
        setSelectedModelId(fallback);
        void runLayout(3, 4, fallback);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(toDisplayError(reason));
          setGenerating(false);
        }
      });
    return () => {
      active = false;
      latestRequest.current?.controller.abort();
    };
  }, []);

  function submitLayout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // El motor es la validación autoritativa: devuelve los errores por campo.
    // Un valor vacío o no numérico viaja como null y se rechaza allí.
    const parse = (value: string) => (value.trim() === "" ? null : Number(value));
    setGenerating(true);
    void runLayout(parse(draftRows), parse(draftColumns), selectedModelId);
  }

  function submitModel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const width = newWidth.trim() === "" ? null : Number(newWidth);
    const height = newHeight.trim() === "" ? null : Number(newHeight);
    const stock = newStock.trim() === "" ? null : Number(newStock);
    setAddingModel(true);
    setCatalogError(null);
    setCatalogNotice(null);
    fetch("/api/led-designer/catalog", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), width_mm: width, height_mm: height, stock_qty: stock }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new EngineError(data.error ?? "No se pudo dar de alta el modelo.", Array.isArray(data.issues) ? data.issues : []);
        }
        return data as CabinetModel;
      })
      .then((model) => {
        setCatalog((previous) =>
          previous ? { ...previous, models: [...previous.models, model] } : previous,
        );
        setSelectedModelId(model.id);
        setNewName("");
        setNewWidth("");
        setNewHeight("");
        setNewStock("");
        setCatalogNotice(`Modelo «${model.name}» dado de alta.`);
      })
      .catch((reason: unknown) => setCatalogError(toDisplayError(reason)))
      .finally(() => setAddingModel(false));
  }

  function submitFit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // La propuesta no modifica el diseño: sólo se aplica al elegir una medida.
    const toMm = (value: string) => {
      if (value.trim() === "") return null;
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return null;
      return Math.round(targetUnit === "m" ? parsed * 1000 : parsed);
    };
    const widthMm = toMm(targetWidth);
    const heightMm = toMm(targetHeight);
    setFitting(true);
    setFitError(null);
    void requestFit(widthMm, heightMm, selectedModelId)
      .then((data) => setFit(data))
      .catch((reason: unknown) => {
        setFit(null);
        setFitError(toDisplayError(reason));
      })
      .finally(() => setFitting(false));
  }

  function applyProposal(proposal: FitProposal) {
    setGenerating(true);
    void runLayout(proposal.rows, proposal.columns, fit?.model_id ?? selectedModelId);
  }

  const document = result?.document;
  const summary = result?.summary;
  const face = document?.faces[0];
  const models = new Map(document?.catalog.models.map((model) => [model.id, model]) ?? []);
  const placements = face ? (document?.placements ?? []).filter((placement) => placement.face_id === face.id) : [];
  const scale = face
    ? Math.min(SVG.maxDrawingWidth / face.width_mm, SVG.maxDrawingHeight / face.height_mm)
    : 0;
  const drawingWidth = face ? face.width_mm * scale : 0;
  const drawingHeight = face ? face.height_mm * scale : 0;
  const originX = Math.max(30, (SVG.width - SVG.rightMargin - drawingWidth) / 2);
  const originY = 190 + (SVG.maxDrawingHeight + 10 - drawingHeight) / 2;
  const x = (value: number) => originX + value * scale;
  const y = (value: number) => originY + (face ? face.height_mm - value : 0) * scale;
  const dimensionText = (millimeters: number) => `${millimeters} mm  (${(millimeters / 1000).toFixed(2)} m)`;
  const params = document?.template.params;
  // Escala gráfica con un valor redondo de aproximadamente 125 px.
  const scaleBarMm = scale
    ? [100, 200, 500, 1000, 2000, 5000, 10000, 20000].reduce((best, value) =>
        Math.abs(value * scale - 125) < Math.abs(best * scale - 125) ? value : best,
      )
    : 1000;

  return (
    <div className="min-h-screen bg-[#f4f6f8] px-5 py-7 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-800">
              <span className="h-2 w-2 rounded-full bg-cyan-600" />
              Herramienta de diseño · Etapa E03B
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Diseñador de pantallas LED</h1>
            <p className="mt-1 text-sm text-slate-500">Modulación rectangular · catálogo de hierro para exterior</p>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
            Prototipo · datos de demostración
          </span>
        </header>

        {error && (
          <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <strong className="font-semibold">No se aplicó la modulación.</strong> {error.message}
            {error.issues.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {error.issues.map((issue) => (
                  <li key={`${issue.field}-${issue.message}`}>
                    {issue.field ? <strong className="font-medium">{issue.field}:</strong> : null} {issue.message}
                  </li>
                ))}
              </ul>
            )}
            {result && <p className="mt-1 text-xs text-rose-700">Se conserva la modulación vigente.</p>}
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
              {!face || !document ? (
                <div className="flex h-[min(68vh,720px)] min-h-[420px] items-center justify-center text-sm text-slate-500">
                  {generating ? "Generando pantalla…" : "El motor no devolvió una cara dibujable."}
                </div>
              ) : (
                <svg viewBox={`0 0 ${SVG.width} ${SVG.height}`} className="mx-auto block max-h-[min(68vh,720px)] min-h-[420px] w-full" role="img" aria-label={`Pantalla de ${params?.columns} columnas por ${params?.rows} filas, ${dimensionText(face.width_mm)} por ${dimensionText(face.height_mm)}`}>
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

                  {placements.map((placement) => {
                    const model = models.get(placement.model_id);
                    if (!model) return null;
                    const cabinetX = x(placement.x_mm);
                    const cabinetY = y(placement.y_mm + model.height_mm);
                    const cabinetWidth = model.width_mm * scale;
                    const cabinetHeight = model.height_mm * scale;
                    const inset = Math.min(4, cabinetWidth / 12, cabinetHeight / 12);
                    const stroke = Math.min(2.5, cabinetWidth / 8, cabinetHeight / 8);
                    // Etiqueta sólo si cabe legible; el ID completo aparece al pasar el cursor.
                    const labelSize = Math.min(17, cabinetHeight / 5, cabinetWidth / 6);
                    return (
                      <g key={placement.id}>
                        <title>{placement.id}</title>
                        <rect x={cabinetX + inset} y={cabinetY + inset} width={cabinetWidth - inset * 2} height={cabinetHeight - inset * 2} rx={Math.min(3, inset)} fill="url(#cabinet-face)" stroke="#0e7490" strokeWidth={stroke} />
                        {placement.grid && labelSize >= 7 && (
                          <text x={cabinetX + cabinetWidth / 2} y={cabinetY + cabinetHeight / 2 + labelSize * 0.35} textAnchor="middle" fill="#155e75" fontSize={labelSize} fontWeight="600">R{placement.grid.row} · C{placement.grid.column}</text>
                        )}
                      </g>
                    );
                  })}

                  {fit && showTarget && (
                    <g>
                      <rect
                        x={x(0)}
                        y={y(face.height_mm)}
                        width={fit.target_width_mm * scale}
                        height={fit.target_height_mm * scale}
                        fill="none"
                        stroke="#e11d48"
                        strokeWidth="2.5"
                        strokeDasharray="10 7"
                      />
                      <rect x={x(0)} y={y(face.height_mm) + fit.target_height_mm * scale + 8} width="330" height="28" rx="6" fill="white" opacity="0.92" />
                      <text x={x(0) + 10} y={y(face.height_mm) + fit.target_height_mm * scale + 29} fill="#e11d48" fontSize="17" fontWeight="700">
                        Medida solicitada: {(fit.target_width_mm / 1000).toFixed(2)} × {(fit.target_height_mm / 1000).toFixed(2)} m
                      </text>
                    </g>
                  )}

                  <path d={`M ${originX} ${originY - 16} V ${originY - 51} M ${originX + drawingWidth} ${originY - 16} V ${originY - 51}`} stroke="#94a3b8" strokeWidth="1.5" />
                  <line x1={originX} y1={originY - 40} x2={originX + drawingWidth} y2={originY - 40} stroke="#0e7490" strokeWidth="2" markerStart="url(#dimension-arrow)" markerEnd="url(#dimension-arrow)" />
                  <rect x={originX + drawingWidth / 2 - 108} y={originY - 66} width="216" height="30" rx="6" fill="white" />
                  <text x={originX + drawingWidth / 2} y={originY - 45} textAnchor="middle" fill="#155e75" fontSize="18" fontWeight="700">{dimensionText(face.width_mm)}</text>

                  <path d={`M ${originX + drawingWidth + 14} ${originY} H ${originX + drawingWidth + 48} M ${originX + drawingWidth + 14} ${originY + drawingHeight} H ${originX + drawingWidth + 48}`} stroke="#94a3b8" strokeWidth="1.5" />
                  <line x1={originX + drawingWidth + 36} y1={originY} x2={originX + drawingWidth + 36} y2={originY + drawingHeight} stroke="#0e7490" strokeWidth="2" markerStart="url(#dimension-arrow)" markerEnd="url(#dimension-arrow)" />
                  <rect x={originX + drawingWidth + 18} y={originY + drawingHeight / 2 - 17} width="178" height="34" rx="6" fill="white" />
                  <text x={originX + drawingWidth + 107} y={originY + drawingHeight / 2 + 7} textAnchor="middle" fill="#155e75" fontSize="17" fontWeight="700">{dimensionText(face.height_mm)}</text>

                  <line x1="230" y1="930" x2={230 + scaleBarMm * scale} y2="930" stroke="#334155" strokeWidth="4" />
                  <line x1="230" y1="922" x2="230" y2="938" stroke="#334155" strokeWidth="2" />
                  <line x1={230 + scaleBarMm * scale} y1="922" x2={230 + scaleBarMm * scale} y2="938" stroke="#334155" strokeWidth="2" />
                  <text x="230" y="963" fill="#64748b" fontSize="15">{scaleBarMm >= 1000 ? `${scaleBarMm / 1000} m` : `${scaleBarMm} mm`}</text>
                  <text x="560" y="990" textAnchor="middle" fill="#94a3b8" fontSize="14">Origen local: esquina inferior izquierda · unidad: mm</text>
                </svg>
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Modulación</p>
              <form onSubmit={submitLayout} noValidate className="mt-3 space-y-4">
                <label className="block text-xs font-medium text-slate-600">
                  Modelo de gabinete
                  <select aria-label="Modelo de gabinete" value={selectedModelId} onChange={(event) => setSelectedModelId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-700">
                    {(catalog?.models ?? []).map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.width_mm} × {model.height_mm} mm · {model.stock_qty === null ? "existencia sin registrar" : `${model.stock_qty} en existencia`}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs font-medium text-slate-600">
                    Columnas
                    <input aria-label="Columnas" type="number" inputMode="numeric" min="1" max="100" step="1" value={draftColumns} onChange={(event) => setDraftColumns(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-100" />
                  </label>
                  <label className="text-xs font-medium text-slate-600">
                    Filas
                    <input aria-label="Filas" type="number" inputMode="numeric" min="1" max="100" step="1" value={draftRows} onChange={(event) => setDraftRows(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-100" />
                  </label>
                </div>
                <button type="submit" disabled={generating} className="w-full rounded-lg bg-cyan-800 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-900 disabled:cursor-wait disabled:opacity-60">
                  {generating ? "Generando…" : "Aplicar modulación"}
                </button>
                <p className="text-[11px] leading-4 text-slate-500">De 1 a 100 filas o columnas, con un máximo de 5,000 gabinetes. Si una propuesta es inválida, se conserva la pantalla actual.</p>
              </form>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Medida objetivo</p>
              <form onSubmit={submitFit} noValidate className="mt-3 space-y-4">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
                  <label className="text-xs font-medium text-slate-600">
                    Base
                    <input aria-label="Base objetivo" type="number" inputMode="decimal" min="0" step="any" value={targetWidth} onChange={(event) => setTargetWidth(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-100" />
                  </label>
                  <label className="text-xs font-medium text-slate-600">
                    Altura
                    <input aria-label="Altura objetivo" type="number" inputMode="decimal" min="0" step="any" value={targetHeight} onChange={(event) => setTargetHeight(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-900 outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-100" />
                  </label>
                  <label className="text-xs font-medium text-slate-600">
                    Unidad
                    <select aria-label="Unidad de medida" value={targetUnit} onChange={(event) => setTargetUnit(event.target.value as "mm" | "m")} className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-2 text-base font-semibold text-slate-900 outline-none focus:border-cyan-700">
                      <option value="m">m</option>
                      <option value="mm">mm</option>
                    </select>
                  </label>
                </div>
                <button type="submit" disabled={fitting} className="w-full rounded-lg bg-cyan-800 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-900 disabled:cursor-wait disabled:opacity-60">
                  {fitting ? "Calculando…" : "Proponer medidas"}
                </button>
                <p className="text-[11px] leading-4 text-slate-500">Muestra medidas construibles sin modificar el diseño; tú eliges cuál aplicar.</p>
              </form>
              {fitError && (
                <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  <strong className="font-semibold">{fitError.message}</strong>
                  {fitError.issues.length > 0 && (
                    <ul className="mt-1 list-disc pl-5">
                      {fitError.issues.map((issue) => (
                        <li key={`${issue.field}-${issue.message}`}>
                          {issue.field ? <strong className="font-medium">{issue.field}:</strong> : null} {issue.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {fit && (
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] text-slate-500">
                    Objetivo: {(fit.target_width_mm / 1000).toFixed(2)} × {(fit.target_height_mm / 1000).toFixed(2)} m
                  </p>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                    <input type="checkbox" checked={showTarget} onChange={(event) => setShowTarget(event.target.checked)} className="h-4 w-4 accent-rose-700" />
                    Mostrar la medida solicitada sobre el diseño
                  </label>
                  {fit.proposals.length === 0 && (
                    <p className="text-xs text-slate-600">Sin propuestas dentro de los límites para esta medida.</p>
                  )}
                  {fit.proposals.map((proposal) => (
                    <div key={`${proposal.rows}x${proposal.columns}`} className="rounded-lg border border-slate-200 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold tabular-nums">
                          {(proposal.width_mm / 1000).toFixed(2)} × {(proposal.height_mm / 1000).toFixed(2)} m
                        </span>
                        <span className="text-xs tabular-nums text-slate-500">{proposal.columns} × {proposal.rows} · {proposal.cabinet_count} gab.</span>
                      </div>
                      <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
                        Diferencia: {formatDiff(proposal.diff_width_mm)} · {formatDiff(proposal.diff_height_mm)}
                      </p>
                      <button type="button" onClick={() => applyProposal(proposal)} disabled={generating} className="mt-2 w-full rounded-lg border border-cyan-800 px-3 py-1.5 text-xs font-semibold text-cyan-900 transition hover:bg-cyan-50 disabled:cursor-wait disabled:opacity-60">
                        Usar esta medida
                      </button>
                    </div>
                  )                  )}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Catálogo de gabinetes</h2>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Hierro para exterior{ catalog ? ` · revisión ${catalog.revision}` : ""}. La existencia se captura a mano; el inventario real se vinculará después.
              </p>
              <div className="mt-3 space-y-2">
                {(catalog?.models ?? []).map((model) => (
                  <div key={model.id} className="rounded-lg border border-slate-200 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold tabular-nums">{model.width_mm} × {model.height_mm} mm</span>
                      <span className="text-[11px] text-slate-500">{model.status === "demo" ? "demostración" : model.status}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">{model.name} · {model.material} · {model.environment}</p>
                    <p className="text-[11px] tabular-nums text-slate-600">
                      Existencia: {model.stock_qty === null ? "sin registrar" : model.stock_qty}
                    </p>
                  </div>
                ))}
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-cyan-800">Dar de alta un modelo</summary>
                <form onSubmit={submitModel} noValidate className="mt-3 space-y-3">
                  <label className="block text-xs font-medium text-slate-600">
                    Nombre
                    <input aria-label="Nombre del modelo" type="text" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Hierro exterior 500 × 500 mm" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-700" />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs font-medium text-slate-600">
                      Ancho (mm)
                      <input aria-label="Ancho del modelo" type="number" inputMode="numeric" min="1" step="1" value={newWidth} onChange={(event) => setNewWidth(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-700" />
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      Alto (mm)
                      <input aria-label="Alto del modelo" type="number" inputMode="numeric" min="1" step="1" value={newHeight} onChange={(event) => setNewHeight(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-700" />
                    </label>
                  </div>
                  <label className="block text-xs font-medium text-slate-600">
                    Existencia (opcional)
                    <input aria-label="Existencia del modelo" type="number" inputMode="numeric" min="0" step="1" value={newStock} onChange={(event) => setNewStock(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-700" />
                  </label>
                  <button type="submit" disabled={addingModel} className="w-full rounded-lg bg-cyan-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-900 disabled:cursor-wait disabled:opacity-60">
                    {addingModel ? "Guardando…" : "Dar de alta"}
                  </button>
                </form>
              </details>
              {catalogNotice && <p className="mt-2 text-xs text-emerald-800">{catalogNotice}</p>}
              {catalogError && (
                <div role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  <strong className="font-semibold">{catalogError.message}</strong>
                  {catalogError.issues.length > 0 && (
                    <ul className="mt-1 list-disc pl-5">
                      {catalogError.issues.map((issue) => (
                        <li key={`${issue.field}-${issue.message}`}>
                          {issue.field ? <strong className="font-medium">{issue.field}:</strong> : null} {issue.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Resumen del diseño</p>
              <h2 className="mt-2 text-lg font-semibold">{document?.name ?? "Pantalla rectangular"}</h2>
              <div className="mt-4 divide-y divide-slate-100">
                <Metric label="Medida total" value={face ? `${(face.width_mm / 1000).toFixed(2)} × ${(face.height_mm / 1000).toFixed(2)} m` : "—"} />
                <Metric label="Gabinetes" value={summary ? String(summary.cabinet_count) : "—"} />
                <Metric label="Área LED total" value={summary ? `${summary.active_area_m2.toFixed(4)} m²` : "—"} />
              </div>
              {summary && summary.warnings.length > 0 && (
                <ul className="mt-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
                  {summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Listado de gabinetes</h2>
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-100">
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-500">
                  <span>Modelo</span><span>Área</span><span>Cantidad</span>
                </div>
                {summary?.models.map((line) => (
                  <div key={line.model_id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-slate-100 px-3 py-3 text-sm first:border-t-0">
                    <span>
                      <span className="block font-medium text-slate-700">{line.width_mm} × {line.height_mm} mm</span>
                      <span className="block text-[11px] text-slate-500">{line.name} · prof. {line.depth_mm === null ? "desconocida" : `${line.depth_mm} mm`}</span>
                    </span>
                    <span className="tabular-nums text-xs text-slate-600">{line.area_m2.toFixed(4)} m²</span>
                    <span className="font-semibold tabular-nums">{line.quantity}</span>
                  </div>
                ))}
              </div>
              {document && <p className="mt-2 text-[11px] text-slate-500">Catálogo: {document.catalog.revision} · motor {result?.engine_version}</p>}
              {face && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-cyan-800">Ver posiciones de los {placements.length} gabinetes</summary>
                  <div className="mt-2 max-h-52 overflow-auto rounded-lg border border-slate-100">
                    <table className="w-full text-left text-[11px] tabular-nums">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="px-2 py-1.5">ID</th><th className="px-2 py-1.5">Fila</th><th className="px-2 py-1.5">Col.</th><th className="px-2 py-1.5">X</th><th className="px-2 py-1.5">Y</th></tr></thead>
                      <tbody>{placements.map((placement) => <tr key={placement.id} className="border-t border-slate-100"><td className="px-2 py-1.5 text-slate-700">{placement.id}</td><td className="px-2 py-1.5">{placement.grid?.row ?? "—"}</td><td className="px-2 py-1.5">{placement.grid?.column ?? "—"}</td><td className="px-2 py-1.5">{placement.x_mm}</td><td className="px-2 py-1.5">{placement.y_mm}</td></tr>)}</tbody>
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
