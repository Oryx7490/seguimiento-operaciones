"use client";

import { useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { formatDateTime } from "@/app/lib/format";
import {
  Badge,
  EmptyState,
  Field,
  Modal,
  PrimaryButton,
  SecondaryButton,
  Select,
  Spinner,
  Textarea,
  TextInput,
} from "@/app/components/ui";

type Tab = "umbrales" | "plantillas" | "registro";

const TABS: { key: Tab; label: string }[] = [
  { key: "umbrales", label: "Umbrales y canales" },
  { key: "plantillas", label: "Plantillas" },
  { key: "registro", label: "Registro de envíos" },
];

const ROLE_OPTIONS = ["technician", "coordinator", "admin"];
const CHANNEL_OPTIONS = ["system", "email", "whatsapp"];
const CHANNEL_LABEL: Record<string, string> = {
  system: "En el sistema",
  email: "Correo",
  whatsapp: "WhatsApp",
};

interface SettingRow {
  key: string;
  value: unknown;
  description: string | null;
}
interface TemplateRow {
  id: string;
  code: string;
  channel: string;
  subject: string | null;
  body: string;
  description: string | null;
  active: boolean;
}
interface DeliveryRow {
  id: string;
  channel: string;
  provider: string | null;
  provider_message_id: string | null;
  status: string;
  error_message: string | null;
  attempted_at: string;
  template: string | null;
  title: string | null;
  entity_type: string | null;
  entity_id: string | null;
  recipient_name: string;
  recipient_email: string;
}

export default function AdminNotificationsPage() {
  const [tab, setTab] = useState<Tab>("umbrales");
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function scan() {
    setBusy(true);
    setScanMsg(null);
    try {
      const r = await fetchJson<{ alerts: number; delivered: { sent: number; failed: number } }>(
        "/api/notifications/scan",
        { method: "POST" }
      );
      setScanMsg(
        `Avisos nuevos: ${r.alerts} · Enviados: ${r.delivered.sent} · Fallidos: ${r.delivered.failed}`
      );
    } catch (e) {
      setScanMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Alertas y notificaciones</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Umbrales configurables, plantillas por canal y bitácora de envíos.
          </p>
        </div>
        <SecondaryButton onClick={scan} disabled={busy}>
          {busy ? "…" : "Generar alertas ahora"}
        </SecondaryButton>
      </div>

      {scanMsg && (
        <div className="mt-4 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
          {scanMsg}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-t-md px-3 py-2 text-sm font-medium ${
              tab === t.key
                ? "border border-b-0 border-zinc-200 bg-white text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "umbrales" && <SettingsTab />}
        {tab === "plantillas" && <TemplatesTab />}
        {tab === "registro" && <DeliveriesTab />}
      </div>
    </div>
  );
}

/* ── Umbrales y canales ─────────────────────────────────── */

function SettingsTab() {
  const { data, error, reload } = useResource<{ settings: SettingRow[] }>("/api/settings");
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const value = (key: string): unknown => (key in draft ? draft[key] : data?.settings.find((s) => s.key === key)?.value);

  function set(key: string, v: unknown) {
    setDraft((d) => ({ ...d, [key]: v }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await fetchJson("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ values: draft }),
      });
      setDraft({});
      setMsg("Umbrales guardados.");
      reload();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setSaving(false);
    }
  }

  function toggleInArray(key: string, item: string) {
    const current = (value(key) as string[]) ?? [];
    set(key, current.includes(item) ? current.filter((x) => x !== item) : [...current, item]);
  }

  if (!data && !error) return <Spinner />;
  if (error) return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>;

  const byKey = new Map(data!.settings.map((s) => [s.key, s]));
  const row = (key: string) => byKey.get(key);

  const numberFields: [string, string, string][] = [
    ["alert_ticket_unassigned_hours", "Ticket sin responsable (horas)", "Tiempo sin responsable antes de alertar."],
    ["alert_ticket_no_update_days", "Ticket sin actualización (días)", "Días sin cambios antes de alertar."],
    ["alert_project_blocked_no_next_action_hours", "Proyecto bloqueado sin próxima acción (horas)", "Horas desde el bloqueo."],
    ["alert_installation_no_delivery_sheet_days", "Instalación sin hoja firmada (días)", "Días desde el fin de instalación."],
    ["alert_ticket_resolved_unvalidated_days", "Resolución sin validar (días)", "Días de un ticket resuelto sin validación."],
    ["alert_hours_over_planned_percent", "Horas sobre planeadas (%)", "Exceso de horas reales sobre planeadas."],
    ["alert_cooldown_hours", "Enfriamiento entre alertas (horas)", "Evita repetir la misma alerta."],
  ];
  const boolFields: [string, string][] = [
    ["alert_activity_overdue_enabled", "Alertar actividades vencidas"],
    ["alert_next_action_overdue_enabled", "Alertar próximas acciones vencidas"],
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-700">Umbrales</h2>
        <p className="mt-1 text-xs text-zinc-400">Estos valores no están en el código: se leen en cada escaneo.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {numberFields.map(([key, label, hint]) => {
            const r = row(key);
            if (!r) return null;
            return (
              <Field key={key} label={label} hint={hint}>
                <TextInput
                  type="number"
                  value={String(value(key) ?? "")}
                  onChange={(v) => set(key, v === "" ? null : Number(v))}
                />
              </Field>
            );
          })}
        </div>
        <div className="mt-4 space-y-2">
          {boolFields.map(([key, label]) => {
            const r = row(key);
            if (!r) return null;
            return (
              <label key={key} className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={Boolean(value(key))}
                  onChange={(e) => set(key, e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                {label}
              </label>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-700">Canales y destinatarios</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-zinc-600">Canales activos</p>
            <p className="mb-2 text-[11px] text-zinc-400">WhatsApp queda apagado si no configuras credenciales.</p>
            <div className="space-y-2">
              {CHANNEL_OPTIONS.map((ch) => (
                <label key={ch} className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={((value("alert_channels") as string[]) ?? []).includes(ch)}
                    onChange={() => toggleInArray("alert_channels", ch)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  {CHANNEL_LABEL[ch]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-600">Roles que reciben alertas</p>
            <p className="mb-2 text-[11px] text-zinc-400">Además del coordinador del proyecto o ticket.</p>
            <div className="space-y-2">
              {ROLE_OPTIONS.map((role) => (
                <label key={role} className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={((value("alert_recipient_roles") as string[]) ?? []).includes(role)}
                    onChange={() => toggleInArray("alert_recipient_roles", role)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  {role}
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <PrimaryButton onClick={save} disabled={saving || Object.keys(draft).length === 0}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </PrimaryButton>
        {msg && <span className="text-xs text-zinc-500">{msg}</span>}
      </div>
    </div>
  );
}

/* ── Plantillas ─────────────────────────────────────────── */

function TemplatesTab() {
  const { data, error, reload } = useResource<{ templates: TemplateRow[] }>("/api/notification-templates");
  const [editing, setEditing] = useState<TemplateRow | null>(null);

  if (!data && !error) return <Spinner />;
  if (error) return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>;

  const groups = new Map<string, TemplateRow[]>();
  for (const t of data!.templates) {
    const arr = groups.get(t.code) ?? [];
    arr.push(t);
    groups.set(t.code, arr);
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([code, list]) => (
        <section key={code} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs font-semibold text-zinc-700">{code}</h3>
            <span className="text-[11px] text-zinc-400">{list[0]?.description}</span>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {list.map((t) => (
              <div key={t.id} className="rounded-md border border-zinc-100 bg-zinc-50 p-3">
                <div className="flex items-center justify-between">
                  <Badge className="bg-white text-zinc-600">{CHANNEL_LABEL[t.channel] ?? t.channel}</Badge>
                  {!t.active && <Badge className="bg-zinc-200 text-zinc-500">Inactiva</Badge>}
                </div>
                {t.subject && <p className="mt-2 text-xs font-medium text-zinc-700">{t.subject}</p>}
                <p className="mt-1 whitespace-pre-wrap text-[11px] text-zinc-500">{t.body}</p>
                <div className="mt-3">
                  <SecondaryButton onClick={() => setEditing(t)} className="px-2 py-1 text-xs">
                    Editar
                  </SecondaryButton>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {editing && (
        <TemplateModal
          key={`${editing.code}-${editing.channel}`}
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function TemplateModal({
  template,
  onClose,
  onSaved,
}: {
  template: TemplateRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState(template.subject ?? "");
  const [body, setBody] = useState(template.body);
  const [active, setActive] = useState(template.active);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await fetchJson("/api/notification-templates", {
        method: "PATCH",
        body: JSON.stringify({ code: template.code, channel: template.channel, subject, body, active }),
      });
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`${template.code} · ${CHANNEL_LABEL[template.channel] ?? template.channel}`}
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Asunto (solo correo)">
          <TextInput value={subject} onChange={setSubject} placeholder="Asunto del correo" />
        </Field>
        <Field
          label="Cuerpo"
          hint="Variables: {{code}}, {{title}}, {{name}}, {{days}}, {{hours}}, {{percent}}, {{date}}, {{link}}"
        >
          <Textarea value={body} onChange={setBody} rows={6} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Plantilla activa
        </label>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}

/* ── Registro de envíos ─────────────────────────────────── */

function DeliveriesTab() {
  const { data, error } = useResource<{ deliveries: DeliveryRow[] }>("/api/notification-deliveries");
  const [filter, setFilter] = useState("");

  if (!data && !error) return <Spinner />;
  if (error) return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>;

  const list = data!.deliveries.filter((d) => !filter || d.channel === filter);
  if (list.length === 0) return <EmptyState title="Sin envíos registrados">Aún no se ha enviado ningún correo o mensaje.</EmptyState>;

  return (
    <div>
      <div className="mb-3 w-56">
        <Select
          value={filter}
          onChange={setFilter}
          options={CHANNEL_OPTIONS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
          placeholder="Todos los canales"
        />
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Plantilla</th>
              <th className="px-3 py-2 text-left">Canal</th>
              <th className="px-3 py-2 text-left">Destinatario</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-left">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {list.map((d) => (
              <tr key={d.id} className="hover:bg-zinc-50">
                <td className="whitespace-nowrap px-3 py-2 text-zinc-500">{formatDateTime(d.attempted_at)}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-zinc-600">{d.template}</td>
                <td className="px-3 py-2">{CHANNEL_LABEL[d.channel] ?? d.channel}</td>
                <td className="px-3 py-2 text-zinc-600">{d.recipient_name}</td>
                <td className="px-3 py-2">
                  {d.status === "sent" ? (
                    <Badge className="bg-emerald-100 text-emerald-700">Enviado</Badge>
                  ) : (
                    <Badge className="bg-rose-100 text-rose-700">Fallido</Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-[11px] text-zinc-500">{d.error_message ?? d.provider ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
