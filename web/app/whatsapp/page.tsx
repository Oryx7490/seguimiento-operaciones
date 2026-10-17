"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { formatDate } from "@/app/lib/format";
import { DangerButton, EmptyState, Field, Modal, PrimaryButton, SecondaryButton, Select, Spinner, TextInput } from "@/app/components/ui";

interface LinkItem {
  id: string;
  type: string;
  target_id: string;
  label: string;
  status?: string;
}

interface FaceItem {
  id: string;
  bbox: { x: number; y: number; w: number; h: number };
  det_score: number | null;
  identity_id: string | null;
  source: string | null;
  confidence: number | null;
  display_name: string | null;
  technician_id: string | null;
  user_id: string | null;
  sface_identity_id: string | null;
  sface_similarity: number | null;
  sface_accepted: boolean | null;
  sface_display_name: string | null;
}

interface FaceTrainingExample {
  face_id: string;
  identity_id: string;
  display_name: string;
  sha256: string;
  bbox: { x: number; y: number; w: number; h: number };
  det_score: number | null;
  face_created_at: string;
  media_state: string;
  sface_included: boolean;
  used_by_centroids: boolean;
  used_by_classifier: boolean;
  recognition: { buffalo: FaceRecognitionResult; sface: FaceRecognitionResult };
}

interface FaceRecognitionResult {
  status: "correct" | "incorrect" | "abstained" | "unavailable";
  predicted_name: string | null;
  similarity: number | null;
  margin: number | null;
  reason: string | null;
}

interface FaceValidationSummary {
  threshold: number;
  margin_threshold: number;
  tested: number;
  accepted: number;
  correct: number;
  incorrect: number;
  abstained: number;
  unavailable: number;
}

interface FaceToolCheck {
  ok: boolean;
  enabled?: boolean;
  loaded?: boolean;
  version?: string;
  model?: string;
  embedding_dim?: number;
  sface_api?: boolean;
  available_providers?: string[];
  active_provider?: string;
  model_file?: string;
  sha256?: string | null;
  expected_sha256?: string;
}

interface FaceToolDiagnostics {
  status: "ok" | "error";
  errors: string[];
  warnings: string[];
  tools: Record<string, FaceToolCheck>;
}

interface FaceTrainingAuditData {
  model: {
    id: string;
    version: number;
    created_at: string;
    active: boolean;
    metrics: { identities?: number; faces?: number; assignments?: number };
    example_count: number;
  } | null;
  classifier: { version: number; metrics: { samples?: number; classes?: number; training_accuracy?: number }; created_at: string; example_count: number } | null;
  examples: FaceTrainingExample[];
  examples_truncated: boolean;
  recognition_quality: { buffalo: FaceValidationSummary; sface: FaceValidationSummary } | null;
  tool_health: {
    ready: boolean;
    sface_ready: boolean;
    diagnostics?: FaceToolDiagnostics;
  } | null;
  tool_error: string | null;
  photo_errors: { analysis_type: string; model: string; sha256: string; error_message: string | null; created_at: string }[];
  totals: { faces: number; confirmed_examples: number; confirmed_identities: number; sface_embeddings: number };
}

interface OcrParsed {
  date: string | null;
  time: string | null;
  type: string | null;
  shift_in: string | null;
  shift_out: string | null;
  worked_hours: number | null;
  location: string | null;
  code: string | null;
  app: string | null;
}

interface OcrData {
  state: string;
  text: string;
  lines: string[];
  mean_conf: number | null;
  parsed: OcrParsed | null;
}

interface MediaItem {
  media_id: string;
  sha256: string | null;
  file_name: string | null;
  media_kind: string;
  state: "stored" | "unavailable" | string;
  missing_reason: string | null;
  content_type: string | null;
  size_bytes: number | null;
  message_id: string;
  sender_id: string | null;
  sender_display_name: string | null;
  direction: string;
  caption: string | null;
  at: string;
  conversation_id: string;
  conversation_name: string | null;
  is_group: boolean;
  tags: string[];
  links: LinkItem[];
  note: string | null;
  is_favorite: boolean;
  is_archived: boolean;
  duplicate_count: number;
}

interface Filters {
  senders: { id: string; name: string | null; count: number }[];
  tags: { tag: string; key: string; count: number }[];
  conversations: { id: string; name: string | null; count: number }[];
  stats: { total: number; stored: number; unavailable: number; earliest: string | null; latest: string | null };
}

const KIND_OPTIONS = [
  { value: "image", label: "Fotografías" },
  { value: "video", label: "Videos" },
  { value: "document", label: "Documentos" },
  { value: "audio", label: "Audios" },
  { value: "sticker", label: "Stickers" },
  { value: "other", label: "Otros" },
];

const LIMIT = 48;

const CDMX = "America/Mexico_City";

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CDMX, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: CDMX, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso)
  );
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: CDMX, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function dateTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: CDMX,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function mondayOf(dayStr: string): Date {
  const d = new Date(`${dayStr}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

function isoWeekInfo(dayStr: string): { key: string; label: string; range: string } {
  const d = new Date(`${dayStr}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3); // jueves de la semana ISO
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const ftDow = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDow + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));

  const mon = mondayOf(dayStr);
  const sun = new Date(mon);
  sun.setUTCDate(sun.getUTCDate() + 6);
  const fmt = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "short" });
  return {
    key: `${isoYear}-W${String(week).padStart(2, "0")}`,
    label: `Semana ${week} · ${isoYear}`,
    range: `${fmt.format(mon)} – ${fmt.format(sun)}`,
  };
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
    </svg>
  );
}

