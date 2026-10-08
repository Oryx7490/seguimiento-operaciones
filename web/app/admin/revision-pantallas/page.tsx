"use client";
import { useMemo, useState } from "react";

import Link from "next/link";
import { fetchJson, useResource } from "@/app/lib/client";
import { Badge, EmptyState, Modal, PrimaryButton, SecondaryButton, Select, Spinner, TextInput } from "@/app/components/ui";

interface AuditItem {
  project_id: string;
  project_code: string;
  project_name: string;
  project_status: string;
  client_name: string | null;
  screen_id: string;
  screen_type: string;
  quantity: number;
  installed: boolean;
  cancelled: boolean;
  width_m: number | null;
  height_m: number | null;
  area_m2: number | null;
  pitch_mm: number | null;
  catalog_name: string | null;
  catalog_width_m: number | null;
  catalog_height_m: number | null;
  catalog_pitch_mm: number | null;
  errors: string[];
  warnings: string[];
  has_errors: boolean;
  has_warnings: boolean;
  severity: "error" | "warning" | "ok";
  issue_keys: string[];
  alerts: string[];
}

interface AuditResponse {
  total: number;
  with_errors: number;
  with_warnings: number;
  ok: number;
  items: AuditItem[];
}

interface IgnoreRow {
  screen_id: string;
  issue_key: string;
  reason: string | null;
  ignored_by_name: string | null;
  ignored_at: string;
}

function fmtNum(v: number | null, suffix = ""): string {
  if (v == null) return "—";
  return `${String(Math.round(v * 10000) / 10000)}${suffix}`;
}

function keyFor(text: string): string {
  return `err_${Buffer.from(String(text)).toString("hex").slice(0, 40)}`;
}

