"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fetchJson, useResource } from "@/app/lib/client";
import { Spinner } from "@/app/components/ui";

interface ControllerRow {
  id: string;
  controller_id: string;
  name: string;
  brand: string | null;
  quantity: number;
  notes: string | null;
  installed: boolean;
}

interface ScreenRow {
  id: string;
  screen_type: string;
  environment: string | null;
  quantity: number;
  pitch_mm: number | null;
  width_m: number | null;
  height_m: number | null;
  is_irregular: boolean;
  area_m2: number | null;
  notes: string | null;
  m2_unit: number;
  m2_total: number;
  controllers: ControllerRow[];
}

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  client_name: string | null;
  status: string;
  screens: ScreenRow[];
  total_m2: number;
}

interface PlanningResponse {
  projects: ProjectRow[];
  totals: { projects: number; screens: number; m2: number };
  controllers: { controller_id: string; name: string; brand: string | null; quantity: number }[];
}

const ENV: Record<string, string> = {
  exterior: "Exterior",
  interior: "Interior",
  semi_exterior: "Semi exterior",
  interior_flexible: "Interior flexible",
};

function fmt(n: number) {
  return n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
}

type SortKey = "project" | "screen" | "pitch" | "m2" | "controllers" | "notes";

function cmpText(a: string, b: string) {
  return a.localeCompare(b, "es", { sensitivity: "base", numeric: true });
}

function dims(s: ScreenRow): string {
  if (s.is_irregular) return s.area_m2 ? `Irregular · ${fmt(s.area_m2)} m²` : "Irregular";
  if (s.width_m && s.height_m) return `${fmt(s.width_m)} × ${fmt(s.height_m)} m`;
  return "—";
}

