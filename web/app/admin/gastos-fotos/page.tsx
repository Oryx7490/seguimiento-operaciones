"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { EmptyState, Spinner } from "@/app/components/ui";

type AssociationType = "project" | "ticket" | "maintenance_policy";
type Destination = { id: string; type: AssociationType; code: string | null; title: string; status: string; context: string | null };
type Photo = {
  sha256: string;
  content_type: string | null;
  file_name: string | null;
  caption: string | null;
  sender_display_name: string | null;
  conversation_name: string | null;
  at: string | null;
  review_status: string;
  model_suggestion: Record<string, unknown> | null;
  suggested_project_id: string | null;
  suggested_project_code: string | null;
  suggested_project_name: string | null;
  reviewed_is_expense: boolean | null;
  reviewed_category: string | null;
  reviewed_project_id: string | null;
  reviewed_project_code: string | null;
  reviewed_project_name: string | null;
  reviewed_ticket_id: string | null;
  reviewed_ticket_code: string | null;
  reviewed_ticket_title: string | null;
  reviewed_maintenance_policy_id: string | null;
  reviewed_maintenance_policy_name: string | null;
  reviewed_maintenance_policy_client: string | null;
  reviewed_vendor: string | null;
  reviewed_expense_date: string | null;
  reviewed_total: string | number | null;
  reviewed_tax: string | number | null;
  reviewed_currency: string | null;
  reviewed_description: string | null;
  reviewed_text: string | null;
  review_note: string | null;
  ocr_text: string | null;
};
type Comment = { id: string; body: string; created_at: string; author_name: string | null };
type Detail = { review: Record<string, unknown> | null; comments: Comment[] };
type ProjectTotal = { project_id: string; code: string; name: string; currency: string; evidence_count: number; total: string | number };

const CATEGORIES = [
  ["factura", "Factura"],
  ["ticket", "Ticket"],
  ["recibo", "Recibo"],
  ["hoja_servicio", "Hoja de servicio"],
  ["hoja_entrega", "Hoja de entrega"],
  ["orden_compra", "Orden de compra"],
  ["nota_gasto", "Nota de gasto"],
  ["documento_general", "Documento general"],
  ["sin_documento", "Sin documento"],
  ["otro", "Otro"],
];

const moneyText = (value: unknown) => value === null || value === undefined || value === "" ? "" : String(value);
const dateText = (value: unknown) => typeof value === "string" ? value.slice(0, 10) : "";
const strValue = (value: unknown) => typeof value === "string" ? value : "";
const stateLabel: Record<string, string> = { pending: "Pendiente", confirmed: "Confirmada", corrected: "Corregida", rejected: "Descartada" };

function initialAssociation(photo: Photo): { type: AssociationType; id: string; label: string } {
  if (photo.reviewed_ticket_id) {
    return { type: "ticket", id: photo.reviewed_ticket_id, label: `${photo.reviewed_ticket_code || "Ticket"} · ${photo.reviewed_ticket_title || ""}`.trim() };
  }
  if (photo.reviewed_maintenance_policy_id) {
    const client = photo.reviewed_maintenance_policy_client ? ` — ${photo.reviewed_maintenance_policy_client}` : "";
    return { type: "maintenance_policy", id: photo.reviewed_maintenance_policy_id, label: `${photo.reviewed_maintenance_policy_name || "Póliza de mantenimiento"}${client}` };
  }
  const projectId = photo.reviewed_project_id || photo.suggested_project_id || "";
  const projectLabel = photo.reviewed_project_id
    ? `${photo.reviewed_project_code || "Proyecto"} · ${photo.reviewed_project_name || ""}`.trim()
    : photo.suggested_project_id
      ? `${photo.suggested_project_code || "Proyecto sugerido"} · ${photo.suggested_project_name || ""}`.trim()
      : "";
  return { type: "project", id: projectId, label: projectLabel };
}

