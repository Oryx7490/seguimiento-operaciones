"use client";

import { useEffect, useState } from "react";

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
  faces: {
    id: string;
    width_mm: number;
    height_mm: number;
    cabinets: Cabinet[];
  }[];
};

const SVG = { width: 1120, height: 1020, x: 200, y: 120, size: 720 };

export default function LedDesigner() {
  const [document, setDocument] = useState<ScreenDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/led-designer/reference", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "No se recibió el diseño.");
        return data as ScreenDocument;
      })
      .then((data) => {
        if (active) setDocument(data);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Ocurrió un error inesperado.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const face = document?.faces[0];
  const cabinet = face?.cabinets[0];
  const scale = face ? SVG.size / Math.max(face.width_mm, face.height_mm) : 0;
  const x = (value: number) => SVG.x + value * scale;
  const y = (value: number) => SVG.y + value * scale;
  const width = (value: number) => value * scale;
  const height = (value: number) => value * scale;

  return (
    <div className="min-h-screen bg-[#f4f6f8] px-5 py-7 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-800">
              <span className="h-2 w-2 rounded-full bg-cyan-600" />
              Herramienta de diseño · Etapa E01
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Diseñador de pantallas LED</h1>
            <p className="mt-1 text-sm text-slate-500">Vista ortográfica 2D · medidas en milímetros</p>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
            Prototipo · datos de demostración
          </span>
        </header>

        {error && (
          <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <strong className="font-semibold">No se pudo cargar el diseño.</strong> {error}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-label="Vista 2D del gabinete" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">Frente · vista 2D</h2>
                <p className="mt-0.5 text-xs text-slate-500">Proyección ortográfica · escala gráfica proporcional</p>
              </div>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">1 cara</span>
            </div>
            <div className="bg-[linear-gradient(#f8fafc_1px,transparent_1px),linear-gradient(90deg,#f8fafc_1px,transparent_1px)] bg-[size:24px_24px] px-3 py-2 sm:px-8">
              {loading ? (
                <div className="flex h-[min(68vh,720px)] min-h-[420px] items-center justify-center text-sm text-slate-500">Cargando geometría…</div>
              ) : document && face && cabinet ? (
                <svg viewBox={`0 0 ${SVG.width} ${SVG.height}`} className="mx-auto block max-h-[min(68vh,720px)] min-h-[420px] w-full" role="img" aria-label={`Gabinete de ${cabinet.width_mm} por ${cabinet.height_mm} milímetros con cotas`}>
                  <defs>
                    <marker id="dimension-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse" markerUnits="strokeWidth">
                      <path d="M 7 1 L 1 4 L 7 7" fill="none" stroke="#0e7490" strokeWidth="1.2" />
                    </marker>
                    <linearGradient id="cabinet-face" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0" stopColor="#e5f8fb" />
                      <stop offset="1" stopColor="#c8edf2" />
                    </linearGradient>
                  </defs>
                  <text x={SVG.x} y="68" fill="#64748b" fontSize="18" fontWeight="600">ELEVACIÓN FRONTAL · {document.id}</text>
                  <rect x={x(cabinet.x_mm)} y={y(cabinet.y_mm)} width={width(cabinet.width_mm)} height={height(cabinet.height_mm)} rx="4" fill="url(#cabinet-face)" stroke="#0e7490" strokeWidth="3" />
                  <rect x={x(cabinet.x_mm) + 12} y={y(cabinet.y_mm) + 12} width={Math.max(width(cabinet.width_mm) - 24, 1)} height={Math.max(height(cabinet.height_mm) - 24, 1)} rx="2" fill="none" stroke="#67a9b4" strokeWidth="1.5" strokeDasharray="7 6" />
                  <path d={`M ${x(cabinet.x_mm)} ${y(cabinet.y_mm) - 18} V ${y(cabinet.y_mm) - 54} M ${x(cabinet.x_mm + cabinet.width_mm)} ${y(cabinet.y_mm) - 18} V ${y(cabinet.y_mm) - 54}`} stroke="#94a3b8" strokeWidth="1.5" />
                  <line x1={x(cabinet.x_mm)} y1={y(cabinet.y_mm) - 42} x2={x(cabinet.x_mm + cabinet.width_mm)} y2={y(cabinet.y_mm) - 42} stroke="#0e7490" strokeWidth="2" markerStart="url(#dimension-arrow)" markerEnd="url(#dimension-arrow)" />
                  <rect x={x(cabinet.x_mm + cabinet.width_mm / 2) - 55} y={y(cabinet.y_mm) - 68} width="110" height="30" rx="6" fill="white" />
                  <text x={x(cabinet.x_mm + cabinet.width_mm / 2)} y={y(cabinet.y_mm) - 47} textAnchor="middle" fill="#155e75" fontSize="20" fontWeight="700">{cabinet.width_mm} mm</text>
                  <path d={`M ${x(cabinet.x_mm + cabinet.width_mm) + 18} ${y(cabinet.y_mm)} H ${x(cabinet.x_mm + cabinet.width_mm) + 55} M ${x(cabinet.x_mm + cabinet.width_mm) + 18} ${y(cabinet.y_mm + cabinet.height_mm)} H ${x(cabinet.x_mm + cabinet.width_mm) + 55}`} stroke="#94a3b8" strokeWidth="1.5" />
                  <line x1={x(cabinet.x_mm + cabinet.width_mm) + 42} y1={y(cabinet.y_mm)} x2={x(cabinet.x_mm + cabinet.width_mm) + 42} y2={y(cabinet.y_mm + cabinet.height_mm)} stroke="#0e7490" strokeWidth="2" markerStart="url(#dimension-arrow)" markerEnd="url(#dimension-arrow)" />
                  <rect x={x(cabinet.x_mm + cabinet.width_mm) + 27} y={y(cabinet.y_mm + cabinet.height_mm / 2) - 17} width="112" height="34" rx="6" fill="white" />
                  <text x={x(cabinet.x_mm + cabinet.width_mm) + 83} y={y(cabinet.y_mm + cabinet.height_mm / 2) + 7} textAnchor="middle" fill="#155e75" fontSize="20" fontWeight="700">{cabinet.height_mm} mm</text>
                  <line x1={SVG.x} y1="930" x2={SVG.x + 125} y2="930" stroke="#334155" strokeWidth="4" />
                  <line x1={SVG.x} y1="922" x2={SVG.x} y2="938" stroke="#334155" strokeWidth="2" />
                  <line x1={SVG.x + 125} y1="922" x2={SVG.x + 125} y2="938" stroke="#334155" strokeWidth="2" />
                  <text x={SVG.x} y="963" fill="#64748b" fontSize="15">{Math.round(125 / scale)} mm</text>
                  <text x="560" y="990" textAnchor="middle" fill="#94a3b8" fontSize="14">Origen de cara: esquina inferior izquierda · unidad: mm</text>
                </svg>
              ) : (
                <div className="flex h-[min(68vh,720px)] min-h-[420px] items-center justify-center text-sm text-slate-500">El documento no contiene una cara dibujable.</div>
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ficha de referencia</p>
              <h2 className="mt-2 text-lg font-semibold">{document?.name ?? "Gabinete"}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">{document?.source ?? ""}</p>
              <div className="mt-5 divide-y divide-slate-100">
                <Metric label="Medida del gabinete" value={face && cabinet ? `${cabinet.width_mm} × ${cabinet.height_mm} mm` : "—"} />
                <Metric label="Piezas" value={face ? String(face.cabinets.length) : "—"} />
                <Metric label="Área activa" value={cabinet ? `${((cabinet.width_mm * cabinet.height_mm) / 1_000_000).toFixed(4)} m²` : "—"} />
              </div>
            </section>
            <section className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-5">
              <h2 className="text-sm font-semibold text-cyan-950">Alcance de esta vista</h2>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-cyan-900">
                <li>• Dibujo derivado del documento recibido del motor Python.</li>
                <li>• Una cara y un gabinete sintético de 960 × 960 mm.</li>
                <li>• La edición y la vista 3D llegarán en etapas posteriores.</li>
              </ul>
            </section>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
              Motor: <span className="font-medium text-slate-700">Pydantic · esquema v1</span>
            </div>
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