export default function PlaneacionPage() {
  const { data, error, reload } = useResource<PlanningResponse>("/api/planning");
  const pending = useMemo(() => {
    const map = new Map<string, { controller_id: string; name: string; brand: string | null; quantity: number }>();
    for (const p of data?.projects ?? []) {
      for (const s of p.screens) {
        for (const c of s.controllers) {
          if (c.installed) continue;
          const cur = map.get(c.controller_id) ?? {
            controller_id: c.controller_id,
            name: c.name,
            brand: c.brand,
            quantity: 0,
          };
          cur.quantity += c.quantity;
          map.set(c.controller_id, cur);
        }
      }
    }
    return [...map.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "es"));
  }, [data]);

  const unassignedScreens = useMemo(() => {
    let rows = 0;
    let units = 0;
    for (const p of data?.projects ?? []) {
      for (const s of p.screens) {
        if (s.controllers.length > 0) continue;
        rows += 1;
        units += s.quantity;
      }
    }
    return { rows, units };
  }, [data]);

  const [query, setQuery] = useState("");
  const [equipQuery, setEquipQuery] = useState("");
  const [hideAssigned, setHideAssigned] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("es");
    const eq = equipQuery.trim().toLocaleLowerCase("es");
    const matchesEquip = (s: ScreenRow) =>
      !eq || s.controllers.some((c) =>
        c.name.toLocaleLowerCase("es").includes(eq) || (c.brand ?? "").toLocaleLowerCase("es").includes(eq)
      );
    const list = (data?.projects ?? [])
      .filter((p) => !q || [p.code, p.name, p.client_name].some((t) => (t ?? "").toLocaleLowerCase("es").includes(q)))
      .map((p) => ({ ...p, screens: p.screens.filter(matchesEquip).filter((s) => !hideAssigned || s.controllers.length === 0) }))
      .filter((p) => !eq || p.screens.length > 0);
    if (!sortKey) return list;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list]
      .map((p) => ({
        ...p,
        screens: [...p.screens].sort((a, b) => {
          if (sortKey === "screen") return dir * cmpText(a.screen_type, b.screen_type);
          if (sortKey === "pitch") {
            if (a.pitch_mm == null && b.pitch_mm == null) return 0;
            if (a.pitch_mm == null) return 1;
            if (b.pitch_mm == null) return -1;
            return dir * (a.pitch_mm - b.pitch_mm);
          }
          return 0;
        }),
      }))
      .sort((a, b) => {
        if (sortKey === "project") return dir * (cmpText(a.name, b.name) || cmpText(a.code, b.code));
        const sa = a.screens[0];
        const sb = b.screens[0];
        if (!sa && !sb) return cmpText(a.name, b.name);
        if (!sa) return 1;
        if (!sb) return -1;
        if (sortKey === "screen") return dir * cmpText(sa.screen_type, sb.screen_type) || cmpText(a.name, b.name);
        if (sa.pitch_mm == null && sb.pitch_mm == null) return cmpText(a.name, b.name);
        if (sa.pitch_mm == null) return 1;
        if (sb.pitch_mm == null) return -1;
        return dir * (sa.pitch_mm - sb.pitch_mm) || cmpText(a.name, b.name);
      });
  }, [data, query, equipQuery, hideAssigned, sortKey, sortDir]);

  const rows = useMemo(() => {
    if (sortKey && sortKey !== "project") {
      const flat: { project: ProjectRow; screen: ScreenRow }[] = [];
      const empty: ProjectRow[] = [];
      for (const p of filtered) {
        if (p.screens.length === 0) empty.push(p);
        else for (const s of p.screens) flat.push({ project: p, screen: s });
      }
      const dir = sortDir === "asc" ? 1 : -1;
      flat.sort((a, b) => compareScreens(a.screen, b.screen, a.project.name, b.project.name, sortKey, dir));
      return [
        ...flat.map((r) => ({ key: r.screen.id, project: r.project, screen: r.screen as ScreenRow | null, span: 1 })),
        ...empty.map((p) => ({ key: p.id, project: p, screen: null as ScreenRow | null, span: 1 })),
      ];
    }
    return filtered.flatMap((p) =>
      p.screens.length === 0
        ? [{ key: p.id, project: p, screen: null as ScreenRow | null, span: 1 }]
        : p.screens.map((s, i) => ({
            key: s.id,
            project: p,
            screen: s as ScreenRow | null,
            span: i === 0 ? p.screens.length : 0,
          }))
    );
  }, [filtered, sortKey, sortDir]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-900">Planeación de inventario</h1>
      <p className="mt-1 max-w-3xl text-sm text-zinc-500">
        Vista global de pantallas y controladores considerados en cada proyecto, con el metraje a desplegar.
        Los comentarios son opcionales y no cambian la cotización.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {!data && !error && <div className="mt-6"><Spinner /></div>}

      {data && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Summary label="Proyectos" value={String(data.totals.projects)} />
            <Summary label="Pantallas" value={String(data.totals.screens)} />
            <Summary label="Metraje total" value={`${fmt(data.totals.m2)} m²`} />
          </div>

          <div className={`mt-4 rounded-lg border p-4 shadow-sm ${pending.length || unassignedScreens.units ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${pending.length || unassignedScreens.units ? "text-amber-800" : "text-emerald-800"}`}>
              Faltan por instalar
            </p>
            <p className={`mt-2 text-sm ${unassignedScreens.units ? "text-amber-900" : "text-emerald-700"}`}>
              {unassignedScreens.units === 0
                ? "Todas las pantallas tienen equipos asignados."
                : `${unassignedScreens.units} pantalla${unassignedScreens.units === 1 ? "" : "s"} sin equipos asignados${
                    unassignedScreens.rows !== unassignedScreens.units ? ` (${unassignedScreens.rows} registros)` : ""
                  }.`}
            </p>
            {pending.length === 0 ? (
              <p className="mt-1 text-sm text-emerald-700">Todos los controladores marcados están instalados.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {pending.map((c) => (
                  <span key={c.controller_id} className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs text-amber-900">
                    <span className="font-medium">{c.name}</span>
                    {c.brand ? ` · ${c.brand}` : ""}
                    <span className="ml-1.5 font-semibold">× {c.quantity}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {data.controllers.length > 0 && (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Controladores a considerar</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.controllers.map((c) => (
                  <span key={c.controller_id} className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700">
                    <span className="font-medium">{c.name}</span>
                    {c.brand ? ` · ${c.brand}` : ""}
                    <span className="ml-1.5 font-semibold text-zinc-900">× {c.quantity}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar proyecto o cliente…"
              className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 focus:border-zinc-500 focus:outline-none"
            />
            <input
              value={equipQuery}
              onChange={(e) => setEquipQuery(e.target.value)}
              placeholder="Buscar equipo o controlador…"
              className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 focus:border-zinc-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setHideAssigned((v) => !v)}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${hideAssigned ? "border-amber-300 bg-amber-50 text-amber-800" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}
            >
              {hideAssigned ? "Mostrar todas las pantallas" : "Ocultar pantallas con equipos"}
            </button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-[960px] w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <SortTh label="Proyecto" column="project" align="left" sortKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="Pantalla" column="screen" align="left" sortKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="Pitch" column="pitch" align="right" sortKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="Metraje" column="m2" align="right" sortKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="Controladores" column="controllers" align="left" sortKey={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortTh label="Comentario de pantalla" column="notes" align="left" sortKey={sortKey} dir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-sm text-zinc-500">No hay proyectos que coincidan.</td>
                  </tr>
                )}
                {rows.map((row) =>
                  row.screen === null ? (
                    <tr key={row.key} className="border-t border-zinc-100">
                      <td className="px-4 py-3 align-top"><ProjectCell project={row.project} /></td>
                      <td colSpan={5} className="px-4 py-3 text-zinc-400">Sin pantallas registradas.</td>
                    </tr>
                  ) : (
                    <tr key={row.key} className="border-t border-zinc-100 align-top">
                        {row.span > 0 && (
                          <td className="px-4 py-3" rowSpan={row.span}>
                            <ProjectCell project={row.project} />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <p className="font-medium text-zinc-800">{row.screen.screen_type}</p>
                          <p className="text-xs text-zinc-500">
                            {row.screen.environment ? ENV[row.screen.environment] ?? row.screen.environment : "Sin tipo"}
                            {` · × ${row.screen.quantity}`}
                          </p>
                          <p className="text-xs text-zinc-400">{dims(row.screen)}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-zinc-800">
                          {row.screen.pitch_mm ? `P${fmt(row.screen.pitch_mm)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="font-semibold text-zinc-800">{fmt(row.screen.m2_total)} m²</p>
                          {row.screen.quantity > 1 && (
                            <p className="text-[11px] text-zinc-400">{fmt(row.screen.m2_unit)} m² c/u</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {row.screen.controllers.length === 0 ? (
                            <span className="text-xs text-zinc-400">Sin controladores</span>
                          ) : (
                            <ul className="space-y-2">
                              {row.screen.controllers.map((c) => (
                                <li key={c.id}>
                                  <p className={`flex items-center gap-2 ${c.installed ? "text-zinc-400 line-through" : "text-zinc-800"}`}>
                                    <InstalledBox id={c.id} installed={c.installed} onSaved={reload} />
                                    <span>
                                      <span className="font-medium">{c.name}</span>
                                      {c.brand ? <span className="text-zinc-500"> · {c.brand}</span> : null}
                                      <span className="ml-1 font-semibold">× {c.quantity}</span>
                                    </span>
                                  </p>
                                  <NoteField
                                    target="controller"
                                    id={c.id}
                                    initial={c.notes ?? ""}
                                    placeholder="Comentario del controlador"
                                    onSaved={reload}
                                  />
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <NoteField
                            target="screen"
                            id={row.screen.id}
                            initial={row.screen.notes ?? ""}
                            placeholder="Comentario de la pantalla"
                            onSaved={reload}
                          />
                        </td>
                      </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function InstalledBox({ id, installed, onSaved }: { id: string; installed: boolean; onSaved: () => void }) {
  const [on, setOn] = useState(installed);
  const [err, setErr] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next);
    setErr(false);
    try {
      await fetchJson("/api/planning", {
        method: "PATCH",
        body: JSON.stringify({ target: "controller", id, installed: next }),
      });
      onSaved();
    } catch {
      setOn(!next);
      setErr(true);
    }
  }

  return (
    <label className="inline-flex shrink-0 items-center" title={on ? "Instalado" : "Marcar como instalado"}>
      <input
        type="checkbox"
        checked={on}
        onChange={toggle}
        className="h-4 w-4 rounded border-zinc-300 text-emerald-600"
      />
      {err && <span className="sr-only">No se pudo guardar</span>}
    </label>
  );
}

function ProjectCell({ project }: { project: ProjectRow }) {
  return (
    <div>
      <Link href={`/proyectos/${project.id}`} className="font-medium text-zinc-800 hover:underline">
        <span className="font-mono text-xs text-sky-700">{project.code}</span> {project.name}
      </Link>
      {project.client_name && <p className="text-xs text-zinc-400">{project.client_name}</p>}
      <p className="mt-1 text-xs font-medium text-zinc-600">{fmt(project.total_m2)} m²</p>
    </div>
  );
}

function compareScreens(
  a: ScreenRow,
  b: ScreenRow,
  projectA: string,
  projectB: string,
  key: SortKey,
  dir: number
) {
  const tie = cmpText(projectA, projectB) || cmpText(a.screen_type, b.screen_type);
  if (key === "screen") return dir * cmpText(a.screen_type, b.screen_type) || tie;
  if (key === "pitch") {
    if (a.pitch_mm == null && b.pitch_mm == null) return tie;
    if (a.pitch_mm == null) return 1;
    if (b.pitch_mm == null) return -1;
    return dir * (a.pitch_mm - b.pitch_mm) || tie;
  }
  if (key === "m2") return dir * (a.m2_total - b.m2_total) || tie;
  if (key === "controllers") {
    const qa = a.controllers.reduce((n, c) => n + c.quantity, 0);
    const qb = b.controllers.reduce((n, c) => n + c.quantity, 0);
    if (qa === 0 && qb === 0) return tie;
    if (qa === 0) return 1;
    if (qb === 0) return -1;
    const nameA = a.controllers.map((c) => c.name).join(", ");
    const nameB = b.controllers.map((c) => c.name).join(", ");
    return dir * (qa - qb) || dir * cmpText(nameA, nameB) || tie;
  }
  const na = a.notes?.trim() ?? "";
  const nb = b.notes?.trim() ?? "";
  if (!na && !nb) return tie;
  if (!na) return 1;
  if (!nb) return -1;
  return dir * cmpText(na, nb) || tie;
}

function SortTh({
  label,
  column,
  align,
  sortKey,
  dir,
  onSort,
}: {
  label: string;
  column: SortKey;
  align: "left" | "right";
  sortKey: SortKey | null;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-zinc-800 ${align === "right" ? "flex-row-reverse" : ""}`}
        title={active ? (dir === "desc" ? "Mayor a menor" : "Menor a mayor") : "Ordenar de mayor a menor"}
      >
        {label}
        <span className="inline-flex flex-col text-[8px] leading-[8px]">
          <span className={active && dir === "asc" ? "text-zinc-900" : "text-zinc-300"}>▲</span>
          <span className={active && dir === "desc" ? "text-zinc-900" : "text-zinc-300"}>▼</span>
        </span>
      </button>
    </th>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function NoteField({
  target,
  id,
  initial,
  placeholder,
  onSaved,
}: {
  target: "screen" | "controller";
  id: string;
  initial: string;
  placeholder: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    if (value.trim() === initial.trim()) return;
    setState("saving");
    try {
      await fetchJson("/api/planning", {
        method: "PATCH",
        body: JSON.stringify({ target, id, notes: value }),
      });
      setState("saved");
      onSaved();
    } catch {
      setState("error");
    }
  }

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setState("idle");
        }}
        onBlur={save}
        rows={2}
        placeholder={placeholder}
        className="mt-1 w-full resize-y rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700 focus:border-zinc-400 focus:bg-white focus:outline-none"
      />
      {state === "saving" && <p className="text-[10px] text-zinc-400">Guardando…</p>}
      {state === "saved" && <p className="text-[10px] text-emerald-600">Guardado</p>}
      {state === "error" && <p className="text-[10px] text-red-600">No se pudo guardar</p>}
    </div>
  );
}
