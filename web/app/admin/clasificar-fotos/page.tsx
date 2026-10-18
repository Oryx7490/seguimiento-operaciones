"use client";

import { useMemo, useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { EmptyState, Field, SecondaryButton, Select, Spinner, TextInput } from "@/app/components/ui";

interface MediaLink {
  id: string;
  type: string;
  target_id: string;
  label: string;
}
interface Photo {
  media_id: string;
  sha256: string;
  sender_display_name: string | null;
  caption: string | null;
  at: string;
  links: MediaLink[];
}
interface Activity {
  id: string;
  date: string;
  end_date: string | null;
  description: string;
  status: string;
  kind: string;
  client_name: string | null;
  ticket_code: string | null;
  ticket_title: string | null;
  projects_label: string | null;
  policy_name: string | null;
}
interface Project {
  id: string;
  code: string;
  name: string;
}

function cdmxToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function dmy(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function activityLabel(a: Activity): string {
  if (a.kind === "ticket") return `${a.ticket_code ?? "Ticket"} · ${a.ticket_title ?? ""}`;
  if (a.kind === "project") return a.projects_label ?? "Proyecto";
  if (a.kind === "policy") return a.policy_name ?? "Póliza";
  return "Interna";
}

export default function ClasificarFotosPage() {
  const [tab, setTab] = useState<"clasificar" | "libreria">("clasificar");
  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Clasificar fotos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Arrastra las fotos del día hacia la actividad, proyecto o ticket correspondiente. Las fotos quedan en la librería por fecha.
          </p>
        </div>
        <div className="flex gap-1">
          {([["clasificar", "Clasificar"], ["libreria", "Librería por proyecto"]] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setTab(v)} className={`rounded-md px-3 py-1.5 text-sm transition ${tab === v ? "bg-zinc-900 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100"}`}>{label}</button>
          ))}
        </div>
      </div>
      {tab === "clasificar" ? <ClassifyTab /> : <LibraryTab />}
    </div>
  );
}

