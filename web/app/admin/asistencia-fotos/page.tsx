"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fetchJson, useResource } from "@/app/lib/client";
import { Badge, EmptyState, Field, Modal, PrimaryButton, SecondaryButton, Select, Spinner, TextInput } from "@/app/components/ui";

interface Candidate {
  id: string;
  sha256: string;
  sender_id: string | null;
  sender_display_name: string | null;
  message_at?: string | null;
  technician_id: string | null;
  technician_name: string | null;
  face_suggestion?: { technician_id: string; display_name: string | null; similarity: number } | null;
  match_status: string;
  match_source: string | null;
  event_type: string | null;
  event_date: string | null;
  event_time: string | null;
  shift_in: string | null;
  shift_out: string | null;
  image_time: string | null;
  image_date: string | null;
  manual_override: boolean;
  override_note: string | null;
  notes: string | null;
  worked_hours: number | null;
  location: string | null;
  app: string | null;
  code: string | null;
  confidence: number | null;
  ambiguity: string[];
  status: string;
  caption: string | null;
}

interface Tech {
  id: string;
  display_name: string;
}

const AMB: Record<string, string> = {
  tecnico_desconocido: "Sin técnico",
  varios_tecnicos: "Varios técnicos",
  sin_fecha: "Sin fecha",
  sin_hora: "Sin hora",
  tipo_desconocido: "Sin tipo",
  hora_vs_jornada: "Hora ≠ jornada",
  discrepancia_hora: "Discrepancia hora",
  fecha_del_mensaje: "Fecha del mensaje",
};

/** Fecha en formato México: día/mes/año. */
function dmy(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Sufijo para salidas al día siguiente: "+" o "+N" para varios días. */
function exitSuffix(overnight?: boolean, offset?: number): string {
  if (!overnight) return "";
  const n = offset ?? 1;
  return n > 1 ? `+${n}` : "+";
}

/** Fecha + día de la semana + hora del mensaje (zona CDMX). */
function msgStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const wd = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", weekday: "short" }).format(d);
  const date = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" }).format(d);
  return `${wd} ${date} · ${time}`;
}

/** ISO (YYYY-MM-DD) -> texto dd/mm/aaaa para el campo editable. */
function isoToDmyInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
}

