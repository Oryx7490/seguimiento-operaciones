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

function areaPct(areaM2: number, targetM2: number): string {
  if (targetM2 <= 0) return "—";
  const pct = ((areaM2 - targetM2) / targetM2) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)} %`;
}

type ManualPlacement = { key: number; model_id: string; x_mm: number; y_mm: number };

const MODEL_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  "hierro-640x640": { fill: "#e0f2fe", stroke: "#0284c7", text: "#075985" },
  "hierro-640x960": { fill: "#ede9fe", stroke: "#7c3aed", text: "#5b21b6" },
  "hierro-960x960": { fill: "#ccfbf1", stroke: "#0d9488", text: "#0f766e" },
  "hierro-1280x960": { fill: "#fef3c7", stroke: "#d97706", text: "#92400e" },
};

const FALLBACK_COLORS = [
  { fill: "#fce7f3", stroke: "#db2777", text: "#9d174d" },
  { fill: "#ecfccb", stroke: "#65a30d", text: "#3f6212" },
  { fill: "#e0e7ff", stroke: "#4f46e5", text: "#3730a3" },
  { fill: "#ffedd5", stroke: "#ea580c", text: "#9a3412" },
  { fill: "#f3e8ff", stroke: "#9333ea", text: "#6b21a8" },
];

function modelColor(modelId: string): { fill: string; stroke: string; text: string } {
  const known = MODEL_COLORS[modelId];
  if (known) return known;
  let hash = 0;
  for (const char of modelId) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
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

  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [manualPlacements, setManualPlacements] = useState<ManualPlacement[]>([]);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [manualMsg, setManualMsg] = useState<string | null>(null);
  const keyCounter = useRef(1);

  // El área a cubrir en modo manual sale de base/altura objetivo.
  const canvasMm = (() => {
    const factor = targetUnit === "m" ? 1000 : 1;
    const width = Math.round(Number(targetWidth) * factor);
    const height = Math.round(Number(targetHeight) * factor);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return { width, height };
  })();

  const catalogModels = catalog?.models ?? [];
  const modelById = (id: string) => catalogModels.find((model) => model.id === id);

  const manualAreaM2 =
    manualPlacements.reduce((area, placement) => {
      const model = modelById(placement.model_id);
      return model ? area + (model.width_mm * model.height_mm) / 1_000_000 : area;
    }, 0);
  const canvasM2 = canvasMm ? (canvasMm.width * canvasMm.height) / 1_000_000 : 0;

  function dropPlacement(event: React.DragEvent<SVGSVGElement>) {
    event.preventDefault();
    const modelId = event.dataTransfer.getData("text/model-id");
    const model = modelId ? modelById(modelId) : undefined;
    if (!model || !canvasMm) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const mScale = Math.min(SVG.maxDrawingWidth / canvasMm.width, SVG.maxDrawingHeight / canvasMm.height);
    const mOriginX = Math.max(30, (SVG.width - SVG.rightMargin - canvasMm.width * mScale) / 2);
    const mOriginY = 190 + (SVG.maxDrawingHeight + 10 - canvasMm.height * mScale) / 2;
    const svgX = ((event.clientX - rect.left) / rect.width) * SVG.width;
    const svgY = ((event.clientY - rect.top) / rect.height) * SVG.height;
    const xMm = Math.round((svgX - mOriginX) / mScale);
    // El cursor marca la esquina superior izquierda de la pieza.
    const yMm = Math.round(canvasMm.height - (svgY - mOriginY) / mScale - model.height_mm);
    if (xMm < 0 || yMm < 0 || xMm + model.width_mm > canvasMm.width || yMm + model.height_mm > canvasMm.height) {
      setManualMsg("Fuera del área a cubrir: la pieza no cabe en ese punto.");
      return;
    }
    const overlaps = manualPlacements.some((placement) => {
      const other = modelById(placement.model_id);
      if (!other) return false;
      return (
        xMm < placement.x_mm + other.width_mm &&
        placement.x_mm < xMm + model.width_mm &&
        yMm < placement.y_mm + other.height_mm &&
        placement.y_mm < yMm + model.height_mm
      );
    });
    if (overlaps) {
      setManualMsg("Esa posición se traslapa con otra pieza.");
      return;
    }
    setManualMsg(null);
    const key = keyCounter.current++;
    setManualPlacements((previous) => [...previous, { key, model_id: model.id, x_mm: xMm, y_mm: yMm }]);
    setSelectedKey(key);
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
  const requestedM2 = fit ? (fit.target_width_mm * fit.target_height_mm) / 1_000_000 : 0;
  // Escala gráfica con un valor redondo de aproximadamente 125 px.
  const scaleBarMm = scale
    ? [100, 200, 500, 1000, 2000, 5000, 10000, 20000].reduce((best, value) =>
        Math.abs(value * scale - 125) < Math.abs(best * scale - 125) ? value : best,
      )
    : 1000;

  // Geometría del lienzo manual (área objetivo).
  const mScale = canvasMm
    ? Math.min(SVG.maxDrawingWidth / canvasMm.width, SVG.maxDrawingHeight / canvasMm.height)
    : 0;
  const mDrawingWidth = canvasMm ? canvasMm.width * mScale : 0;
  const mDrawingHeight = canvasMm ? canvasMm.height * mScale : 0;
  const mOriginX = Math.max(30, (SVG.width - SVG.rightMargin - mDrawingWidth) / 2);
  const mOriginY = 190 + (SVG.maxDrawingHeight + 10 - mDrawingHeight) / 2;
  const mx = (value: number) => mOriginX + value * mScale;
  const my = (value: number) => mOriginY + (canvasMm ? canvasMm.height - value : 0) * mScale;

  return (
    <div className="min-h-screen bg-[#f4f6f8] px-5 py-7 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-800">
              <span className="h-2 w-2 rounded-full bg-cyan-600" />
              Herramienta de diseño · Etapa E03C
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Diseñador de pantallas LED</h1>
            <p className="mt-1 text-sm text-slate-500">Automático y diseñador manual · catálogo de hierro para exterior</p>
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

        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
          <section aria-label="Vista 2D de la pantalla" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold"><span className="mr-2 rounded bg-slate-800 px-1.5 py-0.5 align-middle font-mono text-[10px] font-semibold tracking-wide text-white">VISTA</span>{mode === "manual" ? "Área a cubrir · vista 2D" : "Frente · vista 2D"}</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {mode === "manual"
                    ? "Arrastra gabinetes del catálogo al área"
                    : "Proyección ortográfica · cada gabinete aparece delimitado"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div role="group" aria-label="Modo de operación" className="flex overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setMode("auto")}
                    aria-pressed={mode === "auto"}
                    className={`px-3 py-1.5 ${mode === "auto" ? "bg-cyan-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    Automático
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("manual")}
                    aria-pressed={mode === "manual"}
                    className={`px-3 py-1.5 ${mode === "manual" ? "bg-cyan-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    Diseñador
                  </button>
                </div>
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">1 cara</span>
              </div>
            </div>
            {((mode === "auto" && fit && face && summary) || (mode === "manual" && canvasMm)) && (
              <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/60 px-5 py-3 text-center">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Solicitada</p>
                  <p className="text-base font-semibold tabular-nums text-slate-800">
                    {(mode === "manual" ? canvasM2 : requestedM2).toFixed(4)} m²
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Propuesta vigente</p>
                  <p className="text-base font-semibold tabular-nums text-slate-800">
                    {(mode === "manual" ? manualAreaM2 : (summary?.active_area_m2 ?? 0)).toFixed(4)} m²
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Diferencia</p>
                  <p className={`text-base font-semibold tabular-nums ${(mode === "manual" ? manualAreaM2 : (summary?.active_area_m2 ?? 0)) >= (mode === "manual" ? canvasM2 : requestedM2) ? "text-emerald-700" : "text-rose-700"}`}>
                    {areaPct(
                      mode === "manual" ? manualAreaM2 : (summary?.active_area_m2 ?? 0),
                      mode === "manual" ? canvasM2 : requestedM2,
                    )}
                  </p>
                </div>
              </div>
            )}
            <div className="bg-[linear-gradient(#f8fafc_1px,transparent_1px),linear-gradient(90deg,#f8fafc_1px,transparent_1px)] bg-[size:24px_24px] px-3 py-2 sm:px-8">
              {mode === "manual" ? (
                !canvasMm ? (
                  <div className="flex h-[min(68vh,720px)] min-h-[420px] items-center justify-center text-sm text-slate-500">
                    Captura base y altura objetivo para definir el área a cubrir.
                  </div>
                ) : (
                  <svg
                    viewBox={`0 0 ${SVG.width} ${SVG.height}`}
                    className="mx-auto block max-h-[min(68vh,720px)] min-h-[420px] w-full"
                    role="img"
                    aria-label={`Área a cubrir de ${canvasMm.width} por ${canvasMm.height} mm con ${manualPlacements.length} gabinetes`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={dropPlacement}
                  >
                    <text x={mOriginX} y="68" fill="#64748b" fontSize="18" fontWeight="600">
                      ÁREA A CUBRIR · {canvasMm.width} × {canvasMm.height} mm
                    </text>
                    <rect
                      x={mOriginX}
                      y={my(canvasMm.height)}
                      width={mDrawingWidth}
                      height={mDrawingHeight}
                      fill="#ffffff"
                      fillOpacity="0.6"
                      stroke="#64748b"
                      strokeWidth="2"
                      strokeDasharray="12 8"
                    />
                    {manualPlacements.map((placement, index) => {
                      const model = modelById(placement.model_id);
                      if (!model) return null;
                      const colors = modelColor(placement.model_id);
                      const px = mx(placement.x_mm);
                      const py = my(placement.y_mm + model.height_mm);
                      const pw = model.width_mm * mScale;
                      const ph = model.height_mm * mScale;
                      const selected = placement.key === selectedKey;
                      const labelSize = Math.min(17, ph / 5, pw / 6);
                      return (
                        <g
                          key={placement.key}
                          onClick={() => {
                            setSelectedKey(placement.key);
                            setManualMsg(null);
                          }}
                          className="cursor-pointer"
                        >
                          <title>{`${model.width_mm} × ${model.height_mm} mm · ${model.name}`}</title>
                          <rect
                            x={px}
                            y={py}
                            width={pw}
                            height={ph}
                            rx="3"
                            fill={colors.fill}
                            stroke={selected ? "#ea580c" : colors.stroke}
                            strokeWidth={selected ? 4 : 2.5}
                          />
                          {labelSize >= 7 && (
                            <text x={px + pw / 2} y={py + ph / 2 + labelSize * 0.35} textAnchor="middle" fill={colors.text} fontSize={labelSize} fontWeight="700">
                              P{index + 1}
                            </text>
                          )}
                        </g>
                      );
                    })}
                    <text x="560" y="990" textAnchor="middle" fill="#94a3b8" fontSize="14">Origen local: esquina inferior izquierda · unidad: mm</text>
                  </svg>
                )
              ) : !face || !document ? (
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

                  {fit && showTarget && mode === "auto" && (
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

          <aside className="space-y-5 xl:order-first">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400"><span className="mr-2 rounded bg-slate-800 px-1.5 py-0.5 align-middle font-mono text-[10px] font-semibold tracking-wide text-white">OBJ</span>Medida objetivo</p>
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
            {fit && mode === "auto" && (
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
            <p className="text-[11px] tabular-nums text-slate-500">
            Área: {proposal.area_m2.toFixed(4)} m² ({areaPct(proposal.area_m2, requestedM2)})
            </p>
            <button type="button" onClick={() => applyProposal(proposal)} disabled={generating} className="mt-2 w-full rounded-lg border border-cyan-800 px-3 py-1.5 text-xs font-semibold text-cyan-900 transition hover:bg-cyan-50 disabled:cursor-wait disabled:opacity-60">
            Usar esta medida
            </button>
            </div>
            )                  )}
            </div>
            )}
            </section>

            {mode === "manual" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400"><span className="mr-2 rounded bg-slate-800 px-1.5 py-0.5 align-middle font-mono text-[10px] font-semibold tracking-wide text-white">PAL</span>Gabinetes para arrastrar</h2>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">Arrastra un gabinete al área. La esquina superior izquierda de la pieza queda donde sueltes.</p>
            <div className="mt-3 space-y-2">
            {(catalog?.models ?? []).map((model) => {
              const colors = modelColor(model.id);
              return (
                <div
                  key={model.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/model-id", model.id);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  className="flex cursor-grab items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 active:cursor-grabbing"
                >
                  <span className="h-6 w-6 shrink-0 rounded-md border" style={{ backgroundColor: colors.fill, borderColor: colors.stroke }} />
                  <span>
                    <span className="block text-sm font-semibold tabular-nums text-slate-800">{model.width_mm} × {model.height_mm} mm</span>
                    <span className="block text-[11px] text-slate-500">{model.stock_qty === null ? "existencia sin registrar" : `${model.stock_qty} en existencia`}</span>
                  </span>
                </div>
              );
            })}
            </div>
            {manualMsg && (
              <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{manualMsg}</div>
            )}
            {selectedKey !== null && (() => {
              const selected = manualPlacements.find((placement) => placement.key === selectedKey);
              if (!selected) return null;
              const model = modelById(selected.model_id);
              if (!model) return null;
              return (
                <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-orange-900">Pieza seleccionada</p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-orange-900">
                    {model.width_mm} × {model.height_mm} mm · X {selected.x_mm} · Y {selected.y_mm}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setManualPlacements((previous) => previous.filter((placement) => placement.key !== selectedKey));
                      setSelectedKey(null);
                    }}
                    className="mt-2 w-full rounded-lg border border-orange-700 px-3 py-1.5 text-xs font-semibold text-orange-900 transition hover:bg-orange-100"
                  >
                    Quitar pieza
                  </button>
                </div>
              );
            })()}
            </section>
            )}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400"><span className="mr-2 rounded bg-slate-800 px-1.5 py-0.5 align-middle font-mono text-[10px] font-semibold tracking-wide text-white">CAT</span>Catálogo de gabinetes</h2>
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
          </aside>

                    <aside className="space-y-5">
            {mode === "auto" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400"><span className="mr-2 rounded bg-slate-800 px-1.5 py-0.5 align-middle font-mono text-[10px] font-semibold tracking-wide text-white">MOD</span>Modulación</p>
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
            )}

            

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400"><span className="mr-2 rounded bg-slate-800 px-1.5 py-0.5 align-middle font-mono text-[10px] font-semibold tracking-wide text-white">RES</span>Resumen del diseño</p>
              <h2 className="mt-2 text-lg font-semibold">{mode === "manual" ? "Armado manual" : (document?.name ?? "Pantalla rectangular")}</h2>
              <div className="mt-4 divide-y divide-slate-100">
                <Metric label="Medida total" value={mode === "manual"
                  ? (canvasMm ? `${(canvasMm.width / 1000).toFixed(2)} × ${(canvasMm.height / 1000).toFixed(2)} m` : "—")
                  : (face ? `${(face.width_mm / 1000).toFixed(2)} × ${(face.height_mm / 1000).toFixed(2)} m` : "—")} />
                <Metric label="Gabinetes" value={mode === "manual" ? String(manualPlacements.length) : (summary ? String(summary.cabinet_count) : "—")} />
                <Metric label="Área LED total" value={mode === "manual" ? `${manualAreaM2.toFixed(4)} m²` : (summary ? `${summary.active_area_m2.toFixed(4)} m²` : "—")} />
              </div>
              {mode === "manual" ? (
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
                  Armado manual sin guardar: las piezas se pierden al recargar. El guardado llega en E10.
                </p>
              ) : summary && summary.warnings.length > 0 && (
                <ul className="mt-4 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
                  {summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400"><span className="mr-2 rounded bg-slate-800 px-1.5 py-0.5 align-middle font-mono text-[10px] font-semibold tracking-wide text-white">LST</span>Listado de gabinetes</h2>
              {mode === "manual" ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-100">
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-500">
                  <span>Modelo</span><span>Área</span><span>Cantidad</span>
                </div>
                {(() => {
                  const groups = new Map<string, { model: CabinetModel; quantity: number }>();
                  for (const placement of manualPlacements) {
                    const model = modelById(placement.model_id);
                    if (!model) continue;
                    const entry = groups.get(model.id) ?? { model, quantity: 0 };
                    entry.quantity += 1;
                    groups.set(model.id, entry);
                  }
                  if (groups.size === 0) {
                    return <p className="px-3 py-3 text-xs text-slate-500">Sin piezas todavía. Arrastra gabinetes al área.</p>;
                  }
                  return [...groups.values()].map(({ model, quantity }) => {
                    const colors = modelColor(model.id);
                    return (
                      <div key={model.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-slate-100 px-3 py-3 text-sm first:border-t-0">
                        <span className="flex items-center gap-2">
                          <span className="h-5 w-5 shrink-0 rounded border" style={{ backgroundColor: colors.fill, borderColor: colors.stroke }} />
                          <span>
                            <span className="block font-medium text-slate-700">{model.width_mm} × {model.height_mm} mm</span>
                            <span className="block text-[11px] text-slate-500">{model.name}</span>
                          </span>
                        </span>
                        <span className="tabular-nums text-xs text-slate-600">{((model.width_mm * model.height_mm * quantity) / 1_000_000).toFixed(4)} m²</span>
                        <span className="font-semibold tabular-nums">{quantity}</span>
                      </div>
                    );
                  });
                })()}
              </div>
              ) : (
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
              )}
              {document && mode === "auto" && <p className="mt-2 text-[11px] text-slate-500">Catálogo: {document.catalog.revision} · motor {result?.engine_version}</p>}
              {face && mode === "auto" && (
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
              {mode === "manual" && manualPlacements.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-cyan-800">Ver posiciones de las {manualPlacements.length} piezas</summary>
                  <div className="mt-2 max-h-52 overflow-auto rounded-lg border border-slate-100">
                    <table className="w-full text-left text-[11px] tabular-nums">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="px-2 py-1.5">Pieza</th><th className="px-2 py-1.5">Modelo</th><th className="px-2 py-1.5">X</th><th className="px-2 py-1.5">Y</th></tr></thead>
                      <tbody>{manualPlacements.map((placement, index) => {
                        const model = modelById(placement.model_id);
                        return <tr key={placement.key} className="border-t border-slate-100"><td className="px-2 py-1.5 text-slate-700">P{index + 1}</td><td className="px-2 py-1.5">{model ? `${model.width_mm} × ${model.height_mm}` : "—"}</td><td className="px-2 py-1.5">{placement.x_mm}</td><td className="px-2 py-1.5">{placement.y_mm}</td></tr>;
                      })}</tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">Coordenadas X/Y en mm, con origen en la esquina inferior izquierda.</p>
                </details>
              )}
            </section>

            <section className="rounded-xl border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-xs leading-5 text-cyan-950">
              <strong>Referencia sintética.</strong> No representa una ficha comercial real. El modo Diseñador no guarda todavía y el visor 3D vendrá en E04.
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
