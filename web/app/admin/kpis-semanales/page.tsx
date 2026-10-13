"use client";

import { useState } from "react";
import { useResource, fetchJson } from "@/app/lib/client";
import { Badge, PrimaryButton, SecondaryButton, Spinner, EmptyState } from "@/app/components/ui";
import { formatDate, formatDateTime } from "@/app/lib/format";

interface Period {
  id: string;
  year: number;
  week_number: number;
  week_ending: string;
  starts_at: string;
  ends_at: string;
  status: "open" | "closed";
  closed_at: string | null;
  closed_by_name: string | null;
}

interface MetricsResp {
  period: Period & { snapshot: Array<{ key: string; value: string; unit: string | null }> };
  metrics: Array<{ key: string; value: string | number; unit?: string }>;
}

export default function KpisSemanalesPage() {
  const { data, error, reload } = useResource<{ periods: Period[] }>("/api/admin/kpis-semanales/periods");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsResp | null>(null);
  const [weeksInput, setWeeksInput] = useState("");
  const [screens, setScreens] = useState<any[]>([]);
  const [screensLoading, setScreensLoading] = useState(false);
  const [screenDateSavingId, setScreenDateSavingId] = useState<string | null>(null);
  const [screenDateFeedback, setScreenDateFeedback] = useState<string | null>(null);

  async function createPeriod() {
    setLoadingId("new");
    try {
      await fetchJson("/api/admin/kpis-semanales/periods", { method: "POST", body: JSON.stringify({}) });
      await reload();
    } catch (e) {
      window.alert(String(e));
    } finally {
      setLoadingId(null);
    }
  }

  async function closePeriod(id: string) {
    if (!confirm("¿Cerrar este periodo semanal? Se guardará snapshot de KPIs.")) return;
    setLoadingId(id);
    try {
      await fetchJson(`/api/admin/kpis-semanales/periods/${id}/close`, { method: "POST" });
      await reload();
      if (viewId === id) await viewMetrics(id);
    } catch (e) {
      window.alert(String(e));
    } finally {
      setLoadingId(null);
    }
  }

  async function viewMetrics(id: string) {
    setViewId(id);
    setMetrics(null);
    setScreens([]);
    setScreenDateFeedback(null);
    try {
      const res = await fetchJson<MetricsResp>(`/api/admin/kpis-semanales/periods/${id}/metrics`);
      setMetrics(res);
    } catch (e) {
      window.alert(String(e));
    }
  }

  async function saveScreenInstallationDate(screen: any) {
    if (!viewId || !screen.installation_date) return;
    setScreenDateSavingId(screen.id);
    setScreenDateFeedback(null);
    try {
      await fetchJson(`/api/admin/kpis-semanales/periods/${viewId}/screens`, {
        method: "PATCH",
        body: JSON.stringify({ screen_id: screen.id, installation_date: screen.installation_date }),
      });
      const [screenResp, metricsResp] = await Promise.all([
        fetchJson<{ screens: any[] }>(`/api/admin/kpis-semanales/periods/${viewId}/screens`),
        fetchJson<MetricsResp>(`/api/admin/kpis-semanales/periods/${viewId}/metrics`),
      ]);
      setScreens((screenResp.screens || []).map((item) => ({ ...item, saved_installation_date: item.installation_date })));
      setMetrics(metricsResp);
      setScreenDateFeedback("Fecha guardada y KPIs actualizadas.");
    } catch (e) {
      window.alert(String(e));
    } finally {
      setScreenDateSavingId(null);
    }
  }

  const periods = data?.periods ?? [];
  const loading = !data && !error;

  const m = metrics?.metrics || [];
  const m2 = m.find((x) => x.key === "m2_installed")?.value || 0;
  const mp = m.find((x) => x.key === "mp_installed")?.value || 0;
  const screensCount = m.find((x) => x.key === "screens_installed_count")?.value || 0;
  const projects = m.find((x) => x.key === "projects_with_installed_screens")?.value || 0;
  const ticketsClosed = m.find((x) => x.key === "tickets_closed_week")?.value || 0;
  const hours = m.find((x) => x.key === "hours_registered_week")?.value || 0;
  const ctlCount = m.find((x) => x.key === "controllers_installed_week")?.value || 0;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">KPIs semanales</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Cierre semanal (domingo). Las pantallas se asignan por su fecha de instalación; excluye canceladas.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
            placeholder="Semanas ej. 39,40"
            value={weeksInput}
            onChange={(e) => setWeeksInput(e.target.value)}
          />
          <PrimaryButton
            onClick={async () => {
              try {
                setLoadingId('gen');
                const w = weeksInput.split(/[^0-9]+/).filter(Boolean).map((x: string)=>parseInt(x));
                if(w.length===0) return;
                await fetchJson('/api/admin/kpis-semanales/periods/generate', { method:'POST', body: JSON.stringify({ weeks: w }) });
                await reload();
              } catch(e){ window.alert(String(e)); } finally { setLoadingId(null); }
            }}
            disabled={loadingId==='gen'}
          >
            {loadingId==='gen' ? 'Generando…' : 'Generar semanas'}
          </PrimaryButton>
          <PrimaryButton onClick={createPeriod} disabled={loadingId === "new"}>
            {loadingId === "new" ? "Creando…" : "Periodo actual"}
          </PrimaryButton>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-800">Periodos</h2>
          </div>
          {loading ? (
            <div className="p-4"><Spinner /></div>
          ) : periods.length === 0 ? (
            <div className="p-4"><EmptyState title="Sin periodos" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Semana (termina)</th>
                    <th className="px-4 py-2 text-left">Estado</th>
                    <th className="px-4 py-2 text-left">Cerrado</th>
                    <th className="px-4 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {periods.map((p) => (
                    <tr key={p.id} className={viewId === p.id ? "bg-sky-50/40" : ""}>
                      <td className="px-4 py-2">
                        <div className="font-medium text-zinc-800">Sem {p.week_number} {p.year}</div>
                        <div className="text-xs text-zinc-500">{formatDate(p.week_ending)} (dom)</div>
                      </td>
                      <td className="px-4 py-2">
                        {p.status === "closed" ? (
                          <Badge className="bg-emerald-100 text-emerald-700">Cerrado</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700">Abierto</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-zinc-500">
                        {p.closed_at ? `${formatDateTime(p.closed_at)}${p.closed_by_name ? ` · ${p.closed_by_name}` : ""}` : "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <SecondaryButton className="px-2 py-1 text-xs" onClick={() => viewMetrics(p.id)}>
                            Ver KPIs
                          </SecondaryButton>
                          {p.status === "open" && (
                            <PrimaryButton
                              className="px-2 py-1 text-xs"
                              onClick={() => closePeriod(p.id)}
                              disabled={loadingId === p.id}
                            >
                              {loadingId === p.id ? "Cerrando…" : "Cerrar semana"}
                            </PrimaryButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-zinc-800">KPIs {viewId ? "del periodo" : ""}</h2>
          </div>
          {!viewId ? (
            <div className="p-4 text-sm text-zinc-500">Selecciona un periodo para ver métricas.</div>
          ) : !metrics ? (
            <div className="p-4"><Spinner /></div>
          ) : (
            <div className="p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-zinc-200 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-zinc-500">m² instalados</div>
                    <button
                      className="text-[11px] text-sky-700 hover:underline"
                      onClick={async () => {
                        if (!viewId) return;
                        setScreensLoading(true);
                        setScreenDateFeedback(null);
                        try {
                          const r = await fetchJson<any>(`/api/admin/kpis-semanales/periods/${viewId}/screens`);
                          setScreens((r.screens || []).map((screen: any) => ({ ...screen, saved_installation_date: screen.installation_date })));
                        } catch (e) { window.alert(String(e)); } finally { setScreensLoading(false); }
                      }}
                    >
                      Ver / editar pantallas
                    </button>
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-900">{Number(m2).toLocaleString("es-MX", { maximumFractionDigits: 2 })} m²</div>
                </div>
                <div className="rounded-md border border-zinc-200 p-3">
                  <div className="text-xs text-zinc-500">MP instalados</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-900">{Number(mp).toLocaleString("es-MX", { maximumFractionDigits: 2 })} MP</div>
                </div>
                <div className="rounded-md border border-zinc-200 p-3">
                  <div className="text-xs text-zinc-500">Pantallas instaladas</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-900">{Number(screensCount).toLocaleString("es-MX")}</div>
                </div>
                <div className="rounded-md border border-zinc-200 p-3">
                  <div className="text-xs text-zinc-500">Proyectos con instalación</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-900">{Number(projects).toLocaleString("es-MX")}</div>
                </div>                <div className="rounded-md border border-zinc-200 p-3">
                  <div className="text-xs text-zinc-500">Controladores instalados</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-900">{Number(ctlCount).toLocaleString("es-MX")}</div>
                </div>
                <div className="rounded-md border border-zinc-200 p-3">
                  <div className="text-xs text-zinc-500">Tickets cerrados</div>
                  <div className="mt-1 text-xl font-semibold text-zinc-900">{Number(ticketsClosed).toLocaleString("es-MX")}</div>
                </div>
                <div className="rounded-md border border-zinc-200 p-3">
                  <div className="text-xs text-zinc-500">Horas registradas</div>
                  <div className="mt-1 text-xl font-semibold text-zinc-900">{Number(hours).toLocaleString("es-MX", { maximumFractionDigits: 2 })} h</div>
                </div>
              </div>
              {screenDateFeedback && <p className="mt-4 text-xs text-emerald-700">{screenDateFeedback}</p>}
              {screens.length === 0 && screensLoading && <div className="mt-2 text-[11px] text-zinc-500">Cargando…</div>}
              {screens.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Pantallas instaladas en el periodo</h3>
                  <p className="mb-2 text-xs text-zinc-500">Cambia la fecha de instalación en la fila y pulsa Guardar.</p>
                  <div className="max-h-[420px] overflow-auto rounded-md border border-zinc-100">
                    <table className="min-w-full text-xs">
                      <thead className="bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Proyecto</th>
                          <th className="px-2 py-1.5 text-left">Tipo</th>
                          <th className="px-2 py-1.5 text-center">Cant</th>
                          <th className="px-2 py-1.5 text-right">m²</th>
                          <th className="px-2 py-1.5 text-left">Ambiente</th>
                          <th className="px-2 py-1.5 text-left">Tensión</th>
                          <th className="px-2 py-1.5 text-left">Fecha inst.</th>
                          <th className="px-2 py-1.5 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {screens.map((sc: any) => {
                          const m2s = sc.is_irregular ? Number(sc.area_m2||0) : (Number(sc.width_m||0)*Number(sc.height_m||0));
                          const total = m2s * Number(sc.quantity||0);
                          const f = sc.installation_date || "";
                          return (
                            <tr key={sc.id}>
                              <td className="px-2 py-1.5">
                                <a className="text-sky-700 hover:underline" href={`/proyectos/${sc.project_id}`}>
                                  {sc.project_code} · {sc.project_name}
                                </a>
                              </td>
                              <td className="px-2 py-1.5 text-zinc-700">{sc.screen_type}</td>
                              <td className="px-2 py-1.5 text-center text-zinc-700">{sc.quantity}</td>
                              <td className="px-2 py-1.5 text-right text-zinc-800">{total.toLocaleString('es-MX',{maximumFractionDigits:2})}</td>
                              <td className="px-2 py-1.5 text-zinc-600">{sc.environment || '—'}</td>
                              <td className="px-2 py-1.5 text-zinc-600">{sc.voltage || '—'}</td>
                              <td className="px-2 py-1.5">
                                <input
                                  aria-label={`Fecha de instalación de ${sc.project_code} ${sc.screen_type}`}
                                  className="w-32 rounded border border-zinc-300 px-1.5 py-1 text-xs text-zinc-700"
                                  type="date"
                                  value={f}
                                  onChange={(event) => {
                                    const installation_date = event.target.value;
                                    setScreenDateFeedback(null);
                                    setScreens((current) => current.map((item) => item.id === sc.id ? { ...item, installation_date } : item));
                                  }}
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                <button
                                  className="rounded bg-sky-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                                  disabled={!f || f === sc.saved_installation_date || screenDateSavingId === sc.id}
                                  onClick={() => void saveScreenInstallationDate(sc)}
                                >
                                  {screenDateSavingId === sc.id ? "Guardando…" : "Guardar"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {screensLoading && <div className="mt-2 text-[11px] text-zinc-500">Cargando…</div>}
                </div>
              )}
              <div className="mt-6">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Detalle (todos)</h3>
                <div className="max-h-80 overflow-auto rounded-md border border-zinc-100">
                  <table className="min-w-full text-xs">
                    <tbody className="divide-y divide-zinc-100">
                      {m.slice().sort((a,b)=>a.key.localeCompare(b.key)).map((x) => (
                        <tr key={x.key}>
                          <td className="px-3 py-1.5 text-zinc-600">{x.key}</td>
                          <td className="px-3 py-1.5 text-right font-medium text-zinc-800">
                            {Number(x.value).toLocaleString("es-MX", { maximumFractionDigits: 2 })}{x.unit ? ` ${x.unit}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