export default function WhatsappPhotosPage() {
  const filters = useResource<Filters>("/api/whatsapp/filters");
  const session = useResource<{ user: { id: string; name: string; role: string } | null }>("/api/session");

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sender, setSender] = useState("");
  const [tag, setTag] = useState("");
  const [kind, setKind] = useState("image");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [showBackupManager, setShowBackupManager] = useState(false);
  const [showFaceTrainingAudit, setShowFaceTrainingAudit] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (sender) p.set("sender", sender);
    if (tag) p.set("tag", tag);
    if (kind) p.set("kind", kind);
    if (duplicatesOnly) p.set("duplicates", "true");
    if (favoriteOnly) p.set("favorite", "true");
    if (showArchived) p.set("archived", "all");
    if (debouncedQ.trim()) p.set("q", debouncedQ.trim());
    return p.toString();
  }, [from, to, sender, tag, kind, duplicatesOnly, favoriteOnly, showArchived, debouncedQ]);

  const fetchPage = useCallback(
    async (offset: number) => {
      const p = new URLSearchParams(query);
      p.set("limit", String(LIMIT));
      p.set("offset", String(offset));
      return fetchJson<{ items: MediaItem[]; total: number }>(`/api/whatsapp/media?${p.toString()}`);
    },
    [query]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPage(0)
      .then((r) => {
        if (cancelled) return;
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const r = await fetchPage(items.length);
      setItems((prev) => [...prev, ...r.items]);
      setTotal(r.total);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingMore(false);
    }
  }

  function patchMedia(sha256: string, patch: Partial<MediaItem>) {
    setItems((prev) => {
      let next = prev.map((it) => (it.sha256 === sha256 ? { ...it, ...patch } : it));
      // Al archivar sin ver archivadas, la foto sale de la lista.
      if (patch.is_archived === true && !showArchived) next = next.filter((it) => it.sha256 !== sha256);
      return next;
    });
    setSelected((prev) => (prev && prev.sha256 === sha256 ? { ...prev, ...patch } : prev));
  }

  async function toggleFavorite(it: MediaItem) {
    if (!it.sha256) return;
    const value = !it.is_favorite;
    patchMedia(it.sha256, { is_favorite: value });
    try {
      await fetchJson(`/api/whatsapp/media/${it.sha256}`, { method: "PATCH", body: JSON.stringify({ is_favorite: value }) });
    } catch (e) {
      patchMedia(it.sha256, { is_favorite: !value });
      setError(String(e));
    }
  }

  const senderOptions = (filters.data?.senders ?? []).map((s) => ({
    value: s.id,
    label: `${s.name || s.id} (${s.count})`,
  }));
  const tagOptions = (filters.data?.tags ?? []).map((t) => ({ value: t.tag, label: `${t.tag} (${t.count})` }));

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; range: string; items: MediaItem[] }>();
    for (const it of items) {
      const info = isoWeekInfo(dayKey(it.at));
      if (!map.has(info.key)) map.set(info.key, { label: info.label, range: info.range, items: [] });
      map.get(info.key)!.items.push(it);
    }
    return [...map.entries()].map(([key, v]) => ({ key, ...v }));
  }, [items]);

  const stats = filters.data?.stats;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Fotos de WhatsApp</h1>
          <p className="mt-1 text-sm text-zinc-500">Galería de archivos recibidos en el grupo, con etiquetas, vínculos y búsqueda.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {(session.data?.user?.role === "admin" || session.data?.user?.role === "coordinator") && (
            <>
              <SecondaryButton onClick={() => setShowFaceTrainingAudit(true)}>Entrenamiento facial</SecondaryButton>
              <SecondaryButton onClick={() => setShowBackupManager(true)}>Respaldos del grupo</SecondaryButton>
            </>
          )}
          {stats && (
            <div className="text-sm text-zinc-600">
              <span className="font-semibold">{stats.total}</span> archivos
              {stats.unavailable > 0 && <span className="text-amber-700"> · {stats.unavailable} sin archivo</span>}
              {stats.earliest && stats.latest && (
                <span className="text-zinc-400"> · {dayKey(stats.earliest)} a {dayKey(stats.latest)}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Desde">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Hasta">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Remitente">
          <Select value={sender} onChange={setSender} placeholder="Todos" options={senderOptions} className="min-w-52" />
        </Field>
        <Field label="Etiqueta">
          <Select value={tag} onChange={setTag} placeholder="Todas" options={tagOptions} className="min-w-40" />
        </Field>
        <Field label="Tipo">
          <Select value={kind} onChange={(value) => { setKind(value); if (value !== "image") setDuplicatesOnly(false); }} options={KIND_OPTIONS} className="min-w-36" />
        </Field>
        {kind === "image" && (
          <label className="flex items-center gap-1.5 pb-1.5 text-sm text-zinc-600">
            <input type="checkbox" checked={duplicatesOnly} onChange={(e) => setDuplicatesOnly(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
            Solo fotos repetidas
          </label>
        )}
        <Field label="Buscar">
          <TextInput value={q} onChange={setQ} placeholder="Texto, archivo o remitente…" className="w-64" />
        </Field>
        <label className="flex items-center gap-1.5 pb-1.5 text-sm text-zinc-600">
          <input type="checkbox" checked={favoriteOnly} onChange={(e) => setFavoriteOnly(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
          Solo favoritos
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-sm text-zinc-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
          Mostrar archivadas
        </label>
        <SecondaryButton
          onClick={() => {
            setFrom("");
            setTo("");
            setSender("");
            setTag("");
            setKind("image");
            setDuplicatesOnly(false);
            setFavoriteOnly(false);
            setShowArchived(false);
            setQ("");
          }}
        >
          Limpiar
        </SecondaryButton>
      </div>

      <div className="mt-4">
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title="No hay archivos que coincidan">
            <p className="text-sm text-zinc-400">Ajusta los filtros o el rango de fechas.</p>
          </EmptyState>
        ) : (
          <>
            {groups.map((g) => (
              <section key={g.key} className="mb-6">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {g.label} <span className="font-normal normal-case text-zinc-400">· {g.range}</span>
                  <span className="ml-2 font-normal normal-case text-zinc-300">{g.items.length} archivo{g.items.length === 1 ? "" : "s"}</span>
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {g.items.map((it) => (
                    <div
                      key={it.media_id}
                      className="group relative overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300 hover:shadow"
                    >
                      <button
                        type="button"
                        onClick={() => { if (it.sha256) setSelected(it); }}
                        disabled={!it.sha256}
                        aria-label={it.sha256 ? `Abrir ${it.file_name || "archivo"}` : `${it.missing_reason?.includes("<album message>") ? "Álbum sin fotos incluidas" : "Foto no incluida"}, ${it.sender_display_name || it.sender_id || "remitente desconocido"}, ${dateTimeLabel(it.at)}`}
                        className="block w-full text-left disabled:cursor-default"
                      >
                        <div className="relative aspect-square w-full overflow-hidden bg-zinc-100">
                          {it.state === "unavailable" ? (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-amber-50 px-3 text-center text-amber-800">
                              <svg className="h-8 w-8 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                                <rect x="3" y="4" width="18" height="16" rx="2" />
                                <circle cx="8.5" cy="9" r="1.5" />
                                <path d="m21 15-5-5L5 20" />
                              </svg>
                              <span className="text-xs font-semibold">
                                {it.missing_reason?.includes("<album message>")
                                  ? "Álbum sin fotos incluidas"
                                  : it.media_kind === "image" ? "Foto no incluida" : `${it.media_kind} no incluido`}
                              </span>
                            </div>
                          ) : it.media_kind === "image" && it.sha256 ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/whatsapp/media/${it.sha256}/thumb`}
                              alt={it.caption || it.file_name || "archivo"}
                              loading="lazy"
                              className="h-full w-full object-cover transition group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-medium uppercase text-zinc-400">
                              {it.media_kind}
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="truncate text-xs font-medium text-zinc-700">{it.sender_display_name || it.sender_id || "—"}</p>
                          <p className="truncate text-[11px] text-zinc-400">
                            {dateTimeLabel(it.at)}
                            {it.state === "unavailable" ? " · falta el archivo multimedia" : it.note ? ` · ${it.note}` : it.caption ? ` · ${it.caption}` : ""}
                          </p>
                        </div>
                      </button>

                      {it.sha256 && (
                        <button
                          type="button"
                          onClick={() => void toggleFavorite(it)}
                          title={it.is_favorite ? "Quitar de favoritos" : "Marcar favorito"}
                          aria-label={it.is_favorite ? "Quitar de favoritos" : "Marcar favorito"}
                          className={`absolute left-1 top-1 rounded-full bg-white/85 p-1 shadow-sm backdrop-blur transition ${
                            it.is_favorite ? "text-amber-500" : "text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-amber-500"
                          }`}
                        >
                          <StarIcon filled={it.is_favorite} />
                        </button>
                      )}

                      {it.sha256 && it.tags.length > 0 && (
                        <span className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {it.tags.length}
                        </span>
                      )}
                      {it.sha256 && it.is_archived && (
                        <span className="absolute bottom-9 left-1 rounded bg-zinc-700/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          Archivada
                        </span>
                      )}
                      {it.media_kind === "image" && it.duplicate_count > 1 && (
                        <span
                          title={`Mismo archivo (SHA-256 idéntico): aparece en ${it.duplicate_count} mensajes`}
                          className="absolute bottom-9 right-1 rounded bg-amber-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white"
                        >
                          Repetida ×{it.duplicate_count}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {items.length < total && (
              <div className="flex justify-center py-4">
                <SecondaryButton onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Cargando…" : `Cargar más (${items.length} de ${total})`}
                </SecondaryButton>
              </div>
            )}
          </>
        )}
      </div>

      {selected?.sha256 && (
        <PhotoDetail
          item={{ ...selected, sha256: selected.sha256 }}
          onClose={() => setSelected(null)}
          onChanged={(patch) => { if (selected.sha256) patchMedia(selected.sha256, patch); }}
        />
      )}
      {showBackupManager && <WhatsappBackupsManager onClose={() => setShowBackupManager(false)} />}
      {showFaceTrainingAudit && <FaceTrainingAudit onClose={() => setShowFaceTrainingAudit(false)} />}
    </div>
  );
}

function FaceTrainingAudit({ onClose }: { onClose: () => void }) {
  const audit = useResource<FaceTrainingAuditData>("/api/whatsapp/face-training");
  const diagnostics = audit.data?.tool_health?.diagnostics;
  const toolLabels: Record<string, string> = {
    insightface: "InsightFace / buffalo_l",
    opencv: "OpenCV",
    onnxruntime: "ONNX Runtime",
    sface: "SFace",
  };
  const toolDetails: Record<string, string> = {
    insightface: `${diagnostics?.tools.insightface?.version ?? "—"} · ${diagnostics?.tools.insightface?.model ?? "buffalo_l"} · 512 dimensiones`,
    opencv: `${diagnostics?.tools.opencv?.version ?? "—"} · API FaceRecognizerSF ${diagnostics?.tools.opencv?.sface_api ? "disponible" : "no disponible"}`,
    onnxruntime: `${diagnostics?.tools.onnxruntime?.version ?? "—"} · activo: ${diagnostics?.tools.onnxruntime?.active_provider ?? "—"} · disponibles: ${diagnostics?.tools.onnxruntime?.available_providers?.join(", ") ?? "—"}`,
    sface: diagnostics?.tools.sface?.enabled
      ? `${diagnostics.tools.sface.model_file ?? "modelo"} · ${diagnostics.tools.sface.loaded ? "cargado y validado" : "no cargado"} · SHA-256 ${diagnostics.tools.sface.sha256 === diagnostics.tools.sface.expected_sha256 ? "correcto" : "no coincide"}`
      : "Desactivado en configuración",
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Auditoría del entrenamiento facial"
      wide
      footer={<SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-zinc-600">
          Revisa la versión del modelo, las fotos confirmadas que entraron en sus centroides y el estado de las herramientas.
          Revisa las fotos exactas del entrenamiento, la carga de las herramientas y la calidad de reconocimiento mediante validación cruzada que excluye la foto evaluada.
        </p>
        <SecondaryButton onClick={audit.reload}>Actualizar</SecondaryButton>
      </div>

      {audit.error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">No se pudo cargar la auditoría: {audit.error}</div>}
      {!audit.data && !audit.error && <div className="py-8"><Spinner /></div>}

      {audit.data && (
        <div className="mt-4 space-y-5">
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-zinc-200 p-3">
              <h3 className="text-sm font-semibold text-zinc-800">Modelo activo · centroides buffalo_l</h3>
              {audit.data.model ? (
                <p className="mt-1 text-sm text-zinc-600">
                  Versión {audit.data.model.version} · {audit.data.model.example_count} fotos confirmadas · {audit.data.model.metrics.identities ?? 0} identidades · actualizado {dateTimeLabel(audit.data.model.created_at)}
                </p>
              ) : <p className="mt-1 text-sm text-zinc-500">Aún no hay una versión de centroides registrada.</p>}
              <p className="mt-1 text-xs text-zinc-500">El modelo usa embeddings de 512 dimensiones. El proceso diario actualiza centroides y no reentrena ArcFace.</p>
            </div>
            <div className="rounded-md border border-zinc-200 p-3">
              <h3 className="text-sm font-semibold text-zinc-800">Clasificador</h3>
              {audit.data.classifier ? (
                <p className="mt-1 text-sm text-zinc-600">
                  Versión {audit.data.classifier.version} · {audit.data.classifier.example_count} fotos de entrenamiento · {audit.data.classifier.metrics.classes ?? 0} identidades · acierto en entrenamiento {Math.round((audit.data.classifier.metrics.training_accuracy ?? 0) * 100)}% · actualizado {dateTimeLabel(audit.data.classifier.created_at)}
                </p>
              ) : (
                <p className="mt-1 text-sm text-zinc-500">Todavía no está activo; requiere al menos 2 identidades y 4 fotos confirmadas.</p>
              )}
            </div>
          </section>

          <section>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-800">Estado de herramientas</h3>
              {audit.data.tool_error ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">No se pudo consultar face-service</span>
              ) : diagnostics?.status === "ok" ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Sin fallos de instalación o carga detectados</span>
              ) : diagnostics ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Revisión necesaria</span>
              ) : (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">Sin diagnóstico disponible</span>
              )}
            </div>
            {audit.data.tool_error && <p className="mt-1 text-xs text-red-700">{audit.data.tool_error}</p>}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {Object.entries(toolLabels).map(([key, label]) => {
                const check = diagnostics?.tools[key];
                const disabled = key === "sface" && check?.enabled === false;
                return (
                  <div key={key} className="rounded-md border border-zinc-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-800">{label}</span>
                      <span className={`text-[11px] font-medium ${disabled ? "text-zinc-500" : check?.ok ? "text-emerald-700" : "text-red-700"}`}>
                        {disabled ? "desactivado" : check?.ok ? "correcto" : "revisar"}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-[11px] text-zinc-500">{toolDetails[key] ?? "No se recibió información."}</p>
                  </div>
                );
              })}
            </div>
            {diagnostics?.errors && diagnostics.errors.length > 0 && (
              <p className="mt-2 text-xs text-red-700">Errores: {diagnostics.errors.map((key) => toolLabels[key] ?? key).join(", ")}</p>
            )}
            {diagnostics?.warnings.map((warning) => <p key={warning} className="mt-2 text-xs text-amber-700">Aviso: {warning}</p>)}
          </section>

          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-800">Calidad de reconocimiento en fotos confirmadas</h3>
              <span className="text-xs text-zinc-500">Validación leave-one-out: cada foto se compara sin incluirse en su propio centroide.</span>
            </div>
            {audit.data.recognition_quality ? (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {([
                  ["buffalo", "OpenCV / buffalo_l · centroides"],
                  ["sface", "OpenCV SFace · centroides"],
                ] as const).map(([key, label]) => {
                  const quality = audit.data!.recognition_quality![key];
                  return (
                    <div key={key} className="rounded-md border border-zinc-200 p-3">
                      <h4 className="text-xs font-semibold text-zinc-800">{label}</h4>
                      <p className="mt-1 text-xs text-zinc-600">
                        {quality.correct} aciertos de {quality.accepted} reconocimientos aceptados · {quality.incorrect} confusiones aceptadas · {quality.abstained} abstenciones · {quality.unavailable} no evaluables.
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {quality.tested} fotos comparables · umbral de similitud {Math.round((1 - quality.threshold) * 100)}% · separación mínima {Math.round(quality.margin_threshold * 100)} puntos.
                        {key === "sface" && ` ${audit.data!.totals.sface_embeddings} rostros tienen embedding SFace.`}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : <p className="mt-2 text-xs text-zinc-500">No hay datos suficientes para calcular la validación cruzada.</p>}
            <p className="mt-2 text-[11px] text-amber-700">La exactitud del clasificador usa las mismas fotos con las que se entrenó. La validación cruzada mide consistencia entre fotos confirmadas; con pocas fotos por persona, ninguna sustituye una evaluación independiente con imágenes nuevas.</p>
          </section>

          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-800">Fotos usadas en la última versión</h3>
              <span className="text-xs text-zinc-500">Se indica si cada rostro entró en centroides, clasificador o ambos.</span>
            </div>
            {audit.data.examples.length === 0 ? (
              <p className="mt-2 rounded-md bg-zinc-50 px-3 py-4 text-sm text-zinc-500">No hay fotos guardadas para estas versiones. Las asignaciones manuales se incorporan en el próximo entrenamiento diario.</p>
            ) : (
              <div className="mt-3 grid max-h-[28rem] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                {audit.data.examples.map((example) => (
                  <article key={example.face_id} className="overflow-hidden rounded-md border border-zinc-200 bg-white">
                    <div className="flex h-36 items-center justify-center bg-zinc-100">
                      {example.media_state === "stored" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/whatsapp/media/${example.sha256}/thumb`} alt={`Ejemplo de ${example.display_name}`} loading="lazy" className="h-full w-full object-contain" />
                      ) : <span className="px-2 text-center text-xs text-zinc-500">Archivo no disponible</span>}
                    </div>
                    <div className="p-2">
                      <p className="truncate text-xs font-semibold text-zinc-800" title={example.display_name}>{example.display_name}</p>
                      <p className="mt-0.5 text-[10px] text-zinc-500">Confirmada · {dateTimeLabel(example.face_created_at)}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {example.used_by_centroids && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] text-blue-700">Centroides</span>}
                        {example.used_by_classifier && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] text-indigo-700">Clasificador</span>}
                      </div>
                      <p className={`mt-0.5 text-[10px] ${example.sface_included ? "text-violet-700" : "text-zinc-400"}`}>
                        {example.sface_included ? "Incluida en la prueba SFace" : "SFace aún no procesó esta foto"}
                      </p>
                      <FaceValidationLabel result={example.recognition.buffalo} model="buffalo_l" />
                      {example.sface_included && <FaceValidationLabel result={example.recognition.sface} model="SFace" />}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {audit.data.examples_truncated && <p className="mt-2 text-xs text-zinc-500">Se muestran las 160 fotos más recientes; los conteos y la validación incluyen todas las fotos del modelo.</p>}
          </section>

          <section className="rounded-md border border-zinc-200 p-3">
            <h3 className="text-sm font-semibold text-zinc-800">Errores de análisis de fotos</h3>
            {audit.data.photo_errors.length === 0 ? (
              <p className="mt-1 text-xs text-zinc-500">No hay errores de procesamiento facial registrados.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {audit.data.photo_errors.map((failure) => (
                  <li key={`${failure.sha256}-${failure.analysis_type}`} className="break-words text-xs text-red-700">
                    {failure.model} · {failure.sha256.slice(0, 12)} · {failure.error_message || "Error sin detalle"} · {dateTimeLabel(failure.created_at)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

function FaceValidationLabel({ result, model }: { result: FaceRecognitionResult; model: string }) {
  const color = result.status === "correct" ? "text-emerald-700" : result.status === "incorrect" ? "text-red-700" : result.status === "abstained" ? "text-amber-700" : "text-zinc-400";
  const text = result.status === "correct"
    ? `Validación ${model}: coincide (${Math.round((result.similarity ?? 0) * 100)}%)`
    : result.status === "incorrect"
      ? `Posible confusión ${model}: ${result.predicted_name} (${Math.round((result.similarity ?? 0) * 100)}%)`
      : result.status === "abstained"
        ? `Sin decisión ${model}: candidato ${result.predicted_name} (${Math.round((result.similarity ?? 0) * 100)}%)`
        : `No evaluable ${model}: ${result.reason ?? "faltan fotos comparables"}`;
  return <p className={`mt-1 text-[10px] ${color}`}>{text}</p>;
}

interface BackupArchive {
  archive_sha256: string;
  source_filename: string;
  size_bytes: number;
  state: "stored" | "deleted";
  deletion_eligible: boolean;
  retention_until: string;
  upload_count: number;
  group_names: string[];
  uploader_names: string[];
  latest_upload_status: string | null;
  latest_error: string | null;
  latest_uploaded_at: string | null;
  latest_group_name: string | null;
  latest_uploader_name: string | null;
}

interface BackupList {
  archives: BackupArchive[];
  storage: { count: number; size_bytes: number };
  retention_days: number;
  max_archive_bytes: number;
}

interface WhatsappConversation {
  id: string;
  display_name: string | null;
  is_group: boolean;
  message_count: number;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let n = value / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(1)} ${units[i]}`;
}

function backupStatusLabel(status: string | null): string {
  if (status === "imported") return "Importado";
  if (status === "partial") return "Importación parcial";
  if (status === "already_imported") return "Ya importado; duplicado evitado";
  if (status === "importing") return "Procesando…";
  if (status === "failed") return "Error al importar";
  return "Pendiente";
}

function WhatsappBackupsManager({ onClose }: { onClose: () => void }) {
  const backups = useResource<BackupList>("/api/whatsapp/backups");
  const conversations = useResource<{ conversations: WhatsappConversation[] }>("/api/whatsapp/conversations");
  const [conversationId, setConversationId] = useState("");
  const [dateFormat, setDateFormat] = useState("auto");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputVersion, setFileInputVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const groups = useMemo(() => (conversations.data?.conversations ?? []).filter((c) => c.is_group), [conversations.data]);
  const groupOptions = useMemo(
    () => groups.map((group) => ({ value: group.id, label: `${group.display_name || "Grupo sin nombre"} · ${group.message_count} mensajes` })),
    [groups]
  );

  useEffect(() => {
    if (!conversationId && groups.length > 0) setConversationId(groups[0].id);
  }, [conversationId, groups]);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !conversationId || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("conversation_id", conversationId);
      form.append("date_format", dateFormat);
      form.append("timezone", "America/Mexico_City");
      const response = await fetch("/api/whatsapp/backups", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo subir el respaldo");
      setNotice(result.message || "Respaldo guardado.");
      setFile(null);
      setFileInputVersion((value) => value + 1);
      backups.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeArchive(archive: BackupArchive) {
    if (busy || archive.state !== "stored") return;
    const ok = window.confirm(
      `¿Eliminar ${archive.source_filename} de MinIO? Los mensajes y multimedia ya importados permanecerán en la base de datos.`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/whatsapp/backups/${archive.archive_sha256}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo eliminar el ZIP");
      setNotice(`ZIP eliminado. Se liberaron ${formatBytes(result.freed_bytes || 0)}; los mensajes y multimedia importados siguen disponibles.`);
      backups.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Respaldos de conversaciones de WhatsApp"
      wide
      footer={<SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>}
    >
      <p className="text-sm text-zinc-600">
        Sube la exportación ZIP del grupo. El sistema la guarda en MinIO e importa mensajes y archivos; el mismo ZIP se almacena una sola vez aunque lo suban varios colaboradores.
      </p>
      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Los ZIP son temporales y se pueden borrar antes si falta espacio. La retención sugerida es de {backups.data?.retention_days ?? 7} días desde la carga más reciente; borrar el ZIP no elimina mensajes ni archivos multimedia ya importados.
      </div>

      <form onSubmit={(event) => void upload(event)} className="mt-4 grid gap-3 rounded-md border border-zinc-200 p-3 sm:grid-cols-2">
        <Field label="Grupo de WhatsApp">
          <Select value={conversationId} onChange={setConversationId} placeholder="Selecciona un grupo" options={groupOptions} />
        </Field>
        <Field label="Formato de fecha del respaldo">
          <Select
            value={dateFormat}
            onChange={setDateFormat}
            options={[
              { value: "auto", label: "Detectar automáticamente (recomendado)" },
              { value: "dmy", label: "Día / mes / año" },
              { value: "mdy", label: "Mes / día / año" },
            ]}
          />
        </Field>
        <Field label="Archivo ZIP" hint={`Máximo ${formatBytes(backups.data?.max_archive_bytes ?? 1024 * 1024 * 1024)}. Incluye el chat exportado y, si se necesitan, sus archivos multimedia.`}>
          <input
            key={fileInputVersion}
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
        </Field>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy || !file || !conversationId}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-700 disabled:opacity-50"
          >
            {busy ? "Subiendo y procesando…" : "Subir y procesar respaldo"}
          </button>
        </div>
      </form>

      {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}
      {conversations.error && <div className="mt-3 text-sm text-red-700">No se pudieron cargar los grupos: {conversations.error}</div>}
      {groups.length === 0 && !conversations.error && <p className="mt-3 text-sm text-zinc-500">No hay grupos registrados todavía. Primero debe llegar un mensaje o crearse el grupo desde WhatsApp Capture.</p>}

      <div className="mt-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-800">ZIP guardados</h3>
          {backups.data && (
            <p className="mt-0.5 text-xs text-zinc-500">
              {backups.data.storage.count} archivos · {formatBytes(Number(backups.data.storage.size_bytes))} en MinIO
            </p>
          )}
        </div>
        <SecondaryButton onClick={backups.reload} disabled={busy}>Actualizar</SecondaryButton>
      </div>
      {backups.error && <div className="mt-2 text-sm text-red-700">No se pudieron cargar los respaldos: {backups.error}</div>}
      {!backups.data ? <div className="py-4"><Spinner /></div> : backups.data.archives.length === 0 ? (
        <p className="mt-3 rounded-md bg-zinc-50 px-3 py-4 text-sm text-zinc-500">Todavía no hay respaldos cargados.</p>
      ) : (
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {backups.data.archives.map((archive) => (
            <div key={archive.archive_sha256} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-200 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-800" title={archive.source_filename}>{archive.source_filename}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {formatBytes(Number(archive.size_bytes))} · {archive.upload_count} carga{archive.upload_count === 1 ? "" : "s"}
                  {archive.group_names?.length ? ` · ${archive.group_names.join(", ")}` : ""}
                  {archive.uploader_names?.length ? ` · colaborador${archive.uploader_names.length === 1 ? "" : "es"}: ${archive.uploader_names.join(", ")}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {archive.state === "stored" ? `Retención sugerida hasta ${dateTimeLabel(archive.retention_until)} · ` : "ZIP eliminado · "}
                  {backupStatusLabel(archive.latest_upload_status)}
                  {archive.latest_uploaded_at ? ` · ${dateTimeLabel(archive.latest_uploaded_at)}` : ""}
                </p>
                {archive.latest_error && <p className="mt-1 break-words text-xs text-red-700">{archive.latest_error}</p>}
              </div>
              {archive.state === "stored" && (
                <DangerButton
                  disabled={busy || archive.latest_upload_status === "importing"}
                  onClick={() => void removeArchive(archive)}
                >
                  Borrar ZIP
                </DangerButton>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function PhotoDetail({
  item,
  onClose,
  onChanged,
}: {
  item: MediaItem;
  onClose: () => void;
  onChanged: (patch: Partial<MediaItem>) => void;
}) {
  const [tags, setTags] = useState<string[]>(item.tags);
  const [links, setLinks] = useState<LinkItem[]>(item.links);
  const [note, setNote] = useState(item.note ?? "");
  const [savedNote, setSavedNote] = useState(item.note ?? "");
  const [favorite, setFavorite] = useState(item.is_favorite);
  const [archived, setArchived] = useState(item.is_archived);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [linkType, setLinkType] = useState("project");
  const [linkTarget, setLinkTarget] = useState("");

  const projects = useResource<{ projects: { id: string; code: string; name: string }[] }>("/api/projects");
  const tickets = useResource<{ tickets: { id: string; code: string; title: string }[] }>("/api/tickets");
  const technicians = useResource<{ technicians: { id: string; display_name: string; technician_active?: boolean }[] }>("/api/technicians");

  const facesRes = useResource<{ faces: FaceItem[]; width: number | null; height: number | null }>(
    `/api/whatsapp/media/${item.sha256}/faces`
  );
  const ocrRes = useResource<{ ocr: OcrData | null }>(`/api/whatsapp/media/${item.sha256}/ocr`);
  const usersRes = useResource<{ users: { id: string; name: string }[] }>("/api/users");
  const [hoverFace, setHoverFace] = useState<string | null>(null);

  const faceOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (const t of technicians.data?.technicians ?? []) opts.push({ value: `t:${t.id}`, label: `Técnico · ${t.display_name}` });
    for (const u of usersRes.data?.users ?? []) opts.push({ value: `u:${u.id}`, label: `Usuario · ${u.name}` });
    return opts;
  }, [technicians.data, usersRes.data]);

  function faceValue(f: FaceItem): string {
    if (f.technician_id) return `t:${f.technician_id}`;
    if (f.user_id) return `u:${f.user_id}`;
    return "";
  }

  async function assignFace(faceId: string, value: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      if (!value) {
        await fetchJson(`/api/whatsapp/faces/${faceId}/assign`, { method: "DELETE" });
      } else {
        const [kind, vid] = value.split(":");
        await fetchJson(`/api/whatsapp/faces/${faceId}/assign`, {
          method: "POST",
          body: JSON.stringify(kind === "t" ? { technician_id: vid } : { user_id: vid }),
        });
      }
      facesRes.reload();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const targetOptions = useMemo(() => {
    if (linkType === "project") return (projects.data?.projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }));
    if (linkType === "ticket") return (tickets.data?.tickets ?? []).map((t) => ({ value: t.id, label: `${t.code} · ${t.title}` }));
    if (linkType === "technician") return (technicians.data?.technicians ?? []).map((t) => ({ value: t.id, label: t.display_name }));
    return [];
  }, [linkType, projects.data, tickets.data, technicians.data]);

  async function addTag() {
    const value = draft.trim();
    if (!value || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetchJson<{ tags: string[] }>(`/api/whatsapp/media/${item.sha256}/tags`, {
        method: "POST",
        body: JSON.stringify({ tag: value }),
      });
      setTags(r.tags);
      onChanged({ tags: r.tags });
      setDraft("");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeTag(value: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetchJson<{ tags: string[] }>(`/api/whatsapp/media/${item.sha256}/tags?tag=${encodeURIComponent(value)}`, {
        method: "DELETE",
      });
      setTags(r.tags);
      onChanged({ tags: r.tags });
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetchJson<{ media: { note: string | null } }>(`/api/whatsapp/media/${item.sha256}`, {
        method: "PATCH",
        body: JSON.stringify({ note: note.trim() || null }),
      });
      setSavedNote(r.media.note ?? "");
      setNote(r.media.note ?? "");
      onChanged({ note: r.media.note });
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite() {
    const value = !favorite;
    setFavorite(value);
    onChanged({ is_favorite: value });
    try {
      await fetchJson(`/api/whatsapp/media/${item.sha256}`, { method: "PATCH", body: JSON.stringify({ is_favorite: value }) });
    } catch (e) {
      setFavorite(!value);
      onChanged({ is_favorite: !value });
      setErr(String(e));
    }
  }

  async function toggleArchived() {
    const value = !archived;
    setArchived(value);
    onChanged({ is_archived: value });
    try {
      await fetchJson(`/api/whatsapp/media/${item.sha256}`, { method: "PATCH", body: JSON.stringify({ is_archived: value }) });
    } catch (e) {
      setArchived(!value);
      onChanged({ is_archived: !value });
      setErr(String(e));
    }
  }

  async function addLink() {
    if (!linkTarget || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetchJson<{ links: LinkItem[] }>(`/api/whatsapp/media/${item.sha256}/links`, {
        method: "POST",
        body: JSON.stringify({ type: linkType, id: linkTarget }),
      });
      setLinks(r.links);
      onChanged({ links: r.links });
      setLinkTarget("");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeLink(id: string) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetchJson<{ links: LinkItem[] }>(`/api/whatsapp/media/${item.sha256}/links?id=${id}`, { method: "DELETE" });
      setLinks(r.links);
      onChanged({ links: r.links });
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const noteDirty = note.trim() !== savedNote;

  const ocr = ocrRes.data?.ocr ?? null;
  const op = ocr?.parsed ?? null;
  const isAttendance = Boolean(op?.app) || Boolean(op?.date && (op?.time || op?.shift_in));

  return (
    <Modal open={true} onClose={onClose} title={item.file_name || "Archivo"} wide>
      <div className="space-y-4">
        <div className="flex justify-center rounded-md bg-zinc-900 p-1">
          {item.media_kind === "image" ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/whatsapp/media/${item.sha256}`}
                alt={item.caption || item.file_name || "archivo"}
                className="block max-h-[45vh] w-auto"
              />
              {facesRes.data?.width && facesRes.data?.height
                ? facesRes.data.faces.map((f) => (
                    <div
                      key={f.id}
                      onMouseEnter={() => setHoverFace(f.id)}
                      onMouseLeave={() => setHoverFace(null)}
                      className={`absolute border-2 ${
                        hoverFace === f.id ? "border-amber-400 bg-amber-400/20" : "border-sky-400/80 bg-sky-400/10"
                      }`}
                      style={{
                        left: `${(f.bbox.x / facesRes.data!.width!) * 100}%`,
                        top: `${(f.bbox.y / facesRes.data!.height!) * 100}%`,
                        width: `${(f.bbox.w / facesRes.data!.width!) * 100}%`,
                        height: `${(f.bbox.h / facesRes.data!.height!) * 100}%`,
                      }}
                    >
                      {f.display_name && (
                        <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-zinc-900/85 px-1 text-[10px] text-white">
                          {f.display_name}
                        </span>
                      )}
                    </div>
                  ))
                : null}
            </div>
          ) : (
            <p className="p-8 text-sm text-zinc-300">Tipo {item.media_kind}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void toggleFavorite()}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
              favorite ? "border-amber-300 bg-amber-50 text-amber-700" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <StarIcon filled={favorite} /> {favorite ? "Favorito" : "Marcar favorito"}
          </button>
          <button
            type="button"
            onClick={() => void toggleArchived()}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
              archived ? "border-zinc-400 bg-zinc-100 text-zinc-700" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {archived ? "Archivada (restaurar)" : "Archivar"}
          </button>
        </div>

        {facesRes.data && facesRes.data.faces.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-600">
              Rostros detectados <span className="font-normal text-zinc-400">({facesRes.data.faces.length})</span>
              {facesRes.data.width && facesRes.data.height ? "" : " · sin coordenadas para resaltar"}
            </p>
            <ul className="space-y-1.5">
              {facesRes.data.faces.map((f, idx) => (
                <li
                  key={f.id}
                  onMouseEnter={() => setHoverFace(f.id)}
                  onMouseLeave={() => setHoverFace(null)}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="w-16 shrink-0 text-[11px] text-zinc-400">
                    Rostro {idx + 1}
                    {f.det_score != null ? ` · ${Math.round(f.det_score * 100)}%` : ""}
                  </span>
                  <Select
                    value={faceValue(f)}
                    onChange={(v) => void assignFace(f.id, v)}
                    placeholder="Sin asignar"
                    options={faceOptions}
                    className="min-w-52 flex-1"
                    disabled={busy}
                  />
                  {f.source === "model" && f.confidence != null && (
                    <span className="text-[10px] text-amber-600">sugerido {Math.round(f.confidence * 100)}%</span>
                  )}
                  {f.sface_identity_id && f.sface_similarity != null && (
                    <span
                      className={`text-[10px] ${f.sface_accepted ? "text-violet-700" : "text-zinc-500"}`}
                      title="Prueba independiente OpenCV SFace; no cambia la identidad guardada ni interviene en asistencia."
                    >
                      SFace prueba · {f.sface_display_name ?? "identidad"} · coseno {f.sface_similarity.toFixed(2)}
                      {f.sface_accepted ? " · candidato" : " · no concluyente"}
                    </span>
                  )}
                  {f.source === "model" && faceValue(f) && (
                    <button
                      type="button"
                      onClick={() => void assignFace(f.id, faceValue(f))}
                      disabled={busy}
                      title="Confirma este rostro y úsalo como ejemplo revisado para futuras sugerencias."
                      className="rounded border border-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      Confirmar identidad
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Info label="Remitente" value={item.sender_display_name || item.sender_id || "—"} />
          <Info label="Fecha" value={`${dayLabel(item.at)} · ${timeLabel(item.at)}`} />
          <Info label="Grupo" value={item.conversation_name || (item.is_group ? "Grupo" : "Directo")} />
          <Info label="Dirección" value={item.direction === "inbound" ? "Recibido" : "Enviado"} />
          {item.caption && <Info label="Leyenda" value={item.caption} full />}
          {item.size_bytes != null && <Info label="Tamaño" value={`${(item.size_bytes / 1024).toLocaleString("es-MX", { maximumFractionDigits: 0 })} KB`} />}
          {item.duplicate_count > 1 && <Info label="Apariciones del mismo archivo" value={`${item.duplicate_count} mensajes`} />}
        </div>

        {ocr && (op || ocr.text.trim()) && (
          <div>
            <p className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-600">
              Texto detectado (OCR)
              {op?.app && (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-normal uppercase text-zinc-500">{op.app}</span>
              )}
              {isAttendance && (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                  posible registro de asistencia
                </span>
              )}
            </p>
            {op && (
              <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-zinc-200 bg-zinc-50 p-2 sm:grid-cols-3">
                {op.date && <Info label="Fecha" value={formatDate(op.date)} />}
                {op.time && <Info label="Hora" value={op.time} />}
                {op.type && <Info label="Tipo" value={op.type} />}
                {op.shift_in && <Info label="Entrada" value={op.shift_in} />}
                {op.shift_out && <Info label="Salida" value={op.shift_out} />}
                {op.worked_hours != null && <Info label="Horas" value={String(op.worked_hours)} />}
                {op.code && <Info label="Código" value={op.code} />}
                {op.location && <Info label="Ubicación" value={op.location} full />}
              </div>
            )}
            <details className="text-xs text-zinc-500">
              <summary className="cursor-pointer select-none">Ver texto completo ({ocr.lines.length} líneas)</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-100 p-2 text-[11px] text-zinc-600">
                {ocr.text}
              </pre>
            </details>
          </div>
        )}

        <div>
          <p className="mb-1 text-xs font-medium text-zinc-600">Nota</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Descripción o nota sobre esta foto…"
            className="w-full resize-y rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
          />
          {noteDirty && (
            <div className="mt-1 flex justify-end gap-2">
              <SecondaryButton className="px-2 py-1 text-xs" onClick={() => setNote(savedNote)} disabled={busy}>
                Descartar
              </SecondaryButton>
              <PrimaryButton className="px-2 py-1 text-xs" onClick={() => void saveNote()} disabled={busy}>
                Guardar nota
              </PrimaryButton>
            </div>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-zinc-600">Vinculado a</p>
          <div className="flex flex-wrap gap-1.5">
            {links.length === 0 && <span className="text-xs text-zinc-400">Sin vínculos</span>}
            {links.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-1 rounded-full bg-sky-50 py-0.5 pl-2 pr-1 text-xs text-sky-800">
                <span className="font-medium uppercase text-sky-500">{l.type === "project" ? "Proyecto" : l.type === "ticket" ? "Ticket" : l.type === "maintenance_policy" ? "Póliza" : l.type === "activity" ? "Actividad" : "Técnico"}</span>
                {l.label}
                <button
                  type="button"
                  onClick={() => void removeLink(l.id)}
                  disabled={busy}
                  className="rounded-full px-1 text-sky-400 hover:bg-sky-100 hover:text-sky-700 disabled:opacity-50"
                  aria-label={`Quitar vínculo ${l.label}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Select
              value={linkType}
              onChange={(v) => {
                setLinkType(v);
                setLinkTarget("");
              }}
              options={[
                { value: "project", label: "Proyecto" },
                { value: "ticket", label: "Ticket" },
                { value: "technician", label: "Técnico" },
              ]}
              className="w-36"
            />
            <Select value={linkTarget} onChange={setLinkTarget} placeholder="Selecciona…" options={targetOptions} className="min-w-56 flex-1" />
            <PrimaryButton onClick={() => void addLink()} disabled={busy || !linkTarget}>
              Vincular
            </PrimaryButton>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-zinc-600">Etiquetas</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.length === 0 && <span className="text-xs text-zinc-400">Sin etiquetas</span>}
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-0.5 pl-2 pr-1 text-xs text-zinc-700">
                {t}
                <button
                  type="button"
                  onClick={() => void removeTag(t)}
                  disabled={busy}
                  className="rounded-full px-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-50"
                  aria-label={`Quitar ${t}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addTag();
                }
              }}
              placeholder="Nueva etiqueta…"
              maxLength={40}
              className="flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <PrimaryButton onClick={() => void addTag()} disabled={busy || !draft.trim()}>
              Agregar
            </PrimaryButton>
          </div>
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </div>
      </div>
    </Modal>
  );
}

function Info({ label, value, full = false }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <p className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="text-sm text-zinc-700">{value}</p>
    </div>
  );
}
