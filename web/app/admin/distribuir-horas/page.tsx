"use client";

import { useMemo, useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { EmptyState, Field, PrimaryButton, Select, Spinner } from "@/app/components/ui";

interface Tech {
  id: string;
  display_name: string;
}

interface DayActivity {
  activity_id: string;
  description: string;
  status: string;
  kind: string;
  client_name: string | null;
  ticket_code: string | null;
  ticket_title: string | null;
  projects_label: string | null;
  policy_name: string | null;
  hours: number;
}

interface DayAlloc {
  technician: { id: string; display_name: string };
  date: string;
  worked_hours: number;
  shift_complete: boolean;
  check_in: string | null;
  check_out: string | null;
  activities: DayActivity[];
  allocated_hours: number;
}

interface Effort {
  scale: string;
  period: { from: string; to: string; label: string };
  total_hours: number;
  allocations: number;
  by_project: { project_id: string; code: string; name: string; client_name: string | null; hours: number; percent: number }[];
  by_ticket: { ticket_id: string; code: string; title: string; client_name: string | null; hours: number; percent: number }[];
  by_client: { client_id: string; name: string; hours: number; percent: number }[];
  by_policy: { policy_id: string; name: string; policy_type: string; client_name: string | null; hours: number; percent: number }[];
}

const KIND_LABEL: Record<string, string> = { project: "Proyecto", ticket: "Ticket", policy: "Póliza", internal: "Interna" };

function cdmxToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function fmtH(n: number): string {
  return `${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 2 })} h`;
}

export default function DistribuirHorasPage() {
  const [tab, setTab] = useState<"asignar" | "reporte">("asignar");
  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Distribuir horas</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Distribuye las horas reales de jornadas completas entre las actividades trabajadas; la suma debe coincidir con la asistencia.
          </p>
        </div>
        <div className="flex gap-1">
          {([["asignar", "Asignar"], ["reporte", "Horas hombre"]] as const).map(([v, label]) => (
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
      </div>

      {tab === "asignar" ? <AssignTab /> : <ReportTab />}
    </div>
  );
}

function AssignTab() {
  const techs = useResource<{ technicians: Tech[] }>("/api/technicians");
  const [techId, setTechId] = useState("");
  const [date, setDate] = useState(() => cdmxToday());

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Técnico">
          <Select
            value={techId}
            onChange={setTechId}
            placeholder="— elegir —"
            options={(techs.data?.technicians ?? []).map((t) => ({ value: t.id, label: t.display_name }))}
            className="min-w-52"
          />
        </Field>
        <Field label="Fecha">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        </Field>
      </div>

      {!techId ? (
        <p className="mt-6 text-sm text-zinc-400">Elige un técnico y una fecha para distribuir su jornada.</p>
      ) : (
        <AssignDay key={`${techId}-${date}`} techId={techId} date={date} />
      )}
    </div>
  );
}

function AssignDay({ techId, date }: { techId: string; date: string }) {
  const [nonce, setNonce] = useState(0);
  const { data, error } = useResource<DayAlloc>(`/api/attendance/allocations?technician_id=${techId}&date=${date}&_=${nonce}`);
  const [hours, setHours] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const worked = data?.worked_hours ?? 0;
  const totalCents = useMemo(() => Object.values(hours).reduce((s, v) => s + (Math.round((Number(v) || 0) * 100) || 0), 0), [hours]);
  const workedCents = Math.round(worked * 100);

  async function save() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const items = (data?.activities ?? []).map((a) => ({ activity_id: a.activity_id, hours: Number(hours[a.activity_id]) || 0 }));
      const r = await fetchJson<{ total_hours: number }>("/api/attendance/allocations", {
        method: "PUT",
        body: JSON.stringify({ technician_id: techId, date, items }),
      });
      setMsg(`Guardado: ${fmtH(r.total_hours)} distribuidas.`);
      setHours({});
      setNonce((n) => n + 1);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>;
  if (!data) return <Spinner />;
  if (!data.shift_complete) return <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Jornada incompleta.</strong> Registra entrada y salida en Asistencia por fotos antes de distribuir horas. {data.check_in && <span>Entrada {data.check_in}; falta la salida.</span>}{!data.check_in && data.check_out && <span>Salida {data.check_out}; falta la entrada.</span>}</div>;
  if (data.activities.length === 0) return <div className="mt-6"><EmptyState title="El técnico no tiene actividades ese día" /></div>;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-600">
        <span>
          Jornada: <strong>{fmtH(worked)}</strong>
          {data.check_in && <span className="text-zinc-400"> ({data.check_in}–{data.check_out ?? "?"})</span>}
        </span>
      </div>

      {err && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {msg && <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}

      <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2 text-left">Actividad</th>
              <th className="px-4 py-2 text-left">Destino</th>
              <th className="px-4 py-2 text-right">Horas asignadas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {data.activities.map((a) => {
              const dest =
                a.kind === "ticket"
                  ? `${a.ticket_code ?? "Ticket"} · ${a.ticket_title ?? ""}`
                  : a.kind === "project"
                    ? a.projects_label ?? "Proyecto"
                    : a.kind === "policy"
                      ? a.policy_name ?? "Póliza"
                      : "Interna";
              return (
                <tr key={a.activity_id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2">
                    <p className="font-medium text-zinc-800">{a.description}</p>
                    <p className="text-[11px] text-zinc-400">{KIND_LABEL[a.kind] ?? a.kind} · {a.status}</p>
                  </td>
                  <td className="px-4 py-2 text-zinc-600">
                    {dest}
                    {a.client_name && <span className="block text-[11px] text-zinc-400">{a.client_name}</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      max={worked}
                      step="0.01"
                      value={hours[a.activity_id] ?? (a.hours > 0 ? String(a.hours) : "")}
                      onChange={(e) => setHours((s) => ({ ...s, [a.activity_id]: e.target.value }))}
                      className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-right text-sm"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-zinc-50 text-sm">
            <tr>
              <td className="px-4 py-2 font-medium text-zinc-600" colSpan={2}>Total de jornada · {fmtH(worked)}</td>
              <td className="px-4 py-2 text-right font-semibold text-zinc-800">{fmtH(totalCents / 100)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <PrimaryButton onClick={() => void save()} disabled={busy || totalCents !== workedCents}>
          {busy ? "Guardando…" : "Guardar distribución"}
        </PrimaryButton>
        {totalCents !== workedCents && <span className="text-xs text-amber-700">{totalCents < workedCents ? `Faltan ${fmtH((workedCents - totalCents) / 100)} por asignar.` : `Excedes la jornada por ${fmtH((totalCents - workedCents) / 100)}.`}</span>}
      </div>
    </>
  );
}

function ReportTab() {
  const [scale, setScale] = useState("month");
  const [date, setDate] = useState(() => cdmxToday());
  const [view, setView] = useState<"project" | "ticket" | "policy" | "client">("project");
  const { data, error } = useResource<Effort>(`/api/attendance/allocations/effort?scale=${scale}&date=${date}`);
  const loading = !data && !error;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1">
          {([["week", "Semana"], ["month", "Mes"], ["year", "Año"]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setScale(v)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${scale === v ? "bg-zinc-900 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Field label="Referencia">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
        </Field>
        {data && (
          <span className="pb-1.5 text-sm text-zinc-600">
            {data.period.label} · <strong>{fmtH(data.total_hours)}</strong> en {data.allocations} asignaciones
          </span>
        )}
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading ? (
        <Spinner />
      ) : !data || data.total_hours === 0 ? (
        <div className="mt-6"><EmptyState title="Sin horas distribuidas en este periodo" /></div>
      ) : (
        <>
          <div className="mt-4 flex gap-1">
            {([["project", `Por proyecto (${data.by_project.length})`], ["ticket", `Por ticket (${data.by_ticket.length})`], ["policy", `Por póliza (${data.by_policy.length})`], ["client", `Por cliente (${data.by_client.length})`]] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${view === v ? "bg-zinc-900 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2 text-left">{view === "project" ? "Proyecto" : view === "ticket" ? "Ticket" : view === "policy" ? "Póliza" : "Cliente"}</th>
                  <th className="px-4 py-2 text-left">Cliente</th>
                  <th className="px-4 py-2 text-right">Horas hombre</th>
                  <th className="px-4 py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {view === "project" &&
                  data.by_project.map((r) => (
                    <tr key={r.project_id} className="hover:bg-zinc-50">
                      <td className="px-4 py-2 font-medium text-zinc-800">{r.code} · {r.name}</td>
                      <td className="px-4 py-2 text-zinc-500">{r.client_name ?? "—"}</td>
                      <td className="px-4 py-2 text-right text-zinc-700">{fmtH(r.hours)}</td>
                      <td className="px-4 py-2 text-right text-zinc-500">{r.percent}%</td>
                    </tr>
                  ))}
                {view === "ticket" &&
                  data.by_ticket.map((r) => (
                    <tr key={r.ticket_id} className="hover:bg-zinc-50">
                      <td className="px-4 py-2 font-medium text-zinc-800">{r.code} · {r.title}</td>
                      <td className="px-4 py-2 text-zinc-500">{r.client_name ?? "—"}</td>
                      <td className="px-4 py-2 text-right text-zinc-700">{fmtH(r.hours)}</td>
                      <td className="px-4 py-2 text-right text-zinc-500">{r.percent}%</td>
                    </tr>
                  ))}
                {view === "client" &&
                  data.by_client.map((r) => (
                    <tr key={r.client_id} className="hover:bg-zinc-50">
                      <td className="px-4 py-2 font-medium text-zinc-800">{r.name}</td>
                      <td className="px-4 py-2 text-zinc-500">—</td>
                      <td className="px-4 py-2 text-right text-zinc-700">{fmtH(r.hours)}</td>
                      <td className="px-4 py-2 text-right text-zinc-500">{r.percent}%</td>
                    </tr>
                  ))}
                {view === "policy" &&
                  data.by_policy.map((r) => (
                    <tr key={r.policy_id} className="hover:bg-zinc-50">
                      <td className="px-4 py-2 font-medium text-zinc-800">{r.name}</td>
                      <td className="px-4 py-2 text-zinc-500">{r.client_name ?? "—"}</td>
                      <td className="px-4 py-2 text-right text-zinc-700">{fmtH(r.hours)}</td>
                      <td className="px-4 py-2 text-right text-zinc-500">{r.percent}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
