"use client";

import { useMemo, useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import {
  Badge,
  EmptyState,
  Field,
  PrimaryButton,
  SecondaryButton,
  Select,
  Spinner,
  TextInput,
  Textarea,
} from "@/app/components/ui";
import type {
  OvertimeDay,
  OvertimeReportResponse,
  OvertimeTechnician,
  TechniciansResponse,
  TechnicianAliasesResponse,
} from "@/app/lib/types";

interface ImportResult {
  total: number;
  matched: number;
  skipped: number;
  unmatched: { person_name: string; date: string; status: string; candidates: string[] }[];
  period: { start: string; end: string };
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function quincenaRange(year: number, month: number, q: 1 | 2) {
  const mm = pad(month);
  if (q === 1) return { from: `${year}-${mm}-01`, to: `${year}-${mm}-15` };
  const last = new Date(year, month, 0).getDate();
  return { from: `${year}-${mm}-16`, to: `${year}-${mm}-${pad(last)}` };
}

export default function HorasExtraPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [quincena, setQuincena] = useState<1 | 2>(today.getDate() <= 15 ? 1 : 2);
  const [version, setVersion] = useState(0);

  const { from, to } = useMemo(() => quincenaRange(year, month, quincena), [year, month, quincena]);
  const report = useResource<OvertimeReportResponse>(
    `/api/reports/overtime?from=${from}&to=${to}&v=${version}`
  );

  const bump = () => {
    setVersion((v) => v + 1);
    report.reload();
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-900">Horas extra y conciliación</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Importa la asistencia (entrada/salida) y reparte las horas extra entre los proyectos
        trabajados cada día.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="w-28">
          <Field label="Año">
            <TextInput value={String(year)} onChange={(v) => setYear(Number(v) || year)} type="number" />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Mes">
            <Select
              value={String(month)}
              onChange={(v) => setMonth(Number(v))}
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Quincena">
            <Select
              value={String(quincena)}
              onChange={(v) => setQuincena(Number(v) as 1 | 2)}
              options={[
                { value: "1", label: "1 al 15" },
                { value: "2", label: "16 al fin de mes" },
              ]}
            />
          </Field>
        </div>
        <div className="text-sm text-zinc-500">
          Periodo: <span className="font-medium text-zinc-700">{from}</span> a{" "}
          <span className="font-medium text-zinc-700">{to}</span>
        </div>
      </div>

      <ImportPanel onImported={bump} />

      {report.error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {report.error}
        </div>
      )}

      <div className="mt-6">
        {!report.data ? (
          <Spinner />
        ) : report.data.technicians.length === 0 ? (
          <EmptyState title="Sin asistencia en este periodo" />
        ) : (
          <>
            <h2 className="mb-2 text-sm font-semibold text-zinc-700">
              Conciliación por técnico ({report.data.settings.daily_hours} h/día ·{" "}
              {report.data.settings.weekly_hours} h/semana)
            </h2>
            <div className="space-y-3">
              {report.data.technicians.map((t) => (
                <TechnicianCard key={t.id} tech={t} onSaved={bump} />
              ))}
            </div>

            <h2 className="mb-2 mt-6 text-sm font-semibold text-zinc-700">Horas extra por proyecto</h2>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
              {report.data.projects.length === 0 ? (
                <EmptyState title="Sin horas extra asignadas a proyectos" />
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Proyecto</th>
                      <th className="px-4 py-3 text-right">Horas planeadas</th>
                      <th className="px-4 py-3 text-right">Horas extra asignadas</th>
                      <th className="px-4 py-3 text-right">Jornadas-persona</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {report.data.projects.map((p) => (
                      <tr key={p.project_id} className="hover:bg-zinc-50">
                        <td className="px-4 py-3 font-medium text-zinc-800">
                          <span className="text-zinc-400">{p.code}</span> {p.name}
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-600">{p.planned_hours}</td>
                        <td className="px-4 py-3 text-right text-zinc-700">{p.allocated_overtime}</td>
                        <td className="px-4 py-3 text-right text-zinc-600">{p.person_days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ImportPanel({ onImported }: { onImported: () => void }) {
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const technicians = useResource<TechniciansResponse>("/api/technicians");
  const aliases = useResource<TechnicianAliasesResponse>("/api/technician-aliases");

  const readFile = async (file: File) => {
    setFilename(file.name);
    const text = await file.text();
    setCsv(text);
  };

  const doImport = async () => {
    if (!csv.trim()) {
      setErr("Pega o carga un archivo con columnas persona, fecha, entrada y salida");
      return;
    }
    setImporting(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetchJson<ImportResult>("/api/attendance", {
        method: "POST",
        body: JSON.stringify({ filename, csv }),
      });
      setResult(res);
      onImported();
      aliases.reload();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setImporting(false);
    }
  };

  const assignAlias = async (personName: string, technicianId: string) => {
    if (!technicianId) return;
    try {
      await fetchJson("/api/technician-aliases", {
        method: "POST",
        body: JSON.stringify({ alias: personName, technician_id: technicianId }),
      });
      aliases.reload();
    } catch (e) {
      window.alert(String(e));
    }
  };

  const removeAlias = async (id: string) => {
    await fetchJson(`/api/technician-aliases/${id}`, { method: "DELETE" });
    aliases.reload();
  };

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold text-zinc-700">Importar asistencia (CSV)</span>
        <span className="text-xs text-zinc-500">{open ? "Ocultar" : "Mostrar"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-zinc-500">
            Columnas esperadas: nombre, fecha, hora de entrada, hora de salida. Se aceptan CSV/TSV
            con o sin encabezado. (El lector de Excel se conectará después; por ahora exporta a CSV.)
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
              }}
              className="text-sm"
            />
            {filename && <Badge className="bg-zinc-100 text-zinc-600">{filename}</Badge>}
          </div>
          <Textarea value={csv} onChange={setCsv} rows={6} placeholder={"Ana López,01/09/2026,08:00,18:30\nLuis Pérez,01/09/2026,09:00,19:00"} />
          <div className="flex items-center gap-3">
            <PrimaryButton onClick={doImport} disabled={importing}>
              {importing ? "Importando…" : "Importar"}
            </PrimaryButton>
            {err && <span className="text-xs text-red-600">{err}</span>}
          </div>

          {result && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
              <p className="text-zinc-700">
                {result.total} renglones · {result.matched} emparejados ·{" "}
                {result.unmatched.length} sin emparejar
                {result.skipped > 0 && ` · ${result.skipped} omitidos`}
              </p>
              {result.unmatched.length > 0 && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs font-medium text-amber-700">
                    Nombres por resolver (asigna una equivalencia y vuelve a importar):
                  </p>
                  {result.unmatched.map((u, i) => (
                    <div key={`${u.person_name}-${i}`} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="min-w-40 font-medium text-zinc-700">{u.person_name}</span>
                      {u.status === "ambiguous" && (
                        <span className="text-amber-600">ambiguo: {u.candidates.join(", ")}</span>
                      )}
                      <select
                        defaultValue=""
                        onChange={(e) => assignAlias(u.person_name, e.target.value)}
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
                      >
                        <option value="">Asignar a…</option>
                        {(technicians.data?.technicians ?? []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.display_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(aliases.data?.aliases.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-600">Equivalencias registradas</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {aliases.data!.aliases.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700"
                  >
                    {a.alias} → {a.display_name}
                    <button
                      type="button"
                      onClick={() => removeAlias(a.id)}
                      className="text-zinc-400 hover:text-red-600"
                      aria-label={`Quitar ${a.alias}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TechnicianCard({ tech, onSaved }: { tech: OvertimeTechnician; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="font-medium text-zinc-800">{tech.display_name}</span>
        <span className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
          <span>Jornadas: <b className="text-zinc-800">{tech.person_days}</b></span>
          <span>Horas: <b className="text-zinc-800">{tech.total_hours}</b></span>
          <span>
            Extra: <b className="text-amber-700">{tech.total_overtime}</b>
          </span>
          <span>
            Asignado: <b className="text-emerald-700">{tech.total_allocated}</b>
          </span>
          {tech.total_unallocated > 0 && (
            <Badge className="bg-amber-100 text-amber-700">
              sin asignar {tech.total_unallocated} h
            </Badge>
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-zinc-100 px-4 py-3">
          {tech.days.map((d) => (
            <DayRow key={d.date} techId={tech.id} day={d} onSaved={onSaved} />
          ))}
        </div>
      )}
    </div>
  );
}

function DayRow({ techId, day, onSaved }: { techId: string; day: OvertimeDay; onSaved: () => void }) {
  const [percents, setPercents] = useState<Record<string, string>>(() =>
    Object.fromEntries(day.activities.map((a) => [a.activity_id, String(a.percent)]))
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await fetchJson("/api/overtime-allocations", {
        method: "PATCH",
        body: JSON.stringify({
          technician_id: techId,
          date: day.date,
          allocations: day.activities.map((a) => ({
            activity_id: a.activity_id,
            percent: Number(percents[a.activity_id] ?? 0) || 0,
          })),
        }),
      });
      onSaved();
    } catch (e) {
      window.alert(String(e));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await fetchJson("/api/overtime-allocations", {
        method: "PATCH",
        body: JSON.stringify({ technician_id: techId, date: day.date, reset: true }),
      });
      onSaved();
    } catch (e) {
      window.alert(String(e));
    } finally {
      setSaving(false);
    }
  };

  const sum = day.activities.reduce((acc, a) => acc + (Number(percents[a.activity_id]) || 0), 0);

  return (
    <div className="border-t border-zinc-100 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium text-zinc-700">{day.date}</span>
        <span className="text-zinc-500">
          {day.check_in ?? "—"}–{day.check_out ?? "—"} ({day.hours} h)
        </span>
        {day.overtime > 0 ? (
          <Badge className="bg-amber-100 text-amber-700">{day.overtime} h extra</Badge>
        ) : (
          <span className="text-xs text-zinc-400">sin extra</span>
        )}
        {day.unallocated_hours > 0 && (
          <span className="text-xs text-amber-600">sin asignar {day.unallocated_hours} h</span>
        )}
      </div>

      {day.activities.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-400">Sin actividades capturadas ese día.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {day.activities.map((a) => (
            <div key={a.activity_id} className="flex flex-wrap items-center gap-3 text-xs">
              <span className="min-w-52 text-zinc-700">
                {a.description ?? "Actividad"}
                {a.projects.length > 0 && (
                  <span className="text-zinc-400">
                    {" "}
                    · {a.projects.map((p) => p.code || p.name).join(", ")}
                  </span>
                )}
                <span className="text-zinc-400"> · planeadas {a.planned_hours} h</span>
              </span>
              {day.overtime > 0 && (
                <>
                  <label className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={percents[a.activity_id] ?? "0"}
                      onChange={(e) =>
                        setPercents((prev) => ({ ...prev, [a.activity_id]: e.target.value }))
                      }
                      className="w-16 rounded-md border border-zinc-300 px-2 py-0.5 text-right"
                    />
                    <span className="text-zinc-500">%</span>
                  </label>
                  <span className="text-zinc-600">
                    ={" "}
                    {Math.round(((day.overtime * (Number(percents[a.activity_id]) || 0)) / 100) * 100) /
                      100}{" "}
                    h
                  </span>
                </>
              )}
            </div>
          ))}
          {day.overtime > 0 && (
            <div className="flex items-center gap-3 pt-1">
              <span className="text-xs text-zinc-500">
                Total asignado: {sum}%{sum !== 100 && " (el resto queda como no asignado)"}
              </span>
              <SecondaryButton onClick={reset} className="px-2 py-1 text-xs" disabled={saving}>
                Restablecer
              </SecondaryButton>
              <PrimaryButton onClick={save} className="px-2 py-1 text-xs" disabled={saving}>
                {saving ? "Guardando…" : "Guardar reparto"}
              </PrimaryButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
