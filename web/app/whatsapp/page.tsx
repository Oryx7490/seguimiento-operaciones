"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { EmptyState, Field, Modal, PrimaryButton, SecondaryButton, Select, Spinner, TextInput } from "@/app/components/ui";

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

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sender, setSender] = useState("");
  const [tag, setTag] = useState("");
  const [kind, setKind] = useState("image");
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
    if (favoriteOnly) p.set("favorite", "true");
    if (showArchived) p.set("archived", "all");
    if (debouncedQ.trim()) p.set("q", debouncedQ.trim());
    return p.toString();
  }, [from, to, sender, tag, kind, favoriteOnly, showArchived, debouncedQ]);

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
          <Select value={kind} onChange={setKind} options={KIND_OPTIONS} className="min-w-36" />
        </Field>
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
    </div>
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
                {op.date && <Info label="Fecha" value={op.date} />}
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
                <span className="font-medium uppercase text-sky-500">{l.type === "project" ? "Proyecto" : l.type === "ticket" ? "Ticket" : l.type === "activity" ? "Actividad" : "Técnico"}</span>
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