export default function ScreenAuditPage() {
  const { data, error, reload } = useResource<AuditResponse>("/api/admin/screen-audit");
  const { data: ignoresRes, reload: reloadIgnores } = useResource<{ ignores: IgnoreRow[] }>("/api/admin/screen-audit/ignores");
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");
  const [ignoring, setIgnoring] = useState<{ screenId: string; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ignoredSet = useMemo(() => {
    return new Set((ignoresRes?.ignores ?? []).map((i) => `${i.screen_id}:${i.issue_key}`));
  }, [ignoresRes]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.items ?? []).filter((i) => {
      if (severity === "error" && !i.has_errors) return false;
      if (severity === "warning" && i.has_errors) return false;
      if (!q) return true;
      return (
        i.project_code.toLowerCase().includes(q) ||
        i.project_name.toLowerCase().includes(q) ||
        i.screen_type.toLowerCase().includes(q) ||
        (i.catalog_name ?? "").toLowerCase().includes(q) ||
        (i.client_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, severity, search]);

  async function doIgnore() {
    if (!ignoring) return;
    setSaving(true);
    setErr(null);
    try {
      await fetchJson(`/api/admin/screen-audit/${ignoring.screenId}/ignore`, {
        method: "POST",
        body: JSON.stringify({ issue_key: keyFor(ignoring.text), reason: reason.trim() || null }),
      });
      setIgnoring(null);
      setReason("");
      reload();
      reloadIgnores();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function unignore(screenId: string, text: string) {
    try {
      await fetchJson(`/api/admin/screen-audit/${screenId}/ignore?issue_key=${encodeURIComponent(keyFor(text))}`, {
        method: "DELETE",
      });
      reload();
      reloadIgnores();
    } catch (e) {
      alert(String(e));
    }
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Auditoría de medidas de pantallas</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Detecta errores de captura: órdenes de magnitud (p. ej. alto 0.016 m vs 0.16 m), dimensiones
            imposibles, áreas inconsistentes y desviaciones frente al catálogo de la cuenta. Puedes desactivar un aviso concreto marcándolo como «validado».
          </p>
        </div>
        <button
          onClick={() => { reload(); reloadIgnores(); }}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          Actualizar
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {data && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            <span className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
              Revisadas: {data.total}
            </span>
            <span className="rounded-md bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
              Con errores: {data.with_errors}
            </span>
            <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
              Solo avisos: {data.with_warnings}
            </span>
            <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Sin alertas: {data.ok}
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="w-72">
          <TextInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por proyecto, pantalla, catálogo o cliente…"
          />
        </div>
        <div className="w-48">
          <Select
            value={severity}
            onChange={setSeverity}
            placeholder="Severidad: todas"
            options={[
              { value: "error", label: "Con errores" },
              { value: "warning", label: "Solo avisos" },
            ]}
          />
        </div>
      </div>

      <div className="mt-4">
        {!data && !error ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title="Sin alertas"><p className="mt-1 text-xs text-zinc-500">{data && data.total > 0 ? "Ninguna pantalla tiene errores o avisos de medidas." : ""}</p></EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 text-left">Proyecto</th>
                  <th className="px-4 py-3 text-left">Pantalla</th>
                  <th className="px-4 py-3 text-center">Cant</th>
                  <th className="px-4 py-3 text-left">Dimensiones</th>
                  <th className="px-4 py-3 text-right">Área m²</th>
                  <th className="px-4 py-3 text-right">Pitch mm</th>
                  <th className="px-4 py-3 text-left">Catálogo</th>
                  <th className="px-4 py-3 text-left">Alertas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((it: AuditItem) => (
                  <tr key={it.screen_id} className={`align-top hover:bg-zinc-50 ${it.cancelled ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3">
                      <Link href={`/proyectos/${it.project_id}`} className="font-medium text-sky-700 hover:underline">
                        {it.project_code}
                      </Link>
                      <p className="text-xs text-zinc-500">{it.project_name}</p>
                      {it.client_name && <p className="text-[11px] text-zinc-400">{it.client_name}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-800">{it.screen_type}</p>
                      <p className="text-[11px] text-zinc-400">
                        {it.installed ? "Instalada" : it.cancelled ? "Cancelada" : "Pendiente"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center text-zinc-600">{it.quantity}</td>
                    <td className="px-4 py-3 text-zinc-700">
                      {it.width_m != null && it.height_m != null
                        ? `${fmtNum(it.width_m)} × ${fmtNum(it.height_m)} m`
                        : it.area_m2 != null && it.width_m == null && it.height_m == null
                          ? `Irregular · ${fmtNum(it.area_m2)} m²`
                          : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-700">{fmtNum(it.area_m2)}</td>
                    <td className="px-4 py-3 text-right text-zinc-700">{fmtNum(it.pitch_mm)}</td>
                    <td className="px-4 py-3">
                      {it.catalog_name ? (
                        <>
                          <p className="text-zinc-700">{it.catalog_name}</p>
                          <p className="text-[11px] text-zinc-400">
                            {fmtNum(it.catalog_width_m)} × {fmtNum(it.catalog_height_m)} m · P{fmtNum(it.catalog_pitch_mm)}
                          </p>
                        </>
                      ) : (
                        <span className="text-xs text-zinc-400">Sin vínculo</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {it.alerts.map((a: string, i: number) => {
                          const k = keyFor(a);
                          const hidden = ignoredSet.has(`${it.screen_id}:${k}`);
                          if (hidden) {
                            return (
                              <button
                                key={`h${i}`}
                                type="button"
                                onClick={() => unignore(it.screen_id, a)}
                                className="rounded-full bg-gray-100 px-2 py-0.5 text-left text-[11px] text-gray-500 line-through hover:bg-gray-200"
                                title="Click para volver a mostrar este aviso"
                              >
                                {a}
                              </button>
                            );
                          }
                          const isErr = it.errors.includes(a);
                          return (
                            <div key={i} className="flex items-center gap-1">
                              <Badge className={`${isErr ? "bg-red-100 font-medium text-red-700" : "bg-amber-100 font-medium text-amber-700"}`}>
                                {a}
                              </Badge>
                              <button
                                type="button"
                                onClick={() => setIgnoring({ screenId: it.screen_id, text: a })}
                                className="text-[10px] text-zinc-400 hover:text-zinc-600"
                                title="Marcar como validado / desactivar aviso"
                              >
                                Validar
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ignoring && (
        <Modal
          mark="W45"
          open={true}
          onClose={() => { setIgnoring(null); setErr(null); }}
          title="Desactivar aviso"
          footer={
            <>
              <SecondaryButton onClick={() => { setIgnoring(null); setErr(null); }}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={doIgnore} disabled={saving}>{saving ? "Guardando…" : "Marcar como validado"}</PrimaryButton>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">Se ocultará este aviso para esta pantalla. Quedará registrado quién lo validó, fecha y hora.</p>
            <p className="rounded-md bg-zinc-50 p-2 text-xs text-zinc-700">{ignoring.text}</p>
            <TextInput value={reason} onChange={setReason} placeholder="Motivo opcional (quién revisó / referencia)" />
            {err && <p className="text-xs text-red-600">{err}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
