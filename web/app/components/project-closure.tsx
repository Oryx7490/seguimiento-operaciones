"use client";

import { useState } from "react";
import { fetchJson } from "@/app/lib/client";
import { formatDate } from "@/app/lib/format";
import { Field, PrimaryButton, SecondaryButton, TextInput } from "@/app/components/ui";

interface Closure {
  installation_done: boolean;
  mandatory_activities_completed: boolean;
  hours_justified: boolean;
  delivery_sheet_attachment_id: string | null;
  receiver_name: string | null;
  reception_date: string | null;
  finiquito_attachment_id: string | null;
  fiscal_complement_attachment_id: string | null;
  digital_signature_attachment_id: string | null;
  final_note: string | null;
  closed_at: string | null;
}

interface Att {
  id: string;
  file_name: string;
  attachment_type?: string;
}

const REQUIREMENTS: Array<{ key: keyof Closure; label: string }> = [
  { key: "installation_done", label: "Instalación realizada" },
  { key: "mandatory_activities_completed", label: "Actividades obligatorias completadas" },
  { key: "hours_justified", label: "Horas justificadas" },
];

export default function ProjectClosure({
  projectId,
  status,
  closure,
  attachments,
  onChanged,
}: {
  projectId: string;
  status: string;
  closure: Closure | null;
  attachments: Att[];
  onChanged: () => void;
}) {
  const [c, setC] = useState<Closure>({
    installation_done: closure?.installation_done ?? false,
    mandatory_activities_completed: closure?.mandatory_activities_completed ?? false,
    hours_justified: closure?.hours_justified ?? false,
    delivery_sheet_attachment_id: closure?.delivery_sheet_attachment_id ?? null,
    receiver_name: closure?.receiver_name ?? "",
    reception_date: closure?.reception_date ?? "",
    finiquito_attachment_id: closure?.finiquito_attachment_id ?? null,
    fiscal_complement_attachment_id: closure?.fiscal_complement_attachment_id ?? null,
    digital_signature_attachment_id: closure?.digital_signature_attachment_id ?? null,
    final_note: closure?.final_note ?? "",
    closed_at: closure?.closed_at ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const isClosed = status === "closed";

  async function save() {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      await fetchJson(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          closure: {
            installation_done: c.installation_done,
            mandatory_activities_completed: c.mandatory_activities_completed,
            hours_justified: c.hours_justified,
            delivery_sheet_attachment_id:
              c.delivery_sheet_attachment_id ??
              attachments.find((a) => a.attachment_type === "delivery_sheet")?.id ??
              attachments[0]?.id ??
              null,
            receiver_name: c.receiver_name,
            reception_date: c.reception_date,
            finiquito_attachment_id: c.finiquito_attachment_id,
            fiscal_complement_attachment_id: c.fiscal_complement_attachment_id,
            digital_signature_attachment_id: c.digital_signature_attachment_id,
            final_note: c.final_note,
          },
        }),
      });
      setOk("Checklist guardado.");
      onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function closeProject() {
    setClosing(true);
    setErr(null);
    setOk(null);
    try {
      await fetchJson(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ close_project: true }),
      });
      setOk("Proyecto cerrado.");
      onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      setClosing(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-800">Cierre del proyecto</h2>
        {isClosed && <span className="text-[11px] font-semibold text-emerald-600">Proyecto cerrado</span>}
      </header>

      <div className="space-y-4 p-4">
        {isClosed ? (
          <div className="space-y-2 text-sm text-zinc-600">
            <p>
              Hoja de entrega:{" "}
              <strong>{attachments.find((a) => a.id === c.delivery_sheet_attachment_id)?.file_name ?? "—"}</strong>
            </p>
            <p>
              Recibe: <strong>{c.receiver_name || "—"}</strong> ·{" "}
              {c.reception_date ? formatDate(c.reception_date) : "—"}
            </p>
            {c.final_note && <p>Nota final: {c.final_note}</p>}
            {c.closed_at && <p className="text-xs text-zinc-400">Cerrado {formatDate(c.closed_at)}</p>}
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {REQUIREMENTS.map((r) => (
                <li key={r.key} className="flex items-center gap-3 text-sm text-zinc-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(c[r.key])}
                      onChange={(e) => setC({ ...c, [r.key]: e.target.checked })}
                      className="rounded border-zinc-300"
                    />
                    {r.label}
                  </label>
                </li>
              ))}
              <li className="flex items-center gap-3 text-sm text-zinc-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(c.delivery_sheet_attachment_id)}
                    onChange={(e) =>
                      setC({
                        ...c,
                        delivery_sheet_attachment_id: e.target.checked ? (
                          attachments.find((a) => a.attachment_type === "delivery_sheet")?.id ??
                          attachments[0]?.id ??
                          null
                        ) : null,
                      })
                    }
                    className="rounded border-zinc-300"
                  />
                  Hoja de entrega firmada adjunta
                </label>
              </li>
            </ul>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Hoja de entrega (adjunto)" hint="Súbela en la sección Adjuntos">
                <select
                  value={c.delivery_sheet_attachment_id ?? ""}
                  onChange={(e) =>
                    setC({ ...c, delivery_sheet_attachment_id: e.target.value || null })
                  }
                  className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-800"
                >
                  <option value="">Selecciona un adjunto…</option>
                  {(attachments.length > 0
                    ? attachments
                    : []
                  ).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.file_name}
                      {a.attachment_type == null ? "" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nombre de quien recibe">
                <TextInput value={c.receiver_name ?? ""} onChange={(v) => setC({ ...c, receiver_name: v })} placeholder="Nombre y puesto" />
              </Field>
              <Field label="Fecha de recepción">
                <TextInput type="date" value={c.reception_date ?? ""} onChange={(v) => setC({ ...c, reception_date: v })} />
              </Field>
              <Field label="Nota final (opcional)">
                <TextInput value={c.final_note ?? ""} onChange={(v) => setC({ ...c, final_note: v })} placeholder="Observaciones de cierre" />
              </Field>
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}
            {ok && <p className="text-xs text-emerald-600">{ok}</p>}

            <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
              <SecondaryButton onClick={() => void save()} disabled={saving}>
                {saving ? "Guardando…" : "Guardar checklist"}
              </SecondaryButton>
              <PrimaryButton onClick={() => void closeProject()} disabled={closing}>
                {closing ? "Cerrando…" : "Cerrar proyecto"}
              </PrimaryButton>
            </div>
          </>
        )}
      </div>
    </section>
  );
}