export default function ExpensePhotosPage() {
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [batchError, setBatchError] = useState("");
  const stopBatch = useRef(false);
  const query = useMemo(() => {
    const p = new URLSearchParams({ status, limit: "150" });
    if (q.trim()) p.set("q", q.trim());
    return p.toString();
  }, [status, q]);
  const list = useResource<{ items: Photo[]; total: number; project_totals: ProjectTotal[] }>(`/api/admin/gasto-fotos?${query}`);
  const photos = list.data?.items ?? [];
  const selected = photos.find((photo) => photo.sha256 === selectedSha) ?? photos[0] ?? null;

  async function processPending() {
    const pending = photos.filter((photo) => photo.review_status === "pending" && !photo.model_suggestion);
    if (!pending.length) return;
    stopBatch.current = false;
    setBatch({ done: 0, total: pending.length });
    setBatchError("");
    let done = 0;
    let consecutiveFailures = 0;
    for (const photo of pending) {
      if (stopBatch.current) break;
      try {
        await fetchJson("/api/admin/gasto-fotos/procesar", { method: "POST", body: JSON.stringify({ sha256: photo.sha256 }) });
        consecutiveFailures = 0;
      } catch (e) {
        consecutiveFailures += 1;
        setBatchError(String(e));
        if (consecutiveFailures >= 2) break;
      }
      done += 1;
      setBatch({ done, total: pending.length });
    }
    setBatch(null);
    list.reload();
  }

  return (
    <div className="p-5 lg:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Documentos desde fotos</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            Clasifica comprobantes, hojas de servicio y hojas de entrega; extrae su contenido y vincúlalos con el proyecto, ticket o póliza correspondiente. Qwen conserva su explicación y tus correcciones quedan registradas para revisarlas juntos.
          </p>
        </div>
        <span className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Evidencia de gasto revisada; todavía no es un asiento contable.
        </span>
      </div>

      {list.error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{list.error}</div>}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {[["pending", "Pendientes"], ["reviewed", "Revisadas"], ["all", "Todas"]].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setStatus(value)} className={`rounded-md px-3 py-1.5 text-sm ${status === value ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
            {label}
          </button>
        ))}
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar folio, proveedor, proyecto o texto…" className="ml-auto w-full max-w-sm rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500" />
        <button type="button" onClick={list.reload} className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">Recargar</button>
        {batch ? <button type="button" onClick={() => { stopBatch.current = true; }} className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-red-700">Detener ({batch.done}/{batch.total})</button> : status !== "reviewed" && <button type="button" onClick={processPending} disabled={photos.every((photo) => photo.model_suggestion || photo.review_status !== "pending")} className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50">Procesar documentos pendientes con Qwen</button>}
      </div>

      {batch && <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">Procesamiento secuencial: {batch.done} de {batch.total}. Mantén esta página abierta mientras termina; cada documento queda guardado al acabar.</div>}
      {batchError && <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{batchError}</div>}

      {!!list.data?.project_totals?.length && <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-800">Gasto revisado asociado a proyectos en marcha</h2>
          <p className="text-[11px] text-zinc-500">Suma solo importes confirmados desde fotos, agrupados por moneda.</p>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {list.data.project_totals.map((row) => <div key={`${row.project_id}:${row.currency}`} className="min-w-48 rounded-md bg-zinc-50 px-3 py-2">
            <p className="truncate text-xs font-medium text-zinc-700">{row.code} · {row.name}</p>
            <p className="mt-1 text-base font-semibold text-zinc-900">{row.currency} {new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(row.total))}</p>
            <p className="text-[10px] text-zinc-500">{row.evidence_count} {Number(row.evidence_count) === 1 ? "evidencia" : "evidencias"}</p>
          </div>)}
        </div>
      </section>}

      <div className="mt-4 grid min-h-[70vh] gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2.5 text-xs text-zinc-500">
            <span>Documentos disponibles</span><span>{list.data?.total ?? 0}</span>
          </div>
          {!list.data && !list.error ? <div className="p-5"><Spinner /></div> : photos.length === 0 ? (
            <div className="p-4"><EmptyState title="No hay documentos disponibles"><span>Se omiten imágenes con rostros detectados o que aún no tienen un análisis facial completo. Las copias exactas se consolidan por archivo.</span></EmptyState></div>
          ) : (
            <div className="max-h-[75vh] divide-y divide-zinc-100 overflow-y-auto">
              {photos.map((photo) => {
                const suggestion = photo.model_suggestion ?? {};
                const destinationName = photo.reviewed_ticket_id
                  ? `${photo.reviewed_ticket_code} · ${photo.reviewed_ticket_title}`
                  : photo.reviewed_maintenance_policy_id
                    ? `Póliza · ${photo.reviewed_maintenance_policy_name}`
                    : photo.reviewed_project_code
                      ? `${photo.reviewed_project_code} · ${photo.reviewed_project_name}`
                      : photo.suggested_project_code
                        ? `${photo.suggested_project_code} · ${photo.suggested_project_name}`
                        : "Sin destino sugerido";
                return (
                  <button key={photo.sha256} type="button" onClick={() => setSelectedSha(photo.sha256)} className={`flex w-full gap-3 p-3 text-left transition ${selected?.sha256 === photo.sha256 ? "bg-blue-50 ring-1 ring-inset ring-blue-200" : "hover:bg-zinc-50"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/whatsapp/media/${photo.sha256}/thumb`} alt="" className="h-[76px] w-[76px] shrink-0 rounded-md bg-zinc-100 object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-1">
                        <span className="truncate text-sm font-medium text-zinc-800">{strValue(photo.reviewed_vendor) || strValue(suggestion.vendor) || photo.file_name || "Foto sin proveedor"}</span>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${photo.review_status === "corrected" ? "bg-violet-100 text-violet-800" : photo.review_status === "confirmed" ? "bg-green-100 text-green-800" : photo.review_status === "rejected" ? "bg-zinc-100 text-zinc-600" : "bg-amber-100 text-amber-800"}`}>{stateLabel[photo.review_status] ?? photo.review_status}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-zinc-600">{destinationName}</span>
                      <span className="mt-1 block truncate text-xs text-zinc-400">{photo.at ? new Date(photo.at).toLocaleString("es-MX") : "Sin fecha"} · {photo.sender_display_name || photo.conversation_name || "WhatsApp"}</span>
                      <span className="mt-1 block truncate text-xs text-zinc-500">{strValue(photo.reviewed_category) || strValue(suggestion.document_type) || "Sin clasificar"}{suggestion.amount_total !== null && suggestion.amount_total !== undefined ? ` · ${strValue(suggestion.currency) || "MXN"} ${suggestion.amount_total}` : ""}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {selected ? <ReviewPanel key={selected.sha256} photo={selected} onRefresh={list.reload} /> : (
          <section className="flex items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-500">Selecciona un documento para revisar.</section>
        )}
      </div>
    </div>
  );
}

function ReviewPanel({ photo, onRefresh }: { photo: Photo; onRefresh: () => void }) {
  const detail = useResource<Detail>(`/api/admin/gasto-fotos/${photo.sha256}`);
  const initial = initialAssociation(photo);
  const suggestion = photo.model_suggestion ?? {};
  const hasReview = photo.review_status !== "pending";
  const [modelSuggestion, setModelSuggestion] = useState<Record<string, unknown>>(suggestion);
  const [isExpense, setIsExpense] = useState(photo.reviewed_is_expense ?? Boolean(suggestion.is_expense));
  const [category, setCategory] = useState(photo.reviewed_category || strValue(suggestion.document_type) || "documento_general");
  const [associationType, setAssociationType] = useState<AssociationType>(initial.type);
  const [associationId, setAssociationId] = useState(initial.id);
  const [associationLabel, setAssociationLabel] = useState(initial.label);
  const [associationQuery, setAssociationQuery] = useState("");
  const [debouncedAssociationQuery, setDebouncedAssociationQuery] = useState("");
  const [destinationResults, setDestinationResults] = useState<Destination[] | null>(null);
  const [destinationBusy, setDestinationBusy] = useState(false);
  const [destinationError, setDestinationError] = useState("");
  const [vendor, setVendor] = useState(photo.reviewed_vendor || strValue(suggestion.vendor));
  const [date, setDate] = useState(dateText(photo.reviewed_expense_date || suggestion.expense_date));
  const [total, setTotal] = useState(moneyText(photo.reviewed_total ?? suggestion.amount_total));
  const [tax, setTax] = useState(moneyText(photo.reviewed_tax ?? suggestion.tax_amount));
  const [currency, setCurrency] = useState(photo.reviewed_currency || strValue(suggestion.currency) || "MXN");
  const [description, setDescription] = useState(photo.reviewed_description || strValue(suggestion.description));
  const [extractedText, setExtractedText] = useState(photo.reviewed_text || strValue(suggestion.extracted_text) || photo.ocr_text || "");
  const [note, setNote] = useState(photo.review_note || "");
  const [newComment, setNewComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedAssociationQuery(associationQuery.trim()), 250);
    return () => clearTimeout(timeout);
  }, [associationQuery]);
  useEffect(() => {
    let cancelled = false;
    if (debouncedAssociationQuery.length < 2) {
      setDestinationResults([]);
      setDestinationError("");
      setDestinationBusy(false);
      return () => { cancelled = true; };
    }
    setDestinationResults(null);
    setDestinationError("");
    setDestinationBusy(true);
    fetchJson<{ items: Destination[] }>(`/api/admin/gasto-fotos/destinos?type=${associationType}&q=${encodeURIComponent(debouncedAssociationQuery)}`)
      .then((result) => { if (!cancelled) setDestinationResults(result.items); })
      .catch((err) => { if (!cancelled) setDestinationError(String(err)); })
      .finally(() => { if (!cancelled) setDestinationBusy(false); });
    return () => { cancelled = true; };
  }, [associationType, debouncedAssociationQuery]);

  async function analyze() {
    setAnalysisBusy(true); setError(""); setNotice("");
    try {
      const result = await fetchJson<{ suggestion: Record<string, unknown> }>("/api/admin/gasto-fotos/procesar", {
        method: "POST", body: JSON.stringify({ sha256: photo.sha256 }),
      });
      const next = result.suggestion;
      setModelSuggestion(next);
      if (!hasReview) {
        setIsExpense(Boolean(next.is_expense));
        setCategory(strValue(next.document_type) || "documento_general");
        if (!associationId && associationType === "project" && strValue(next.project_id)) {
          setAssociationType("project");
          setAssociationId(strValue(next.project_id));
          const projectLabel = [strValue(next.project_code), strValue(next.project_name)].filter(Boolean).join(" · ");
          setAssociationLabel(projectLabel || "Proyecto sugerido por Qwen");
        }
        setVendor(strValue(next.vendor));
        setDate(dateText(next.expense_date));
        setTotal(moneyText(next.amount_total));
        setTax(moneyText(next.tax_amount));
        setCurrency(strValue(next.currency) || "MXN");
        setDescription(strValue(next.description));
        setExtractedText(strValue(next.extracted_text) || photo.ocr_text || "");
      }
      setNotice("Qwen terminó el análisis. Revisa cada campo y la evidencia antes de confirmarlo.");
      onRefresh();
    } catch (e) { setError(String(e)); }
    finally { setAnalysisBusy(false); }
  }

  async function save(reviewStatus: "confirmed" | "corrected" | "rejected") {
    setBusy(true); setError(""); setNotice("");
    try {
      await fetchJson(`/api/admin/gasto-fotos/${photo.sha256}`, {
        method: "PATCH",
        body: JSON.stringify({
          review_status: reviewStatus, is_expense: isExpense, category,
          association_type: associationType, association_id: associationId || null,
          vendor, expense_date: date || null, total: total || null, tax: tax || null, currency,
          description, extracted_text: extractedText, note,
        }),
      });
      setNotice(reviewStatus === "rejected" ? "Documento descartado." : reviewStatus === "corrected" ? "Corrección guardada y destino vinculado." : "Revisión confirmada y destino vinculado.");
      onRefresh();
      detail.reload();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function comment() {
    const body = newComment.trim();
    if (!body) return;
    setBusy(true); setError("");
    try {
      await fetchJson(`/api/admin/gasto-fotos/${photo.sha256}`, { method: "POST", body: JSON.stringify({ body }) });
      setNewComment(""); detail.reload();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  const rationale = strValue(modelSuggestion.rationale);
  const matchReason = strValue(modelSuggestion.project_match_reason);

  return (
    <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</div>}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-zinc-900">{photo.file_name || "Foto de WhatsApp"}</h2>
              <p className="mt-1 text-xs text-zinc-500">{photo.sender_display_name || photo.conversation_name || "WhatsApp"} · {photo.at ? new Date(photo.at).toLocaleString("es-MX") : "Fecha desconocida"}</p>
              {photo.caption && <p className="mt-2 text-sm text-zinc-600">{photo.caption}</p>}
            </div>
            <button type="button" disabled={analysisBusy} onClick={analyze} className="shrink-0 rounded-md bg-blue-700 px-3 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50">
              {analysisBusy ? "Analizando…" : "Analizar con Qwen"}
            </button>
          </div>
          <div className="mt-3 flex max-h-[70vh] min-h-[260px] items-center justify-center overflow-hidden rounded-md bg-zinc-900 p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/whatsapp/media/${photo.sha256}`} alt="Documento fotografiado" className="max-h-[70vh] w-auto object-contain" />
          </div>
          <p className="mt-2 break-all text-[10px] text-zinc-400">SHA-256: {photo.sha256}</p>
          {photo.model_suggestion && <p className="mt-1 text-xs text-zinc-500">Confianza declarada por Qwen: {typeof modelSuggestion.confidence === "number" ? `${Math.round(modelSuggestion.confidence * 100)}%` : "sin dato"}. Confirma mirando el original.</p>}
        </div>

        <div className="min-w-0 space-y-4">
          <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3">
            <h3 className="text-sm font-semibold text-zinc-800">Propuesta y explicación de Qwen</h3>
            {rationale || matchReason ? <div className="mt-2 space-y-2 text-sm text-zinc-700">
              {rationale && <p>{rationale}</p>}{matchReason && <p><span className="font-medium">Señales para el proyecto: </span>{matchReason}</p>}
              {Array.isArray(modelSuggestion.project_clues) && modelSuggestion.project_clues.length > 0 && <p className="text-xs text-zinc-500">Pistas: {(modelSuggestion.project_clues as unknown[]).map(String).join(" · ")}</p>}
              {Array.isArray(modelSuggestion.line_items) && modelSuggestion.line_items.some((item) => item && typeof item === "object" && !Array.isArray(item)) && <div className="border-t border-blue-100 pt-2 text-xs"><p className="font-medium text-zinc-600">Conceptos leídos</p><ul className="mt-1 space-y-1">{(modelSuggestion.line_items as Record<string, unknown>[]).filter((item) => item && typeof item === "object" && !Array.isArray(item)).slice(0, 8).map((item, index) => <li key={index} className="flex justify-between gap-3"><span>{strValue(item.description) || "Concepto"}</span><span className="shrink-0">{item.amount === null || item.amount === undefined ? "" : `${strValue(modelSuggestion.currency) || "MXN"} ${String(item.amount)}`}</span></li>)}</ul></div>}
            </div> : <p className="mt-1 text-xs text-zinc-500">Todavía no se ha procesado esta foto con el modelo. Puedes usar el OCR existente como punto de partida.</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-md border border-zinc-200 p-2.5 text-sm text-zinc-700">
              <input type="checkbox" checked={isExpense} onChange={(e) => setIsExpense(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
              Esta imagen contiene evidencia de un gasto
            </label>
            <label className="text-xs font-medium text-zinc-600">Tipo de documento
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-800">
                {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              {category === "hoja_servicio" && <span className="mt-1 block font-normal text-zinc-500">Puede asociarse a un proyecto, ticket o póliza de mantenimiento.</span>}
            </label>
            <div className="space-y-2 sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-600">Asociar documento con
                <select value={associationType} onChange={(event) => {
                  setAssociationType(event.target.value as AssociationType);
                  setAssociationId(""); setAssociationLabel(""); setAssociationQuery(""); setDebouncedAssociationQuery("");
                }} className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-800">
                  <option value="project">Proyecto</option>
                  <option value="ticket">Ticket</option>
                  <option value="maintenance_policy">Póliza de mantenimiento</option>
                </select>
              </label>
              {associationId && <div className="flex items-start justify-between gap-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
                <span className="min-w-0"><span className="font-medium">Seleccionado: </span>{associationLabel || associationId}</span>
                <button type="button" onClick={() => { setAssociationId(""); setAssociationLabel(""); }} className="shrink-0 text-xs text-green-800 underline">Quitar</button>
              </div>}
              <input value={associationQuery} onChange={(event) => setAssociationQuery(event.target.value)} placeholder={associationType === "project" ? "Buscar proyecto por código, nombre o cliente…" : associationType === "ticket" ? "Buscar ticket por folio, asunto o cliente…" : "Buscar póliza por nombre o cliente…"} className="w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm" />
              {associationQuery.trim().length < 2 ? <p className="text-[11px] text-zinc-500">Escribe al menos 2 caracteres. Se muestran hasta 5 coincidencias.</p> : debouncedAssociationQuery.length >= 2 && <div className="rounded-md border border-zinc-200">
                {associationQuery.trim() !== debouncedAssociationQuery || destinationBusy ? <p className="px-3 py-2 text-xs text-zinc-500">Buscando…</p> : destinationError ? <p className="px-3 py-2 text-xs text-red-700">No se pudo completar la búsqueda: {destinationError}</p> : destinationResults === null ? <p className="px-3 py-2 text-xs text-zinc-500">Buscando…</p> : destinationResults.length === 0 ? <p className="px-3 py-2 text-xs text-zinc-500">No hay coincidencias.</p> : destinationResults.slice(0, 5).map((item) => {
                  const label = [item.code, item.title].filter(Boolean).join(" · ");
                  return <button key={`${item.type}:${item.id}`} type="button" onClick={() => {
                    setAssociationType(item.type); setAssociationId(item.id);
                    setAssociationLabel(`${label}${item.context ? ` — ${item.context}` : ""}`);
                    setAssociationQuery(""); setDebouncedAssociationQuery("");
                  }} className="block w-full border-b border-zinc-100 px-3 py-2 text-left last:border-0 hover:bg-zinc-50">
                    <span className="block text-sm font-medium text-zinc-800">{label}</span>
                    <span className="mt-0.5 block text-[11px] text-zinc-500">{item.context ? `${item.context} · ${item.status}` : item.status}</span>
                  </button>;
                })}
              </div>}
            </div>
            <label className="text-xs font-medium text-zinc-600">Proveedor
              <input value={vendor} onChange={(e) => setVendor(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-zinc-600">Fecha del documento o gasto
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm" />
            </label>
            <div className="grid grid-cols-[1fr_88px] gap-2">
              <label className="text-xs font-medium text-zinc-600">Importe total
                <input type="number" min="0" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-zinc-600">Moneda
                <input maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="mt-1 w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm uppercase" />
              </label>
            </div>
            <label className="text-xs font-medium text-zinc-600">Impuesto
              <input type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-zinc-600 sm:col-span-2">Descripción / conceptos
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-zinc-600 sm:col-span-2">Texto leído de la imagen (editable)
              <textarea rows={5} value={extractedText} onChange={(e) => setExtractedText(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-300 px-2.5 py-2 font-mono text-xs" placeholder="El OCR y Qwen completarán este campo; también puedes corregirlo." />
            </label>
            <label className="text-xs font-medium text-zinc-600 sm:col-span-2">Nota de revisión o motivo de corrección
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm" placeholder="Si la propuesta está mal, explica la señal que se pasó por alto." />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
            <button type="button" disabled={busy} onClick={() => save("confirmed")} className="rounded-md bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">Confirmar y asociar</button>
            <button type="button" disabled={busy} onClick={() => save("corrected")} className="rounded-md bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50">Guardar corrección</button>
              <button type="button" disabled={busy} onClick={() => save("rejected")} className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">Descartar documento</button>
          </div>

          <div className="border-t border-zinc-100 pt-3">
            <h3 className="text-sm font-semibold text-zinc-800">Notas e historial de revisión</h3>
            {detail.data?.comments?.length ? <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
              {detail.data.comments.map((comment) => <div key={comment.id} className="rounded-md bg-zinc-50 px-3 py-2 text-sm">
                <div className="flex justify-between gap-2 text-[11px] text-zinc-500"><span>{comment.author_name || "Usuario"}</span><span>{new Date(comment.created_at).toLocaleString("es-MX")}</span></div>
                <p className="mt-1 whitespace-pre-wrap text-zinc-700">{comment.body}</p>
              </div>)}
            </div> : <p className="mt-1 text-xs text-zinc-500">Sin notas previas.</p>}
            <div className="mt-2 flex gap-2">
              <input value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void comment(); } }} placeholder="Añade una nota o pregunta para discutir esta foto…" className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2.5 py-2 text-sm" />
              <button type="button" disabled={busy || !newComment.trim()} onClick={comment} className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 disabled:opacity-50">Añadir nota</button>
            </div>
            <p className="mt-1 text-[11px] text-zinc-400">La explicación de Qwen y tus correcciones se conservan juntas para comentar cada desacuerdo.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