function ClassifyTab() {
  const [date, setDate] = useState(() => cdmxToday());
  const [q, setQ] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [overTarget, setOverTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const photosRes = useResource<{ items: Photo[] }>(`/api/whatsapp/media?from=${date}&to=${date}&kind=image&limit=200&_=${nonce}`);
  const actsRes = useResource<{ activities: Activity[] }>(`/api/activities?from=${date}&to=${date}`);
  const projectsRes = useResource<{ projects: Project[] }>("/api/projects");

  const [targetType, setTargetType] = useState<"project" | "ticket" | "activity">("project");
  const [targetId, setTargetId] = useState("");

  const photos = photosRes.data?.items ?? [];
  const activities = actsRes.data?.activities ?? [];
  const projects = projectsRes.data?.projects ?? [];

  const filteredPhotos = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return photos;
    return photos.filter((p) => [p.sender_display_name, p.caption].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [photos, q]);

  const assignedCount = (type: string, id: string) => photos.filter((p) => p.links.some((l) => l.type === type && l.target_id === id)).length;

  async function link(sha256: string, type: string, id: string) {
    setBusy(true);
    setErr(null);
    try {
      await fetchJson(`/api/whatsapp/media/${sha256}/links`, { method: "POST", body: JSON.stringify({ type, id }) });
      setNonce((n) => n + 1);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function unlink(sha256: string, linkId: string) {
    setBusy(true);
    setErr(null);
    try {
      await fetchJson(`/api/whatsapp/media/${sha256}/links?id=${linkId}`, { method: "DELETE" });
      setNonce((n) => n + 1);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const targetOptions = targetType === "project" ? projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })) : [];

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Fecha">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        </Field>
        <Field label="Buscar foto">
          <TextInput value={q} onChange={setQ} placeholder="Remitente o leyenda…" className="w-56" />
        </Field>
        <SecondaryButton onClick={() => setNonce((n) => n + 1)}>Recargar</SecondaryButton>
        <span className="pb-1.5 text-sm text-zinc-500">{filteredPhotos.length} fotos · {activities.length} actividades</span>
      </div>

      {err && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Fotos */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Fotos del día (arrastra)</h2>
          {!photosRes.data ? (
            <Spinner />
          ) : filteredPhotos.length === 0 ? (
            <EmptyState title="Sin fotos ese día" />
          ) : (
            <div className="grid max-h-[70vh] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
              {filteredPhotos.map((p) => (
                <div
                  key={p.media_id}
                  draggable
                  onDragStart={() => setDragging(p.sha256)}
                  onDragEnd={() => setDragging(null)}
                  className={`cursor-grab overflow-hidden rounded-md border bg-white shadow-sm ${dragging === p.sha256 ? "border-sky-400 opacity-60" : "border-zinc-200"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/whatsapp/media/${p.sha256}/thumb`} alt="" loading="lazy" className="h-24 w-full object-cover" />
                  <div className="p-1.5">
                    <p className="truncate text-[10px] text-zinc-500">{timeLabel(p.at)} · {p.sender_display_name ?? "—"}</p>
                    {p.links.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.links.map((l) => (
                          <span key={l.id} className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1 py-0.5 text-[9px] text-emerald-700" title={l.label}>
                            {l.label.slice(0, 14)}
                            <button type="button" disabled={busy} onClick={() => void unlink(p.sha256, l.id)} className="text-emerald-500 hover:text-rose-600 disabled:opacity-40">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Destinos */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Actividades del día (suelta aquí)</h2>
          {!actsRes.data ? (
            <Spinner />
          ) : activities.length === 0 ? (
            <EmptyState title="Sin actividades ese día" />
          ) : (
            <div className="space-y-2">
              {activities.map((a) => {
                const id = `activity:${a.id}`;
                const count = assignedCount("activity", a.id);
                return (
                  <div
                    key={a.id}
                    onDragOver={(e) => { e.preventDefault(); setOverTarget(id); }}
                    onDragLeave={() => setOverTarget((t) => (t === id ? null : t))}
                    onDrop={(e) => { e.preventDefault(); setOverTarget(null); if (dragging) void link(dragging, "activity", a.id); }}
                    className={`rounded-md border px-3 py-2 transition ${overTarget === id ? "border-sky-400 bg-sky-50" : "border-zinc-200 bg-white"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-800">{a.description}</p>
                        <p className="truncate text-[11px] text-zinc-500">{activityLabel(a)}{a.client_name ? ` · ${a.client_name}` : ""}</p>
                      </div>
                      {count > 0 && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{count} foto(s)</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <h2 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">Proyecto / ticket (opcional)</h2>
          <div className="flex flex-wrap items-end gap-2">
            <Select value={targetType} onChange={(v) => { setTargetType(v as typeof targetType); setTargetId(""); }} options={[{ value: "project", label: "Proyecto" }]} className="w-36" />
            <Select value={targetId} onChange={setTargetId} placeholder="Elegir…" options={targetOptions} className="min-w-56" />
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setOverTarget("target"); }}
            onDragLeave={() => setOverTarget((t) => (t === "target" ? null : t))}
            onDrop={(e) => { e.preventDefault(); setOverTarget(null); if (dragging && targetId) void link(dragging, targetType, targetId); }}
            className={`mt-2 rounded-md border-2 border-dashed px-3 py-6 text-center text-sm ${overTarget === "target" ? "border-sky-400 bg-sky-50 text-sky-700" : "border-zinc-300 text-zinc-400"}`}
          >
            {targetId ? "Suelta aquí para vincular" : "Elige un proyecto para habilitar"}
          </div>
        </section>
      </div>
    </div>
  );
}

function LibraryTab() {
  const [projectId, setProjectId] = useState("");
  const projectsRes = useResource<{ projects: Project[] }>("/api/projects");
  const { data, error } = useResource<{ items: Photo[] }>(projectId ? `/api/whatsapp/media?project_id=${projectId}&kind=image&limit=200` : "/api/whatsapp/media?project_id=00000000-0000-0000-0000-000000000000&kind=image&limit=1");
  const photos = data?.items ?? [];

  const groups = useMemo(() => {
    const map = new Map<string, Photo[]>();
    for (const p of photos) {
      const day = p.at.slice(0, 10);
      const arr = map.get(day) ?? [];
      arr.push(p);
      map.set(day, arr);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [photos]);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Proyecto">
          <Select value={projectId} onChange={setProjectId} placeholder="Elige un proyecto…" options={(projectsRes.data?.projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} className="min-w-72" />
        </Field>
        {projectId && <span className="pb-1.5 text-sm text-zinc-500">{photos.length} fotos</span>}
      </div>

      {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {!projectId ? (
        <p className="mt-6 text-sm text-zinc-400">Elige un proyecto para ver su librería de fotos por fecha.</p>
      ) : !data ? (
        <Spinner />
      ) : photos.length === 0 ? (
        <div className="mt-6"><EmptyState title="Este proyecto no tiene fotos vinculadas" /></div>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{dmy(day)} <span className="font-normal text-zinc-300">· {items.length}</span></h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
                {items.map((p) => (
                  <a key={p.media_id} href={`/api/whatsapp/media/${p.sha256}`} target="_blank" rel="noreferrer" className="overflow-hidden rounded-md border border-zinc-200 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/whatsapp/media/${p.sha256}/thumb`} alt="" loading="lazy" className="h-20 w-full object-cover" />
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
