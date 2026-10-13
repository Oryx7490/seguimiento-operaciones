"use client";

import Link from "next/link";
import { useResource, fetchJson } from "@/app/lib/client";
import { Badge, Spinner, EmptyState, SecondaryButton, Modal, PrimaryButton, Field, TextInput } from "@/app/components/ui";
import { useMemo, useState } from "react";

interface Screen {
  id: string;
  project_id: string;
  project_code: string;
  project_name: string;
  screen_type: string;
  quantity: number;
  width_m: number | null;
  height_m: number | null;
  is_irregular: boolean;
  area_m2: number | null;
  pitch_mm: number | null;
  environment: string | null;
  voltage: string | null;
  installed: boolean;
  cancelled: boolean;
  notes: string | null;
  install_sort: number | null;
  assembly_status: string | null;
}

type AssemblyStatus = "to_assemble" | "ready" | null;

const STATUS_OPTIONS: { value: AssemblyStatus; dot: string; title: string }[] = [
  { value: null, dot: "bg-white border border-zinc-300", title: "Sin marca (blanco)" },
  { value: "to_assemble", dot: "bg-amber-400", title: "Por armar (amarillo)" },
  { value: "ready", dot: "bg-emerald-500", title: "Lista para instalar (verde)" },
];

function rowTint(status: string | null): string {
  if (status === "to_assemble") return "bg-amber-50 hover:bg-amber-100";
  if (status === "ready") return "bg-emerald-50 hover:bg-emerald-100";
  return "hover:bg-zinc-50";
}

