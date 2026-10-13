"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fetchJson, useResource } from "@/app/lib/client";
import { Badge, EmptyState, Modal, SecondaryButton, Select, Spinner, TextInput } from "@/app/components/ui";

interface Candidate {
  id: string;
  sha256: string;
  sender_id: string | null;
  sender_display_name: string | null;
  technician_id: string | null;
  technician_name: string | null;
  match_status: string;
  match_source: string | null;
  event_type: string | null;
  event_date: string | null;
  event_time: string | null;
  shift_in: string | null;
  shift_out: string | null;
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
};

const TABS = [
  { value: "pending", label: "Pendientes" },
  { value: "registered", label: "Registrados" },
  { value: "rejected", label: "Rechazados" },
  { value: "all", label: "Todos" },
];

export default function AttendancePhotosPage() {
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

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

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
                  <th className="px-3 py-2 text-left">Foto</th>
                  <th className="px-3 py-2 text-left">Remitente</th>
                  <th className="px-3 py-2 text-left">Técnico</th>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Hora / jornada</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Señales</th>
                  <th className="px-3 py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map((c) => (
                  <Row key={c.id} candidate={c} techs={techs.data?.technicians ?? []} onDone={reload} onZoom={setZoom} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {zoom && (
        <Modal open={true} onClose={() => setZoom(null)} title={zoom.sender_display_name || "Foto"} wide>
          <div className="flex justify-center rounded-md bg-zinc-900 p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/whatsapp/media/${zoom.sha256}`} alt="" className="max-h-[70vh] w-auto" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <div><p className="text-[11px] uppercase text-zinc-400">Fecha</p><p className="text-zinc-700">{zoom.event_date ?? "—"}</p></div>
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
}: {
  candidate: Candidate;
  techs: Tech[];
  onDone: () => void;
  onZoom: (c: Candidate) => void;
}) {
  const [techId, setTechId] = useState(candidate.technician_id ?? "");
  const [type, setType] = useState(candidate.event_type ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const done = candidate.status !== "pending";

  async function act(action: "approve" | "reject") {
    setBusy(true);
    setErr(null);
    try {
      await fetchJson(`/api/attendance/candidates/${candidate.id}`, {
        method: "POST",
        body: JSON.stringify({
          action,
          ...(action === "approve" ? { technician_id: techId || undefined, event_type: type || undefined } : {}),
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
    <tr className="align-top hover:bg-zinc-50">
      <td className="px-3 py-2">
        <button type="button" onClick={() => onZoom(candidate)} title="Ver foto" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/whatsapp/media/${candidate.sha256}/thumb`} alt="" loading="lazy" className="h-14 w-14 rounded object-cover" />
        </button>
      </td>
      <td className="px-3 py-2">
        <div className="text-xs font-medium text-zinc-700">{candidate.sender_display_name || candidate.sender_id || "—"}</div>
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
        {techId && (
          <Link href={`/admin/tecnicos/${techId}/horas`} className="mt-1 block text-[11px] text-sky-700 hover:underline">
            Ver horas →
          </Link>
        )}
      </td>
      <td className="px-3 py-2 text-zinc-600">{candidate.event_date ?? "—"}</td>
      <td className="px-3 py-2 text-zinc-600">
        {timeCell}
        {candidate.worked_hours != null && <div className="text-[11px] text-zinc-400">{candidate.worked_hours} h</div>}
      </td>
      <td className="px-3 py-2">
        {done ? (
          <span className="text-zinc-600">{candidate.event_type ?? "—"}</span>
        ) : (
          <Select
            value={type}
            onChange={setType}
            placeholder="—"
            options={[
              { value: "entrada", label: "Entrada" },
              { value: "salida", label: "Salida" },
            ]}
            className="min-w-28"
          />
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
          <span className="text-xs text-zinc-400">{candidate.status}</span>
        ) : (
          <div className="flex justify-end gap-2">
            <SecondaryButton className="px-2 py-1 text-xs" disabled={busy} onClick={() => void act("reject")}>
              Rechazar
            </SecondaryButton>
            <button
              type="button"
              disabled={busy || !techId}
              onClick={() => void act("approve")}
              className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
            >
              Registrar
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
