"use client";

import { Fragment, useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import {
  Badge,
  DangerButton,
  EmptyState,
  Field,
  Modal,
  PrimaryButton,
  SecondaryButton,
  Select,
  Spinner,
  TextInput,
  Textarea,
} from "@/app/components/ui";
import type {
  AnnualSummaryResponse,
  NonWorkingDay,
  NonWorkingDaysResponse,
} from "@/app/lib/types";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function CalendarioPage() {
  const [tab, setTab] = useState<"dias" | "resumen">("dias");
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-900">Calendario laboral</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Días no laborables (oficiales y discrecionales) y resumen anual de días trabajados.
      </p>

      <div className="mt-4 inline-flex rounded-md border border-zinc-200 bg-white p-0.5 shadow-sm">
        {(
          [
            { key: "dias", label: "Días no laborables" },
            { key: "resumen", label: "Resumen anual" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded px-3 py-1.5 text-sm ${
              tab === t.key ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "dias" ? <DaysManager /> : <AnnualSummary />}
      </div>
    </div>
  );
}

function DaysManager() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const { data, error, reload } = useResource<NonWorkingDaysResponse>(
    `/api/non-working-days?year=${year}`
  );
  const [edit, setEdit] = useState<NonWorkingDay | "new" | null>(null);

  const days = data?.days ?? [];

  const toggleActive = async (d: NonWorkingDay) => {
    await fetchJson(`/api/non-working-days/${d.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !d.active }),
    });
    reload();
  };

  const remove = async (d: NonWorkingDay) => {
    if (!confirm(`¿Eliminar "${d.name}" (${d.day})?`)) return;
    await fetchJson(`/api/non-working-days/${d.id}`, { method: "DELETE" });
    reload();
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-32">
          <Field label="Año">
            <TextInput value={year} onChange={setYear} type="number" />
          </Field>
        </div>
        <PrimaryButton onClick={() => setEdit("new")}>Agregar día</PrimaryButton>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
        {!data ? (
          <Spinner />
        ) : days.length === 0 ? (
          <EmptyState title="No hay días no laborables en este año" />
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Motivo</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {days.map((d) => (
                <tr key={d.id} className="hover:bg-zinc-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-800">{d.day}</td>
                  <td className="px-4 py-3 text-zinc-700">
                    {d.name}
                    {d.notes && <span className="block text-[11px] text-zinc-400">{d.notes}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {d.kind === "official" ? (
                      <Badge className="bg-blue-100 text-blue-700">Oficial</Badge>
                    ) : (
                      <Badge className="bg-purple-100 text-purple-700">Discrecional</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {d.active ? (
                      <Badge className="bg-emerald-100 text-emerald-700">Activo</Badge>
                    ) : (
                      <Badge className="bg-zinc-100 text-zinc-500">Inactivo</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <SecondaryButton onClick={() => setEdit(d)} className="px-2 py-1 text-xs">
                        Editar
                      </SecondaryButton>
                      <SecondaryButton onClick={() => toggleActive(d)} className="px-2 py-1 text-xs">
                        {d.active ? "Desactivar" : "Activar"}
                      </SecondaryButton>
                      <DangerButton onClick={() => remove(d)} className="px-2 py-1 text-xs">
                        Eliminar
                      </DangerButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {edit && (
        <DayModal
          key={edit === "new" ? "new" : edit.id}
          day={edit === "new" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function DayModal({
  day,
  onClose,
  onSaved,
}: {
  day: NonWorkingDay | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(day?.day ?? "");
  const [name, setName] = useState(day?.name ?? "");
  const [kind, setKind] = useState(day?.kind ?? "discretionary");
  const [notes, setNotes] = useState(day?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body = JSON.stringify({ day: date, name, kind, notes });
      if (day) {
        await fetchJson(`/api/non-working-days/${day.id}`, { method: "PATCH", body });
      } else {
        await fetchJson("/api/non-working-days", { method: "POST", body });
      }
      onSaved();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={day ? "Editar día no laborable" : "Nuevo día no laborable"}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : day ? "Guardar" : "Agregar"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Fecha">
          <TextInput value={date} onChange={setDate} type="date" />
        </Field>
        <Field label="Motivo">
          <TextInput value={name} onChange={setName} placeholder="p. ej. Día de las Madres" />
        </Field>
        <Field label="Tipo" hint="Oficial: descanso obligatorio. Discrecional: decisión de la empresa.">
          <Select
            value={kind}
            onChange={(v) => setKind(v as NonWorkingDay["kind"])}
            options={[
              { value: "official", label: "Oficial" },
              { value: "discretionary", label: "Discrecional" },
            ]}
          />
        </Field>
        <Field label="Notas (opcional)">
          <Textarea value={notes} onChange={setNotes} placeholder="Detalle o referencia" />
        </Field>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}

function AnnualSummary() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(String(thisYear));
  const { data, error } = useResource<AnnualSummaryResponse>(
    `/api/reports/annual-summary?year=${year}`
  );
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-32">
          <Field label="Año">
            <TextInput value={year} onChange={setYear} type="number" />
          </Field>
        </div>
        {data && (
          <p className="text-xs text-zinc-500">
            Jornada completa desde {data.threshold_hours} h · Días no laborables:{" "}
            {data.non_working_days.total} ({data.non_working_days.official} oficiales,{" "}
            {data.non_working_days.discretionary} discrecionales)
          </p>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
        {!data ? (
          <Spinner />
        ) : data.technicians.length === 0 ? (
          <EmptyState title="Sin técnicos activos" />
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 text-left">Técnico</th>
                <th className="px-4 py-3 text-right">Días completos</th>
                <th className="px-4 py-3 text-right">Medias jornadas</th>
                <th className="px-4 py-3 text-right">Días trabajados</th>
                <th className="px-4 py-3 text-right">Horas</th>
                <th className="px-4 py-3 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.technicians.map((t) => (
                <Fragment key={t.id}>
                  <tr className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-medium text-zinc-800">{t.display_name}</td>
                    <td className="px-4 py-3 text-right text-zinc-700">{t.full_days}</td>
                    <td className="px-4 py-3 text-right text-zinc-700">{t.half_days}</td>
                    <td className="px-4 py-3 text-right font-medium text-zinc-800">{t.worked_days}</td>
                    <td className="px-4 py-3 text-right text-zinc-700">{t.total_hours}</td>
                    <td className="px-4 py-3 text-right">
                      <SecondaryButton
                        onClick={() => setOpen(open === t.id ? null : t.id)}
                        className="px-2 py-1 text-xs"
                      >
                        {open === t.id ? "Ocultar" : "Ver meses"}
                      </SecondaryButton>
                    </td>
                  </tr>
                  {open === t.id && (
                    <tr className="bg-zinc-50/60">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                          {t.months.map((m) => (
                            <div
                              key={m.month}
                              className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs"
                            >
                              <span className="font-medium text-zinc-700">
                                {MONTH_NAMES[m.month - 1]}
                              </span>
                              <span className="ml-1 text-zinc-500">
                                {m.full_days} + {m.half_days}½ · {m.hours} h
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