/** Texto dd/mm/aaaa -> ISO (YYYY-MM-DD); null si no es válido. */
function parseDmyInput(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const TABS = [
  { value: "pending", label: "Pendientes" },
  { value: "registered", label: "Registrados" },
  { value: "rejected", label: "Rechazados" },
  { value: "all", label: "Todos" },
];

export default function AttendancePhotosPage() {
  const [tab, setTab] = useState<"review" | "weekly">("review");
  const [status, setStatus] = useState("pending");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const techs = useResource<{ technicians: Tech[] }>("/api/technicians");

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("status", status);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    p.set("limit", "200");
    return p.toString();
  }, [status, from, to]);

  const { data, error, reload } = useResource<{ items: Candidate[]; total: number }>(`/api/attendance/candidates?${query}`);
  const items = data?.items ?? [];
  const loading = !data && !error;
  const [zoom, setZoom] = useState<Candidate | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkErr, setBulkErr] = useState<string | null>(null);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectableIds = items.filter((c) => c.status === "pending").map((c) => c.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  async function rejectSelected() {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setBulkErr(null);
    try {
      await fetchJson("/api/attendance/candidates/bulk", { method: "POST", body: JSON.stringify({ ids: [...selected] }) });
      setSelected(new Set());
      reload();
    } catch (e) {
      setBulkErr(String(e));
    } finally {
      setBulkBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((c) =>
      [c.technician_name, c.sender_display_name, c.location, c.caption, c.event_date]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [items, q]);

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Asistencia por fotos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Candidatos de entrada/salida detectados en las fotos de WhatsApp. Revisa y confirma para registrar horas.
          </p>
        </div>
        <span className="text-sm text-zinc-600">
          <span className="font-semibold">{filtered.length}</span> de {items.length}
        </span>
      </div>

      <div className="mt-3 flex gap-1">
        {([["review", "Revisión"], ["weekly", "Resumen semanal"]] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setTab(v)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${tab === v ? "bg-zinc-900 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {tab === "review" && (
        <>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setStatus(t.value)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                status === t.value ? "bg-zinc-900 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="text-sm text-zinc-500">
          Desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-sm text-zinc-500">
          Hasta
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        </label>
        <TextInput value={q} onChange={setQ} placeholder="Buscar técnico, ubicación…" className="w-64" />
        <SecondaryButton onClick={reload}>Recargar</SecondaryButton>
      </div>

      {bulkErr && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{bulkErr}</div>}

      {selected.size > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
          <span className="text-zinc-600">{selected.size} seleccionada(s)</span>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void rejectSelected()}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-40"
          >
            {bulkBusy ? "Rechazando…" : "Rechazar seleccionadas"}
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-zinc-500 hover:underline">
            Quitar selección
          </button>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-4"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="p-4"><EmptyState title="No hay candidatos en este filtro" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="w-8 px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => setSelected(e.target.checked ? new Set(selectableIds) : new Set())}
                      disabled={selectableIds.length === 0}
                      title="Seleccionar pendientes"
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                  </th>
                  <th className="px-3 py-2 text-left">Foto</th>
                  <th className="px-3 py-2 text-left">Remitente</th>
                  <th className="px-3 py-2 text-left">Técnico</th>
                  <th className="px-3 py-2 text-left">Fecha / horas</th>
                  <th className="px-3 py-2 text-left">Señales</th>
                  <th className="px-3 py-2 text-right">Acción</th>
                  <th className="px-3 py-2 text-left">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map((c) => (
                  <Row
                    key={c.id}
                    candidate={c}
                    techs={techs.data?.technicians ?? []}
                    onDone={reload}
                    onZoom={setZoom}
                    selected={selected.has(c.id)}
                    onToggle={() => toggleSelect(c.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}

      {tab === "weekly" && <WeeklyAttendance />}

      {zoom && (
        <Modal open={true} onClose={() => setZoom(null)} title={zoom.sender_display_name || "Foto"} wide>
          <div className="flex justify-center rounded-md bg-zinc-900 p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/whatsapp/media/${zoom.sha256}`} alt="" className="max-h-[70vh] w-auto" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <div><p className="text-[11px] uppercase text-zinc-400">Fecha</p><p className="text-zinc-700">{dmy(zoom.event_date)}</p></div>
            <div><p className="text-[11px] uppercase text-zinc-400">Hora</p><p className="text-zinc-700">{zoom.event_time ?? (zoom.shift_in ? `${zoom.shift_in}–${zoom.shift_out ?? "?"}` : "—")}</p></div>
            <div><p className="text-[11px] uppercase text-zinc-400">Tipo</p><p className="text-zinc-700">{zoom.event_type ?? "—"}</p></div>
            {zoom.location && <div className="col-span-2 sm:col-span-3"><p className="text-[11px] uppercase text-zinc-400">Ubicación</p><p className="text-zinc-700">{zoom.location}</p></div>}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({
  candidate,
  techs,
  onDone,
  onZoom,
  selected,
  onToggle,
}: {
  candidate: Candidate;
  techs: Tech[];
  onDone: () => void;
  onZoom: (c: Candidate) => void;
  selected: boolean;
  onToggle: () => void;
}) {
  const [techId, setTechId] = useState(candidate.technician_id ?? candidate.face_suggestion?.technician_id ?? "");
  const [type, setType] = useState(candidate.event_type ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const imageStart = candidate.shift_in ?? (candidate.event_type === "entrada" ? candidate.image_time : null);
  const imageEnd = candidate.shift_out ?? (candidate.event_type === "salida" ? candidate.image_time : null);
  const toInput = (t: string | null) => (t ? t.slice(0, 5) : "");
  const hms = (t: string | null) => (t ? (t.length === 5 ? `${t}:00` : t.slice(0, 8)) : null);
  const imageTimes = [candidate.shift_in, candidate.shift_out, candidate.image_time]
    .filter(Boolean)
    .map((t) => hms(t as string))
    .sort();

  const [date, setDate] = useState(candidate.event_date ?? candidate.image_date ?? "");
  const [dateText, setDateText] = useState(() => isoToDmyInput(candidate.event_date ?? candidate.image_date));
  const [entrada, setEntrada] = useState(toInput(imageStart ?? candidate.event_time));
  const [salida, setSalida] = useState(toInput(imageEnd));
  const [notes, setNotes] = useState(candidate.notes ?? "");
  const [notesSaved, setNotesSaved] = useState(candidate.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);

  const manualTimes = [hms(entrada || null), hms(salida || null)].filter(Boolean).sort();
  const imageHasTime = imageTimes.length > 0;
  const imageHasDate = candidate.image_date != null;
  const discrepancy =
    (imageHasTime && imageTimes.join("|") !== manualTimes.join("|")) ||
    (imageHasDate && date !== candidate.image_date);

  const done = candidate.status !== "pending";

  const notesDirty = notes.trim() !== notesSaved.trim();

  async function saveNotes() {
    setSavingNotes(true);
    setErr(null);
    try {
      const r = await fetchJson<{ candidate: { notes: string | null } }>(`/api/attendance/candidates/${candidate.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: notes.trim() || null }),
      });
      setNotesSaved(r.candidate.notes ?? "");
      setNotes(r.candidate.notes ?? "");
    } catch (e) {
      setErr(String(e));
    } finally {
      setSavingNotes(false);
    }
  }

  async function act(action: "approve" | "reject") {
    setBusy(true);
    setErr(null);
    try {
      await fetchJson(`/api/attendance/candidates/${candidate.id}`, {
        method: "POST",
        body: JSON.stringify({
          action,
          ...(action === "approve"
            ? {
                technician_id: techId || undefined,
                event_type: type || undefined,
                event_date: date || undefined,
                shift_in: entrada || null,
                shift_out: salida || null,
              }
            : {}),
        }),
      });
      onDone();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const timeCell = candidate.shift_in || candidate.shift_out
    ? `${candidate.shift_in ?? "?"} – ${candidate.shift_out ?? "?"}`
    : candidate.event_time ?? "—";

  return (
    <>
    <tr className="align-top hover:bg-zinc-50">
      <td className="w-8 px-2 py-2 text-center align-middle">
        {candidate.status === "pending" && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label="Seleccionar"
            className="h-4 w-4 rounded border-zinc-300"
          />
        )}
      </td>
      <td className="w-20 p-2 align-middle">
        <button type="button" onClick={() => onZoom(candidate)} title="Ver foto" className="block h-full w-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/whatsapp/media/${candidate.sha256}/thumb`}
            alt=""
            loading="lazy"
            className="h-full min-h-14 w-full rounded object-cover"
          />
        </button>
      </td>
      <td className="px-3 py-2">
        <div className="text-xs font-medium text-zinc-700">{candidate.sender_display_name || "—"}</div>
        {candidate.sender_id && <div className="text-[10px] text-zinc-400">{candidate.sender_id}</div>}
        {candidate.message_at && (
          <div className="text-[11px] font-semibold text-sky-700" title="Fecha y hora del mensaje (probable entrada/salida)">
            {msgStamp(candidate.message_at)}
          </div>
        )}
        {candidate.caption && <div className="max-w-40 truncate text-[11px] text-zinc-400" title={candidate.caption}>{candidate.caption}</div>}
        {candidate.app && <div className="text-[10px] uppercase text-zinc-400">{candidate.app}</div>}
      </td>
      <td className="px-3 py-2">
        {done ? (
          <span className="text-zinc-700">{candidate.technician_name ?? "—"}</span>
        ) : (
          <Select
            value={techId}
            onChange={setTechId}
            placeholder="— elegir —"
            options={techs.map((t) => ({ value: t.id, label: t.display_name }))}
            className="min-w-44"
          />
        )}
        <div className="mt-1">
          {done ? (
            <span className="text-xs text-zinc-500">{candidate.event_type ?? "—"}</span>
          ) : (
            <Select
              value={type}
              onChange={setType}
              placeholder="Tipo"
              options={[
                { value: "entrada", label: "Entrada" },
                { value: "salida", label: "Salida" },
              ]}
              className="min-w-28"
            />
          )}
        </div>
        {!done && candidate.face_suggestion && (
          <div className="mt-1 text-[10px] text-violet-700" title="Sugerido por reconocimiento facial (centroides)">
            Rostro sugerido: {candidate.face_suggestion.display_name ?? "—"} ({Math.round((candidate.face_suggestion.similarity ?? 0) * 100)}%)
          </div>
        )}
        {techId && (
          <Link href={`/admin/tecnicos/${techId}/horas`} className="mt-1 block text-[11px] text-sky-700 hover:underline">
            Ver horas →
          </Link>
        )}
      </td>
      <td className="px-3 py-2 text-zinc-600">
        {done ? (
          <>
            <div>{dmy(candidate.event_date)}</div>
            <div className="text-xs text-zinc-500">{timeCell}</div>
            {candidate.worked_hours != null && <div className="text-[11px] text-zinc-400">{candidate.worked_hours} h</div>}
            {candidate.manual_override && <div className="mt-0.5 text-[10px] font-medium text-amber-600">ajuste manual</div>}
          </>
        ) : (
          <>
            <input
              type="text"
              inputMode="numeric"
              value={dateText}
              placeholder="dd/mm/aaaa"
              onChange={(e) => {
                const v = e.target.value;
                setDateText(v);
                setDate(parseDmyInput(v) ?? "");
              }}
              className="w-28 rounded-md border border-zinc-300 px-1.5 py-1 text-xs"
            />
            {candidate.image_date && date !== candidate.image_date && (
              <div className="mt-0.5 text-[10px] text-amber-600">imagen: {dmy(candidate.image_date)}</div>
            )}
            <div className="mt-1 space-y-1">
              <label className="flex items-center gap-1 text-[11px] text-zinc-500">
                <span className="w-12">Entrada</span>
                <input
                  type="time"
                  value={entrada}
                  onChange={(e) => setEntrada(e.target.value)}
                  className="w-24 rounded-md border border-zinc-300 px-1.5 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setEntrada("")}
                  title="Borrar hora de entrada"
                  aria-label="Borrar hora de entrada"
                  className="rounded px-1 text-sm leading-none text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  ×
                </button>
              </label>
              <label className="flex items-center gap-1 text-[11px] text-zinc-500">
                <span className="w-12">Salida</span>
                <input
                  type="time"
                  value={salida}
                  onChange={(e) => setSalida(e.target.value)}
                  className="w-24 rounded-md border border-zinc-300 px-1.5 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setSalida("")}
                  title="Borrar hora de salida"
                  aria-label="Borrar hora de salida"
                  className="rounded px-1 text-sm leading-none text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  ×
                </button>
              </label>
            </div>
            {imageTimes.length > 0 && (
              <div className="text-[10px] text-zinc-400">imagen: {imageTimes.join(" – ")}</div>
            )}
            {discrepancy && <div className="text-[10px] font-medium text-amber-600">discrepancia con la imagen</div>}
          </>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {candidate.match_status === "matched" && <Badge className="bg-emerald-100 text-emerald-700">técnico ok</Badge>}
          {(candidate.ambiguity ?? []).map((a) => (
            <Badge key={a} className="bg-amber-100 text-amber-700">{AMB[a] ?? a}</Badge>
          ))}
        </div>
        {candidate.location && <div className="mt-1 max-w-52 truncate text-[11px] text-zinc-400" title={candidate.location}>{candidate.location}</div>}
        {err && <div className="mt-1 text-[11px] text-red-600">{err}</div>}
      </td>
      <td className="px-3 py-2 text-right">
        {done ? (
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-zinc-400">{candidate.status}</span>
            {candidate.status === "registered" && candidate.technician_id && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
              >
                Editar
              </button>
            )}
          </div>
        ) : (
          <div className="flex w-24 flex-col items-stretch gap-1">
            <button
              type="button"
              disabled={busy || !techId}
              onClick={() => void act("approve")}
              className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
            >
              Registrar
            </button>
            <SecondaryButton className="px-2 py-1 text-xs" disabled={busy} onClick={() => void act("reject")}>
              Rechazar
            </SecondaryButton>
          </div>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Notas…"
          className="w-44 resize-y rounded-md border border-zinc-300 px-2 py-1 text-xs"
        />
        {notesDirty && (
          <button
            type="button"
            onClick={() => void saveNotes()}
            disabled={savingNotes}
            className="mt-1 rounded-md bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
          >
            {savingNotes ? "Guardando…" : "Guardar nota"}
          </button>
        )}
      </td>
    </tr>
    {editOpen && (
      <EditRegisteredModal
        candidate={candidate}
        techs={techs}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          onDone();
        }}
      />
    )}
    </>
  );
}

interface AttendanceEntry {
  technician_id: string | null;
  display_name: string | null;
  person_name: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  hours: string | number | null;
  overtime: string | number | null;
  manual?: boolean;
  overnight?: boolean;
  exit_offset_days?: number;
}

function cdmxToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
}
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekdayShort(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "short" }).format(new Date(`${iso}T12:00:00Z`));
}
function ddmm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function num(v: string | number | null): number {
  return v == null ? 0 : Number(v);
}

/** Compilado semanal de entradas/salidas por persona. */
function WeeklyAttendance() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(cdmxToday()));
  const currentMonday = mondayOf(cdmxToday());
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const sunday = days[6];
  const [verify, setVerify] = useState<{ id: string; name: string } | null>(null);
  const [reviewDay, setReviewDay] = useState<{ id: string; name: string; date: string } | null>(null);
  const [close, setClose] = useState<{ id: string; name: string; date: string } | null>(null);

  const { data, error, reload } = useResource<{ entries: AttendanceEntry[] }>(`/api/attendance?from=${weekStart}&to=${sunday}`);
  const entries = data?.entries ?? [];
  const loading = !data && !error;

  const rows = useMemo(() => {
    const map = new Map<string, { technician_id: string | null; name: string; byDate: Map<string, AttendanceEntry>; hours: number; overtime: number }>();
    for (const e of entries) {
      const key = e.technician_id ?? `name:${e.person_name}`;
      const row = map.get(key) ?? { technician_id: e.technician_id, name: e.display_name ?? e.person_name ?? "—", byDate: new Map(), hours: 0, overtime: 0 };
      row.byDate.set(e.date, e);
      row.hours += num(e.hours);
      row.overtime += num(e.overtime);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "es-MX", { sensitivity: "base" }));
  }, [entries]);

  const totals = rows.reduce((acc, r) => ({ hours: acc.hours + r.hours, overtime: acc.overtime + r.overtime }), { hours: 0, overtime: 0 });

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <SecondaryButton className="px-2 py-1 text-xs" onClick={() => setWeekStart((w) => addDays(w, -7))}>
          ← Semana anterior
        </SecondaryButton>
        <button type="button" onClick={() => setWeekStart(currentMonday)} className="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100">
          Semana actual
        </button>
        <SecondaryButton className="px-2 py-1 text-xs" onClick={() => setWeekStart((w) => addDays(w, 7))}>
          Semana siguiente →
        </SecondaryButton>
        <span className="text-sm text-zinc-500">
          {ddmm(days[0])} – {ddmm(sunday)} · {totals.hours.toLocaleString("es-MX", { maximumFractionDigits: 2 })} h · extra {totals.overtime.toLocaleString("es-MX", { maximumFractionDigits: 2 })} h
        </span>
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-4"><Spinner /></div>
        ) : rows.length === 0 ? (
          <div className="p-4"><EmptyState title="Sin asistencia registrada esta semana" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">Técnico</th>
                  {days.map((d) => (
                    <th key={d} className="px-2 py-2 text-center">
                      {weekdayShort(d)} <span className="font-normal normal-case text-zinc-400">{ddmm(d)}</span>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">Horas</th>
                  <th className="px-3 py-2 text-right">Extra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => (
                  <tr key={r.name} className="hover:bg-zinc-50">
                    <td className="px-3 py-2 font-medium text-zinc-800">
                      {r.technician_id ? (
                        <button
                          type="button"
                          onClick={() => setVerify({ id: r.technician_id as string, name: r.name })}
                          className="text-left text-sky-700 hover:underline"
                          title="Ver fotos y datos capturados"
                        >
                          {r.name}
                        </button>
                      ) : (
                        r.name
                      )}
                    </td>
                    {days.map((d) => {
                      const e = r.byDate.get(d);
                      const incomplete = e && (!e.check_in || !e.check_out);
                      return (
                        <td key={d} className="px-2 py-2 text-center text-zinc-600">
                          {e ? (
                            <>
                              {r.technician_id ? (
                                <button
                                  type="button"
                                  onClick={() => setReviewDay({ id: r.technician_id as string, name: r.name, date: d })}
                                  className="rounded px-1 py-0.5 text-left hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600"
                                  title="Revisar fotos y datos de este día"
                                  aria-label={`Revisar asistencia de ${r.name} del ${dmy(d)}`}
                                >
                                  <div className="whitespace-nowrap text-xs">
                                    {e.check_in ?? "—"}–{e.check_out ?? "—"}{exitSuffix(e.overnight, e.exit_offset_days)}
                                  </div>
                                  <div className="text-[10px] text-sky-700">Revisar fotos</div>
                                </button>
                              ) : (
                                <div className="whitespace-nowrap text-xs">
                                  {e.check_in ?? "—"}–{e.check_out ?? "—"}{exitSuffix(e.overnight, e.exit_offset_days)}
                                </div>
                              )}
                              {num(e.hours) > 0 && <div className="text-[10px] text-zinc-400">{num(e.hours)} h</div>}
                              {incomplete && r.technician_id && (
                                <button
                                  type="button"
                                  onClick={() => setClose({ id: r.technician_id as string, name: r.name, date: d })}
                                  className="text-[10px] font-semibold text-rose-600 hover:underline"
                                  title="Buscar evidencia y cerrar el registro"
                                >
                                  incompleto
                                </button>
                              )}
                              {e.manual && <div className="text-[10px] font-medium text-sky-600">manual</div>}
                            </>
                          ) : (
                            <span className="text-zinc-300">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right text-zinc-700">{r.hours.toLocaleString("es-MX", { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right text-amber-700">{r.overtime > 0 ? r.overtime.toLocaleString("es-MX", { maximumFractionDigits: 2 }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {verify && (
        <VerifyModal techId={verify.id} techName={verify.name} from={weekStart} to={sunday} onClose={() => setVerify(null)} />
      )}
      {reviewDay && (
        <AttendanceDayReviewModal
          key={`${reviewDay.id}-${reviewDay.date}`}
          techId={reviewDay.id}
          techName={reviewDay.name}
          initialDate={reviewDay.date}
          onClose={() => setReviewDay(null)}
          onSaved={reload}
        />
      )}
      {close && (
        <CloseEntryModal
          techId={close.id}
          techName={close.name}
          date={close.date}
          onClose={() => setClose(null)}
          onSaved={() => {
            setClose(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

interface VerifyPhoto {
  id?: string;
  sha256: string;
  event_type: string | null;
  original_event_type?: string | null;
  event_time: string | null;
  image_time?: string | null;
  image_date?: string | null;
  shift_in: string | null;
  shift_out: string | null;
  event_date?: string | null;
  sender: string | null;
  location?: string | null;
  app?: string | null;
  code?: string | null;
  confidence?: number | null;
  manual_override?: boolean;
  linked_by_review?: boolean;
  caption: string | null;
}
interface NearbyVerifyPhoto extends VerifyPhoto {
  reference_date: string;
  day_offset: number;
  status: string;
  media_state: string;
}
interface VerifyEntry {
  id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  hours: string | number | null;
  overtime: string | number | null;
  overnight?: boolean;
  exit_offset_days?: number;
  manual?: boolean;
  person_name: string;
  photos: VerifyPhoto[];
}

/** Verificación: fotos y datos capturados de un técnico en la semana. */
function VerifyModal({ techId, techName, from, to, onClose }: { techId: string; techName: string; from: string; to: string; onClose: () => void }) {
  const { data, error } = useResource<{ entries: VerifyEntry[] }>(
    `/api/attendance/verify?technician_id=${techId}&from=${from}&to=${to}`
  );
  const entries = data?.entries ?? [];
  const [zoom, setZoom] = useState<string | null>(null);

  return (
    <Modal open={true} onClose={onClose} title={`Verificación · ${techName}`} wide>
      <p className="text-xs text-zinc-500">
        Semana {ddmm(from)} – {ddmm(to)}. Compara la información capturada con las fotos de evidencia.
      </p>

      {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-3 max-h-[65vh] space-y-3 overflow-y-auto">
        {!data ? (
          <Spinner />
        ) : entries.length === 0 ? (
          <EmptyState title="Sin registros esta semana" />
        ) : (
          entries.map((e) => {
            const incomplete = !e.check_in || !e.check_out;
            return (
              <div key={e.date} className="rounded-lg border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold text-zinc-800">{dmy(e.date)}</span>
                  <span className="text-zinc-600">
                    {e.check_in ?? "—"} – {e.check_out ?? "—"}{exitSuffix(e.overnight, e.exit_offset_days)}
                  </span>
                  <span className="text-zinc-500">{num(e.hours)} h</span>
                  {num(e.overtime) > 0 && <span className="text-amber-700">extra {num(e.overtime)} h</span>}
                  {incomplete && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                      {!e.check_in ? "falta entrada" : "falta salida"}
                    </span>
                  )}
                </div>

                {e.photos.length === 0 ? (
                  <p className="mt-2 text-[11px] text-zinc-400">Sin foto de evidencia (registro manual o importado).</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {e.photos.map((p, i) => (
                      <button
                        key={`${p.sha256}-${i}`}
                        type="button"
                        onClick={() => setZoom(p.sha256)}
                        title={p.caption ?? p.sender ?? "Ver foto"}
                        className="overflow-hidden rounded border border-zinc-200"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/whatsapp/media/${p.sha256}/thumb`} alt="" loading="lazy" className="h-16 w-16 object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={() => setZoom(null)}>
          <div className="absolute inset-0 bg-zinc-900/70" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/whatsapp/media/${zoom}`} alt="" className="relative max-h-[85vh] w-auto rounded" />
        </div>
      )}
    </Modal>
  );
}

/** Revisión secundaria de un registro diario, con navegación y corrección en contexto. */
function AttendanceDayReviewModal({
  techId,
  techName,
  initialDate,
  onClose,
  onSaved,
}: {
  techId: string;
  techName: string;
  initialDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  return (
    <Modal open onClose={onClose} title={`Segunda validación · ${techName}`} wide mark="W84" footer={<SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>}>
      <AttendanceDayReview key={date} techId={techId} date={date} onNavigate={setDate} onSaved={onSaved} />
    </Modal>
  );
}

function AttendanceDayReview({
  techId,
  date,
  onNavigate,
  onSaved,
}: {
  techId: string;
  date: string;
  onNavigate: (date: string) => void;
  onSaved: () => void;
}) {
  const { data, error, reload } = useResource<{
    entries: VerifyEntry[];
    navigation: { previous_date: string | null; next_date: string | null } | null;
    nearby_photos: NearbyVerifyPhoto[];
  }>(`/api/attendance/verify?technician_id=${techId}&date=${date}`);
  const entry = data?.entries.find((row) => row.date === date) ?? null;
  const [zoom, setZoom] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [entrada, setEntrada] = useState("");
  const [salida, setSalida] = useState("");
  const [offsetDays, setOffsetDays] = useState("0");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [photoActionError, setPhotoActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!entry) return;
    setEntrada(entry.check_in ?? "");
    setSalida(entry.check_out ?? "");
    setOffsetDays(String(entry.exit_offset_days ?? 0));
  }, [entry?.date, entry?.check_in, entry?.check_out, entry?.exit_offset_days]);

  const photos = entry?.photos ?? [];
  const isEntryPhoto = (photo: VerifyPhoto) => photo.event_type === "entrada" || (!photo.event_type && Boolean(photo.shift_in));
  const isExitPhoto = (photo: VerifyPhoto) => photo.event_type === "salida" || (!photo.event_type && Boolean(photo.shift_out));
  const entryPhotos = photos.filter((photo) => isEntryPhoto(photo) || (photo.shift_in && photo.shift_out));
  const exitPhotos = photos.filter((photo) => isExitPhoto(photo) || (photo.shift_in && photo.shift_out));
  const otherPhotos = photos.filter((photo) => !entryPhotos.includes(photo) && !exitPhotos.includes(photo));
  const nearbyPhotos = data?.nearby_photos ?? [];
  const nearbyByDate = nearbyPhotos.reduce((groups, photo) => {
    const group = groups.get(photo.reference_date) ?? [];
    group.push(photo);
    groups.set(photo.reference_date, group);
    return groups;
  }, new Map<string, NearbyVerifyPhoto[]>());

  async function changePhotoLink(photo: VerifyPhoto, photoType: "entrada" | "salida", method: "POST" | "DELETE") {
    if (!photo.id) return;
    const key = `${photo.id}:${photoType}`;
    setPhotoBusy(key);
    setPhotoActionError(null);
    try {
      await fetchJson("/api/attendance/verify", {
        method,
        body: JSON.stringify({ technician_id: techId, date, candidate_id: photo.id, photo_type: photoType }),
      });
      reload();
      onSaved();
    } catch (err) {
      setPhotoActionError(String(err));
    } finally {
      setPhotoBusy(null);
    }
  }

  async function saveCorrection() {
    if (!entrada && !salida) {
      setSaveError("Indica al menos la hora de entrada o la de salida.");
      return;
    }
    setBusy(true);
    setSaveError(null);
    try {
      await fetchJson("/api/attendance/entry", {
        method: "PATCH",
        body: JSON.stringify({
          technician_id: techId,
          date,
          check_in: entrada || null,
          check_out: salida || null,
          exit_offset_days: Number(offsetDays) || 0,
        }),
      });
      setEditing(false);
      reload();
      onSaved();
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const photoPanel = (title: string, items: VerifyPhoto[], emptyLabel: string, photoType?: "entrada" | "salida") => (
    <section className="rounded-lg border border-zinc-200 p-3">
      <h3 className="text-sm font-semibold text-zinc-800">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-400">{emptyLabel}</p>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((photo, index) => (
            <article key={`${photo.id ?? photo.sha256}-${index}`} className="overflow-hidden rounded-md border border-zinc-200 bg-white">
              <button type="button" onClick={() => setZoom(photo.sha256)} className="block h-36 w-full bg-zinc-100" title="Abrir foto completa">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/whatsapp/media/${photo.sha256}/thumb`} alt="Evidencia de asistencia" loading="lazy" className="h-full w-full object-contain" />
              </button>
              <div className="space-y-1 p-2 text-[10px] text-zinc-500">
                <p className="font-medium text-zinc-700">{photo.sender || "Remitente no identificado"}{photo.event_time ? ` · ${photo.event_time}` : ""}</p>
                {(photo.shift_in || photo.shift_out) && <p>Capturado: {photo.shift_in ?? "—"}–{photo.shift_out ?? "—"}</p>}
                {photo.image_time && <p>Hora leída de imagen: {photo.image_time}</p>}
                {photo.event_date && <p>Fecha del evento: {dmy(photo.event_date)}</p>}
                {photo.caption && <p className="line-clamp-2" title={photo.caption}>{photo.caption}</p>}
                {photo.location && <p className="truncate" title={photo.location}>{photo.location}</p>}
                {photo.manual_override && <p className="font-medium text-amber-700">Hora o fecha corregida manualmente</p>}
                {photo.linked_by_review && (
                  <div className="flex flex-wrap items-center justify-between gap-1 border-t border-zinc-100 pt-1">
                    <span className="text-sky-700">Vínculo agregado en W84</span>
                    {photoType && photo.id && (
                      <button type="button" disabled={photoBusy === `${photo.id}:${photoType}`} onClick={() => void changePhotoLink(photo, photoType, "DELETE")} className="font-medium text-red-700 hover:underline disabled:opacity-50">
                        {photoBusy === `${photo.id}:${photoType}` ? "Quitando…" : "Quitar vínculo"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-2 py-1.5">
        <SecondaryButton className="px-2 py-1 text-xs" disabled={!data?.navigation?.previous_date} onClick={() => data?.navigation?.previous_date && onNavigate(data.navigation.previous_date)} aria-label="Día anterior">
          ← <span className="hidden sm:inline">Día anterior</span>
        </SecondaryButton>
        <div className="text-center">
          <p className="text-sm font-semibold text-zinc-800">{weekdayShort(date)} · {dmy(date)}</p>
          <p className="text-[10px] text-zinc-500">Navega por los días con registro de este técnico</p>
        </div>
        <SecondaryButton className="px-2 py-1 text-xs" disabled={!data?.navigation?.next_date} onClick={() => data?.navigation?.next_date && onNavigate(data.navigation.next_date)} aria-label="Día siguiente">
          <span className="hidden sm:inline">Día siguiente</span> →
        </SecondaryButton>
      </div>

      {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {!data ? <div className="py-8"><Spinner /></div> : !entry ? (
        <div className="py-6"><EmptyState title="No hay un registro guardado para este día" /></div>
      ) : (
        <div className="mt-3 max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          <section className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-800">Información registrada</h3>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <span><span className="text-xs text-zinc-500">Entrada:</span> <strong>{entry.check_in ?? "—"}</strong></span>
                  <span><span className="text-xs text-zinc-500">Salida:</span> <strong>{entry.check_out ?? "—"}{exitSuffix(entry.overnight, entry.exit_offset_days)}</strong></span>
                  <span><span className="text-xs text-zinc-500">Horas:</span> <strong>{num(entry.hours)} h</strong></span>
                  {num(entry.overtime) > 0 && <span className="text-amber-700">Extra: {num(entry.overtime)} h</span>}
                  {entry.manual && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">ajuste manual</span>}
                </div>
              </div>
              {!editing && <SecondaryButton className="px-2 py-1 text-xs" onClick={() => setEditing(true)}>Corregir registro</SecondaryButton>}
            </div>

            {editing && (
              <div className="mt-3 border-t border-zinc-100 pt-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Entrada registrada">
                    <input type="time" value={entrada} onChange={(event) => setEntrada(event.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
                  </Field>
                  <Field label="Salida registrada">
                    <input type="time" value={salida} onChange={(event) => setSalida(event.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
                  </Field>
                  <Field label="La salida es">
                    <Select value={offsetDays} onChange={setOffsetDays} options={[
                      { value: "0", label: "del mismo día" },
                      { value: "1", label: "del día siguiente (+1)" },
                      { value: "2", label: "+2 días" },
                      { value: "3", label: "+3 días" },
                    ]} />
                  </Field>
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">Se actualizarán el registro y sus horas extra; las fotos y las horas leídas originalmente se conservan como evidencia.</p>
                {saveError && <p className="mt-2 text-xs text-red-700">{saveError}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <SecondaryButton onClick={() => { setEditing(false); setSaveError(null); }}>Cancelar</SecondaryButton>
                  <PrimaryButton onClick={() => void saveCorrection()} disabled={busy}>{busy ? "Guardando…" : "Guardar corrección"}</PrimaryButton>
                </div>
              </div>
            )}
          </section>

          <div className="grid gap-3 md:grid-cols-2">
            {photoPanel("Fotos de entrada", entryPhotos, "No hay una foto de entrada vinculada a este registro.", "entrada")}
            {photoPanel("Fotos de salida", exitPhotos, "No hay una foto de salida vinculada a este registro.", "salida")}
          </div>
          {(entryPhotos.length === 0 || exitPhotos.length === 0) && (
            <section className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-800">Seleccionar foto de entrada o salida</h3>
                <p className="mt-1 text-[11px] text-zinc-600">Fotos asociadas al técnico del día seleccionado, dos días antes y dos días después. Al elegir una, se agrega como evidencia sin cambiar su captura original.</p>
              </div>
              {photoActionError && <p className="mt-2 text-xs text-red-700">{photoActionError}</p>}
              {nearbyPhotos.length === 0 ? (
                <p className="mt-3 text-xs text-zinc-500">No hay fotos disponibles en el rango de cinco días.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {[...nearbyByDate.entries()].map(([photoDate, dayPhotos]) => {
                    const offset = dayPhotos[0]?.day_offset ?? 0;
                    const relative = offset === 0 ? "Día seleccionado" : `${Math.abs(offset)} día${Math.abs(offset) === 1 ? "" : "s"} ${offset < 0 ? "antes" : "después"}`;
                    return (
                      <div key={photoDate}>
                        <h4 className="mb-1 text-[11px] font-semibold text-zinc-600">{dmy(photoDate)} · {relative}</h4>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {dayPhotos.map((photo) => (
                            <article key={photo.id} className="flex gap-2 rounded-md border border-zinc-200 bg-white p-2">
                              <button type="button" onClick={() => setZoom(photo.sha256)} className="h-20 w-20 shrink-0 overflow-hidden rounded bg-zinc-100" title="Abrir foto completa">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/api/whatsapp/media/${photo.sha256}/thumb`} alt="Foto disponible para revisión" loading="lazy" className="h-full w-full object-cover" />
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[11px] font-medium text-zinc-700">{photo.sender || "Remitente no identificado"}</p>
                                <p className="text-[10px] text-zinc-500">{photo.event_time ?? photo.image_time ?? "Hora sin identificar"}{photo.event_type ? ` · ${photo.event_type}` : ""}</p>
                                {photo.caption && <p className="mt-0.5 line-clamp-2 text-[10px] text-zinc-500" title={photo.caption}>{photo.caption}</p>}
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {entryPhotos.length === 0 && (
                                    <button type="button" disabled={photoBusy === `${photo.id}:entrada`} onClick={() => void changePhotoLink(photo, "entrada", "POST")} className="rounded border border-sky-200 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50">
                                      {photoBusy === `${photo.id}:entrada` ? "Vinculando…" : "Usar como entrada"}
                                    </button>
                                  )}
                                  {exitPhotos.length === 0 && (
                                    <button type="button" disabled={photoBusy === `${photo.id}:salida`} onClick={() => void changePhotoLink(photo, "salida", "POST")} className="rounded border border-emerald-200 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                                      {photoBusy === `${photo.id}:salida` ? "Vinculando…" : "Usar como salida"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
          {otherPhotos.length > 0 && photoPanel("Otras fotos del registro", otherPhotos, "")}
          {photos.length === 0 && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Este registro no tiene fotos vinculadas; puede provenir de una captura manual o una importación. Puedes buscar evidencia cercana en la sección anterior.</p>}
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={() => setZoom(null)}>
          <div className="absolute inset-0 bg-zinc-900/70" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/whatsapp/media/${zoom}`} alt="Evidencia de asistencia" className="relative max-h-[85vh] w-auto rounded" />
        </div>
      )}
    </>
  );
}

interface DayContext {
  technician: { id: string; display_name: string };
  entry: {
    date: string;
    check_in: string | null;
    check_out: string | null;
    hours: number | null;
    overtime: number | null;
    manual: boolean;
    overnight?: boolean;
    exit_offset_days?: number;
    person_name: string;
  } | null;
  candidates: {
    sha256: string;
    event_date: string | null;
    event_time: string | null;
    shift_in: string | null;
    shift_out: string | null;
    event_type: string | null;
    status: string;
    sender_display_name: string | null;
    caption: string | null;
  }[];
  messages: { date: string; at: string; body_text: string | null }[];
}

/** Cerrar/ajustar manualmente un día: muestra fotos y mensajes cercanos para estimar la hora. */
function CloseEntryModal({
  techId,
  techName,
  date,
  onClose,
  onSaved,
}: {
  techId: string;
  techName: string;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, error } = useResource<DayContext>(`/api/attendance/day-context?technician_id=${techId}&date=${date}`);
  const [entrada, setEntrada] = useState("");
  const [salida, setSalida] = useState("");
  const [offsetDays, setOffsetDays] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const init = useRef(false);

  useEffect(() => {
    if (data && !init.current) {
      setEntrada(data.entry?.check_in ?? "");
      setSalida(data.entry?.check_out ?? "");
      setOffsetDays(String(data.entry?.exit_offset_days ?? 0));
      init.current = true;
    }
  }, [data]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await fetchJson("/api/attendance/entry", {
        method: "PATCH",
        body: JSON.stringify({ technician_id: techId, date, check_in: entrada || null, check_out: salida || null, exit_offset_days: Number(offsetDays) || 0 }),
      });
      onSaved();
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title={`Cerrar registro · ${techName}`} mark="W82" wide>
      <p className="text-xs text-zinc-500">
        Día {dmy(date)}. Revisa las fotos y mensajes cercanos para estimar la hora; si no hay evidencia, colócala a mano (quedará marcada como manual).
      </p>

      {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {!data ? (
        <Spinner />
      ) : (
        <div className="mt-3 max-h-[60vh] space-y-4 overflow-y-auto">
          <div className="rounded-lg border border-zinc-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Registro actual</p>
            <p className="mt-1 text-sm text-zinc-700">
              Entrada {data.entry?.check_in ?? "—"} · Salida {data.entry?.check_out ?? "—"}{exitSuffix(data.entry?.overnight, data.entry?.exit_offset_days)} · {num(data.entry?.hours ?? 0)} h
              {data.entry?.manual && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">manual</span>}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Fotos cercanas ({data.candidates.length})</p>
            {data.candidates.length === 0 ? (
              <p className="mt-1 text-[11px] text-zinc-400">Sin fotos cercanas.</p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-2">
                {data.candidates.map((c, i) => (
                  <button
                    key={`${c.sha256}-${i}`}
                    type="button"
                    onClick={() => setZoom(c.sha256)}
                    title={c.caption ?? c.sender_display_name ?? ""}
                    className="overflow-hidden rounded border border-zinc-200 text-left"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/whatsapp/media/${c.sha256}/thumb`} alt="" loading="lazy" className="h-16 w-16 object-cover" />
                    <div className="w-16 truncate px-1 py-0.5 text-[9px] text-zinc-500">
                      {dmy(c.event_date)} {c.event_time ?? c.shift_out ?? c.shift_in ?? ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Mensajes cercanos ({data.messages.length})</p>
            {data.messages.length === 0 ? (
              <p className="mt-1 text-[11px] text-zinc-400">Sin mensajes del remitente en ±1 día.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-xs text-zinc-600">
                {data.messages.map((m, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 text-zinc-400">{ddmm(m.date)} {m.at}</span>
                    <span className="truncate" title={m.body_text ?? ""}>{m.body_text || "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-zinc-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Colocar manualmente</p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <label className="text-xs text-zinc-500">
                Entrada
                <input type="time" value={entrada} onChange={(e) => setEntrada(e.target.value)} className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm" />
              </label>
              <label className="text-xs text-zinc-500">
                Salida
                <input type="time" value={salida} onChange={(e) => setSalida(e.target.value)} className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm" />
              </label>
              <label className="text-xs text-zinc-500">
                La salida es
                <select value={offsetDays} onChange={(e) => setOffsetDays(e.target.value)} className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-sm">
                  <option value="0">del mismo día</option>
                  <option value="1">del día siguiente (+1)</option>
                  <option value="2">+2 días</option>
                  <option value="3">+3 días</option>
                </select>
              </label>
              <SecondaryButton className="px-2 py-1 text-xs" onClick={() => { setEntrada(""); setSalida(""); }}>
                Limpiar
              </SecondaryButton>
              <button
                type="button"
                disabled={busy || (!entrada && !salida)}
                onClick={() => void save()}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
              >
                {busy ? "Guardando…" : "Guardar (manual)"}
              </button>
            </div>
            {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
          </div>
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={() => setZoom(null)}>
          <div className="absolute inset-0 bg-zinc-900/70" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/whatsapp/media/${zoom}`} alt="" className="relative max-h-[85vh] w-auto rounded" />
        </div>
      )}
    </Modal>
  );
}

/** Editar fecha/horas de un candidato ya registrado (corrección de errores). */
function EditRegisteredModal({
  candidate,
  techs,
  onClose,
  onSaved,
}: {
  candidate: Candidate;
  techs: Tech[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toInput = (t: string | null) => (t ? t.slice(0, 5) : "");
  const [techId, setTechId] = useState(candidate.technician_id ?? "");
  const [dateText, setDateText] = useState(() => isoToDmyInput(candidate.event_date ?? candidate.image_date));
  const [entrada, setEntrada] = useState(toInput(candidate.shift_in ?? (candidate.event_type === "entrada" ? candidate.event_time : null)));
  const [salida, setSalida] = useState(toInput(candidate.shift_out ?? (candidate.event_type === "salida" ? candidate.event_time : null)));
  const [offsetDays, setOffsetDays] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const iso = parseDmyInput(dateText);
    if (!iso) return setErr("Fecha inválida (dd/mm/aaaa)");
    if (!techId) return setErr("Selecciona el técnico");
    if (!entrada && !salida) return setErr("Indica al menos entrada o salida");
    setBusy(true);
    setErr(null);
    try {
      await fetchJson(`/api/attendance/candidates/${candidate.id}/schedule`, {
        method: "PATCH",
        body: JSON.stringify({ technician_id: techId, event_date: iso, shift_in: entrada || null, shift_out: salida || null, exit_offset_days: Number(offsetDays) || 0 }),
      });
      onSaved();
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <Modal open={true} onClose={onClose} title="Editar registro" mark="W83" wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Técnico">
            <Select value={techId} onChange={setTechId} placeholder="— elegir —" options={techs.map((t) => ({ value: t.id, label: t.display_name }))} />
          </Field>
          <Field label="Fecha (dd/mm/aaaa)">
            <TextInput value={dateText} onChange={setDateText} placeholder="dd/mm/aaaa" />
          </Field>
          <Field label="Entrada">
            <input type="time" value={entrada} onChange={(e) => setEntrada(e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
          </Field>
          <Field label="Salida">
            <input type="time" value={salida} onChange={(e) => setSalida(e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
          </Field>
          <Field label="La salida es">
            <Select value={offsetDays} onChange={setOffsetDays} options={[
              { value: "0", label: "del mismo día" },
              { value: "1", label: "del día siguiente (+1)" },
              { value: "2", label: "+2 días" },
              { value: "3", label: "+3 días" },
            ]} />
          </Field>
        </div>
        <p className="text-[11px] text-zinc-400">Al guardar, el día se recalcula y queda marcado como manual.</p>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={() => void save()} disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
