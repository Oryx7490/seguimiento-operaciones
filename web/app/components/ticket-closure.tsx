"use client";

import { useState } from "react";
import { fetchJson } from "@/app/lib/client";
import { Field, PrimaryButton, SecondaryButton, TextInput, Textarea } from "@/app/components/ui";
import type { Closure } from "@/app/lib/types";

interface Att {
  id: string;
  file_name: string;
  attachment_type?: string;
}

export default function TicketClosure({
  ticketId,
  status,
  ticketType,
  closure,
  attachments,
  onChanged,
}: {
  ticketId: string;
  status: string;
  ticketType: "external" | "internal";
  closure: Closure | null;
  attachments: Att[];
  onChanged: () => void;
}) {
  const [c, setC] = useState<Closure>({
    repair_note: closure?.repair_note ?? "",
    billing_authorized: closure?.billing_authorized ?? false,
    billable: closure?.billable ?? true,
    warranty: closure?.warranty ?? false,
    charge_amount: closure?.charge_amount ?? null,
    charge_description: closure?.charge_description ?? "",
    authorized_by: closure?.authorized_by ?? null,
    authorized_at: closure?.authorized_at ?? null,
    invoice_generated: closure?.invoice_generated ?? false,
    invoice_id: closure?.invoice_id ?? "",
    notes: closure?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const isClosed = status === "closed";

  // Warranty implica no billable
  function handleWarrantyChange(checked: boolean) {
    setC((prev) => ({
      ...prev,
      warranty: checked,
      billable: checked ? false : prev.billable,
      billing_authorized: checked ? false : prev.billing_authorized,
    }));
  }

  function handleBillableChange(checked: boolean) {
    setC((prev) => ({
      ...prev,
      billable: checked,
      warranty: checked ? false : prev.warranty,
    }));
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      await fetchJson(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        body: JSON.stringify({
          closure: {
            repair_note: c.repair_note,
            billing_authorized: c.billing_authorized,
            billable: c.billable,
            warranty: c.warranty,
            charge_amount: c.charge_amount,
            charge_description: c.charge_description,
            notes: c.notes,
          },
        }),
      });
      setOk("Checklist de cierre guardado.");
      onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function closeTicket() {
    // Validaciones antes de cerrar
    if (!c.repair_note?.trim()) {
      setErr("La nota de reparación es obligatoria para cerrar.");
      return;
    }
    if (c.billable && !c.billing_authorized) {
      setErr("Debe autorizar la facturación si el ticket es facturable.");
      return;
    }
    if (c.billable && (c.charge_amount === null || c.charge_amount <= 0)) {
      setErr("Debe indicar el monto a cobrar si el ticket es facturable.");
      return;
    }

    setClosing(true);
    setErr(null);
    setOk(null);
    try {
      await fetchJson(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        body: JSON.stringify({
          close_ticket: true,
          closure: {
            repair_note: c.repair_note,
            billing_authorized: c.billing_authorized,
            billable: c.billable,
            warranty: c.warranty,
            charge_amount: c.charge_amount,
            charge_description: c.charge_description,
            notes: c.notes,
          },
        }),
      });
      setOk("Ticket cerrado.");
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
        <h2 className="text-sm font-semibold text-zinc-800">Cierre del ticket</h2>
        {isClosed && <span className="text-[11px] font-semibold text-emerald-600">Ticket cerrado</span>}
      </header>

      <div className="space-y-4 p-4">
        {isClosed ? (
          <div className="space-y-2 text-sm text-zinc-600">
            <p>
              <strong>Reparación:</strong> {c.repair_note || "—"}
            </p>
            <p>
              Facturación:{" "}
              <strong>
                {c.warranty ? "Garantía (sin cargo)" : c.billable ? "Facturable" : "No facturable"}
              </strong>
            </p>
            {c.billable && !c.warranty && (
              <>
                <p>
                  Monto: <strong>{c.charge_amount ? `${Number(c.charge_amount).toLocaleString()} MXN` : "—"}</strong>
                </p>
                <p>
                  Concepto: <strong>{c.charge_description || "—"}</strong>
                </p>
              </>
            )}
            {c.notes && <p>Notas: {c.notes}</p>}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <Field label="Nota de reparación (obligatoria)" hint="Qué se reparó o resolvió">
                <Textarea
                  value={c.repair_note ?? ""}
                  onChange={(v) => setC({ ...c, repair_note: v })}
                  placeholder="Describe la reparación realizada..."
                  rows={3}
                />
              </Field>

              <div className="space-y-2 rounded-md border border-zinc-200 p-3 bg-zinc-50">
                <p className="text-xs font-medium text-zinc-600">Facturación</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!c.warranty}
                      onChange={(e) => handleWarrantyChange(e.target.checked)}
                      className="rounded border-zinc-300"
                    />
                    <span className="text-sm text-zinc-700">Garantía (sin cargo — desactiva facturación)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!c.billable}
                      onChange={(e) => handleBillableChange(e.target.checked)}
                      disabled={!!c.warranty}
                      className="rounded border-zinc-300"
                    />
                    <span className="text-sm text-zinc-700">Facturable / Generar cobro</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!c.billing_authorized}
                      onChange={(e) => setC({ ...c, billing_authorized: e.target.checked })}
                      disabled={!c.billable || !!c.warranty}
                      className="rounded border-zinc-300"
                    />
                    <span className="text-sm text-zinc-700">Autorizo facturación</span>
                  </label>
                </div>

                {!c.warranty && c.billable && (
                  <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-zinc-200">
                    <Field label="Monto a cobrar (MXN)">
                      <TextInput
                        type="number"
                        value={c.charge_amount ? String(c.charge_amount) : ""}
                        onChange={(v) => setC({ ...c, charge_amount: v ? Number(v) : null })}
                        placeholder="0.00"
                      />
                    </Field>
                    <Field label="Concepto de cobro">
                      <TextInput
                        value={c.charge_description ?? ""}
                        onChange={(v) => setC({ ...c, charge_description: v })}
                        placeholder="Ej. Reparación de fuga, cambio de válvula..."
                      />
                    </Field>
                  </div>
                )}

                <Field label="Notas adicionales (opcional)">
                  <Textarea
                    value={c.notes ?? ""}
                    onChange={(v) => setC({ ...c, notes: v })}
                    placeholder="Observaciones de cierre..."
                    rows={2}
                  />
                </Field>
              </div>
            </div>

            {err && <p className="text-xs text-red-600">{err}</p>}
            {ok && <p className="text-xs text-emerald-600">{ok}</p>}

            <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
              <SecondaryButton onClick={() => void save()} disabled={saving}>
                {saving ? "Guardando…" : "Guardar checklist"}
              </SecondaryButton>
              <PrimaryButton onClick={() => void closeTicket()} disabled={closing}>
                {closing ? "Cerrando…" : "Cerrar ticket"}
              </PrimaryButton>
            </div>
          </>
        )}
      </div>
    </section>
  );
}