export default function PendingInstallationsPage() {
  const { data, error, reload } = useResource<{ screens: Screen[] }>("/api/pending-installations");
  const screens = (data?.screens || []) as Screen[];
  const loading = !data && !error;
  const [sel, setSel] = useState<{ id: string; projId?: string } | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const searchActive = q.trim().length > 0;

  function m2(s: Screen) {
    if (s.is_irregular) return Number(s.area_m2 || 0);
    return Number(s.width_m || 0) * Number(s.height_m || 0);
  }

  const filtered = useMemo(() => {
    const norm = (v: unknown) =>
      String(v ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return screens;
    return screens.filter((s) => {
      const hay = norm([
        s.project_code,
        s.project_name,
        s.screen_type,
        s.environment,
        s.voltage,
        s.pitch_mm,
        s.width_m,
        s.height_m,
        s.area_m2,
        s.notes,
      ].join(" "));
      return tokens.every((t) => hay.includes(t));
    });
  }, [screens, q]);

  async function move(id: string, dir: -1 | 1) {
    if (saving || searchActive) return;
    const ids = screens.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(i, 1);
    next.splice(j, 0, moved);
    setSaving(true);
    try {
      await fetchJson("/api/pending-installations", {
        method: "PATCH",
        body: JSON.stringify({ order: next }),
      });
      reload();
    } catch (e) {
      window.alert(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function setAssembly(id: string, value: AssemblyStatus) {
    if (saving) return;
    setSaving(true);
    try {
      await fetchJson("/api/pending-installations", {
        method: "PATCH",
        body: JSON.stringify({ states: [{ id, assembly_status: value }] }),
      });
      reload();
    } catch (e) {
      window.alert(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function doInstall() {
    if (!sel) return;
    try {
      await fetchJson(`/api/projects/${sel.projId}`, {
        method: "PATCH",
        body: JSON.stringify({ screens: [{ id: sel.id, installed: true, screen_installed_at: new Date(date + "T12:00:00-06:00").toISOString() }] }),
      });
      setSel(null);
      reload();
    } catch (e) {
      window.alert(String(e));
    }
  }

  const totalM2 = screens.reduce((sum, s) => sum + m2(s) * Number(s.quantity || 0), 0);
  const totalQty = screens.reduce((sum, s) => sum + Number(s.quantity || 0), 0);

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Pantallas por instalarse</h1>
          <p className="mt-1 text-sm text-zinc-500">Compilado de todas las pantallas pendientes de instalación (sin importar proyecto).</p>
        </div>
        <div className="text-sm text-zinc-600">
          <span className="font-semibold">{totalQty}</span> pantallas · <span className="font-semibold">{totalM2.toLocaleString("es-MX", { maximumFractionDigits: 2 })}</span> m²
        </div>
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <TextInput
          value={q}
          onChange={setQ}
          placeholder="Buscar pantalla por proyecto, tipo, ambiente, tensión, pitch…"
          className="w-full max-w-md"
        />
        {(searchActive || screens.length !== filtered.length) && (
          <span className="text-sm text-zinc-500">
            {filtered.length} de {screens.length} pantallas
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border border-zinc-300 bg-white" /> Sin marca</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-amber-400" /> Por armar</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-emerald-500" /> Lista para instalar</span>
        </div>
      </div>

      {searchActive && (
        <p className="mt-2 text-xs text-zinc-400">Limpia la búsqueda para reorganizar los renglones.</p>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-4"><Spinner /></div>
        ) : screens.length === 0 ? (
          <div className="p-4"><EmptyState title="No hay pantallas por instalarse" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-4"><EmptyState title="Ninguna pantalla coincide con la búsqueda" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="w-12 px-2 py-2 text-center">Orden</th>
                  <th className="px-3 py-2 text-left">Proyecto</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-center">Cant</th>
                  <th className="px-3 py-2 text-left">Dimensiones</th>
                  <th className="px-3 py-2 text-right">m²</th>
                  <th className="px-3 py-2 text-left">Ambiente</th>
                  <th className="px-3 py-2 text-left">Tensión</th>
                  <th className="px-3 py-2 text-left">Pitch</th>
                  <th className="px-3 py-2 text-center">Estado</th>
                  <th className="px-3 py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map((s, idx) => (
                  <tr key={s.id} className={rowTint(s.assembly_status)}>
                    <td className="px-2 py-2 text-center">
                      <span className="inline-flex flex-col items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => move(s.id, -1)}
                          disabled={idx === 0 || saving || searchActive}
                          aria-label={`Subir ${s.screen_type}`}
                          title="Subir"
                          className="rounded px-1 text-[10px] leading-3 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-30"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => move(s.id, 1)}
                          disabled={idx === filtered.length - 1 || saving || searchActive}
                          aria-label={`Bajar ${s.screen_type}`}
                          title="Bajar"
                          className="rounded px-1 text-[10px] leading-3 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-30"
                        >
                          ▼
                        </button>
                      </span>
                    </td>
                    <td className="px-3 py-2"><Link href={`/proyectos/${s.project_id}`} className="text-sky-700 hover:underline">{s.project_code} · {s.project_name}</Link></td>
                    <td className="px-3 py-2"><div className="font-medium text-zinc-800">{s.screen_type}</div></td>
                    <td className="px-3 py-2 text-center text-zinc-700">{s.quantity}</td>
                    <td className="px-3 py-2 text-zinc-600">{s.is_irregular ? (s.area_m2 ? `${s.area_m2} m²` : "Irregular") : s.width_m && s.height_m ? `${s.width_m} × ${s.height_m} m` : "—"}</td>
                    <td className="px-3 py-2 text-right font-medium text-zinc-800">{(m2(s) * Number(s.quantity || 0)).toLocaleString("es-MX", { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-zinc-600">{s.environment || "—"}</td>
                    <td className="px-3 py-2 text-zinc-600">{s.voltage || "—"}</td>
                    <td className="px-3 py-2 text-zinc-600">{s.pitch_mm ? `${s.pitch_mm} mm` : "—"}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center justify-center gap-1.5">
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={String(opt.value)}
                            type="button"
                            disabled={saving}
                            onClick={() => setAssembly(s.id, opt.value)}
                            title={opt.title}
                            aria-label={opt.title}
                            aria-pressed={s.assembly_status === opt.value}
                            className={`h-4 w-4 rounded-full ${opt.dot} ${
                              s.assembly_status === opt.value ? "ring-2 ring-zinc-900 ring-offset-1" : "hover:ring-2 hover:ring-zinc-300"
                            } disabled:opacity-50`}
                          />
                        ))}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <SecondaryButton className="px-2 py-1 text-xs" onClick={() => setSel({ id: s.id, projId: s.project_id })}>Marcar instalada</SecondaryButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {sel && (
        <Modal open={true} onClose={() => setSel(null)} title="Fecha de instalación">
          <div className="space-y-3">
            <Field label="Fecha">
              <input type="date" className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <SecondaryButton onClick={() => setSel(null)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={doInstall}>Confirmar</PrimaryButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
