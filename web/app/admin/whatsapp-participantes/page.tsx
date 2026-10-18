"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { Badge, EmptyState, Field, Modal, PrimaryButton, SecondaryButton, Select, Spinner, TextInput } from "@/app/components/ui";

interface Alias {
  id: string;
  identifier_type: string;
  identifier_value: string;
  category: string;
  label: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_verified: boolean;
  source: string;
}

interface Participant {
  id: string;
  display_name: string;
  company_status: string;
  user_id: string | null;
  user_name: string | null;
  technician_id: string | null;
  technician_name: string | null;
  notes: string | null;
  message_count: number;
  aliases: Alias[];
}

interface UnresolvedSender {
  sender_id: string | null;
  sender_display_name: string | null;
  message_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

const STATUS_LABEL: Record<string, string> = { current: "Actual", former: "Ex", external: "Externo", unclassified: "Sin clasificar" };
const STATUS_STYLE: Record<string, string> = {
  current: "bg-emerald-100 text-emerald-700",
  former: "bg-zinc-100 text-zinc-600",
  external: "bg-sky-100 text-sky-700",
  unclassified: "bg-amber-100 text-amber-700",
};
const CATEGORY_LABEL: Record<string, string> = {
  primary: "Principal",
  permanent_secondary: "Secundario",
  temporary: "Temporal",
  previous: "Anterior",
  identity: "Identidad",
};
const PHONE_CATEGORIES = [
  { value: "primary", label: "Principal" },
  { value: "permanent_secondary", label: "Secundario" },
  { value: "temporary", label: "Temporal" },
  { value: "previous", label: "Anterior" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function WhatsappParticipantsPage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [editing, setEditing] = useState<Participant | "new" | null>(null);
  const [assigning, setAssigning] = useState<UnresolvedSender | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const path = useMemo(() => `/api/whatsapp/participants?limit=100${debounced.trim() ? `&q=${encodeURIComponent(debounced.trim())}` : ""}`, [debounced]);
  const { data, error, reload } = useResource<{ participants: Participant[]; total: number; unresolved_senders: UnresolvedSender[] }>(path);
  const participants = data?.participants ?? [];
  const unresolved = data?.unresolved_senders ?? [];
  const loading = !data && !error;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Contactos de WhatsApp</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Relaciona los números y nombres del grupo con técnicos y usuarios. Un técnico puede tener varios números.
          </p>
        </div>
        <PrimaryButton onClick={() => setEditing("new")}>Nuevo contacto</PrimaryButton>
      </div>

      {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <TextInput value={q} onChange={setQ} placeholder="Buscar por nombre, técnico, usuario o número…" className="w-80" />
        <SecondaryButton onClick={reload}>Recargar</SecondaryButton>
        <span className="text-sm text-zinc-500">{participants.length} de {data?.total ?? 0} contactos</span>
      </div>

      {unresolved.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Remitentes sin identificar ({unresolved.length})</h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40 shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-amber-50 text-xs uppercase tracking-wide text-amber-700">
                <tr>
                  <th className="px-4 py-2 text-left">Número / ID</th>
                  <th className="px-4 py-2 text-left">Nombre en el grupo</th>
                  <th className="px-4 py-2 text-right">Mensajes</th>
                  <th className="px-4 py-2 text-left">Visto</th>
                  <th className="px-4 py-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {unresolved.map((s, i) => (
                  <tr key={`${s.sender_id}-${i}`} className="hover:bg-amber-50">
                    <td className="px-4 py-2 font-medium text-zinc-800">{s.sender_id ?? "—"}</td>
                    <td className="px-4 py-2 text-zinc-600">{s.sender_display_name ?? "—"}</td>
                    <td className="px-4 py-2 text-right text-zinc-600">{s.message_count}</td>
                    <td className="px-4 py-2 text-zinc-500">{fmtDate(s.first_seen_at)} – {fmtDate(s.last_seen_at)}</td>
                    <td className="px-4 py-2 text-right">
                      <SecondaryButton className="px-2 py-1 text-xs" onClick={() => setAssigning(s)}>Asignar</SecondaryButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Contactos</h2>
        <div className="mt-2 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-4"><Spinner /></div>
          ) : participants.length === 0 ? (
            <div className="p-4"><EmptyState title="Sin contactos" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Nombre</th>
                    <th className="px-4 py-2 text-left">Técnico / Usuario</th>
                    <th className="px-4 py-2 text-center">Estado</th>
                    <th className="px-4 py-2 text-left">Números / alias</th>
                    <th className="px-4 py-2 text-right">Mensajes</th>
                    <th className="px-4 py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {participants.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-2 font-medium text-zinc-800">{p.display_name}</td>
                      <td className="px-4 py-2 text-zinc-600">
                        {p.technician_name && <div>Téc. {p.technician_name}</div>}
                        {p.user_name && <div className="text-xs text-zinc-400">Usr. {p.user_name}</div>}
                        {!p.technician_name && !p.user_name && <span className="text-zinc-400">—</span>}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Badge className={STATUS_STYLE[p.company_status] ?? ""}>{STATUS_LABEL[p.company_status] ?? p.company_status}</Badge>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {p.aliases.filter((a) => !a.valid_to).map((a) => (
                            <span key={a.id} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-700" title={`${a.identifier_type} · ${CATEGORY_LABEL[a.category] ?? a.category}`}>
                              {a.identifier_value}
                            </span>
                          ))}
                          {p.aliases.filter((a) => !a.valid_to).length === 0 && <span className="text-zinc-400">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-600">{p.message_count}</td>
                      <td className="px-4 py-2 text-right">
                        <SecondaryButton className="px-2 py-1 text-xs" onClick={() => setEditing(p)}>Editar</SecondaryButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {editing && (
        <ParticipantModal
          participant={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      {assigning && (
        <AssignSenderModal
          sender={assigning}
          participants={participants}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            setAssigning(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

interface AliasDraft {
  key: string;
  identifier_value: string;
  category: string;
}

function ParticipantModal({ participant, onClose, onSaved }: { participant: Participant | null; onClose: () => void; onSaved: () => void }) {
  const techs = useResource<{ technicians: { id: string; display_name: string }[] }>("/api/technicians");
  const users = useResource<{ users: { id: string; name: string; role: string }[] }>("/api/users");

  const [displayName, setDisplayName] = useState(participant?.display_name ?? "");
  const [companyStatus, setCompanyStatus] = useState(participant?.company_status ?? "current");
  const [technicianId, setTechnicianId] = useState(participant?.technician_id ?? "");
  const [userId, setUserId] = useState(participant?.user_id ?? "");
  const [notes, setNotes] = useState(participant?.notes ?? "");
  const [phones, setPhones] = useState<AliasDraft[]>(participant ? [] : [{ key: crypto.randomUUID(), identifier_value: "", category: "primary" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const activeAliases = participant?.aliases.filter((a) => !a.valid_to) ?? [];

  async function addPhoneToExisting() {
    if (!participant) return;
    const value = phones[0]?.identifier_value?.trim();
    if (!value) return;
    setBusy(true);
    setErr(null);
    try {
      await fetchJson(`/api/whatsapp/participants/${participant.id}/aliases`, {
        method: "POST",
        body: JSON.stringify({ identifier_type: "phone", identifier_value: value, category: phones[0].category }),
      });
      setPhones([{ key: crypto.randomUUID(), identifier_value: "", category: "permanent_secondary" }]);
      onSaved();
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  async function expireAlias(alias: Alias) {
    if (!participant) return;
    setBusy(true);
    setErr(null);
    try {
      await fetchJson(`/api/whatsapp/participants/${participant.id}/aliases/${alias.id}`, {
        method: "PATCH",
        body: JSON.stringify({ valid_to: new Date().toISOString() }),
      });
      onSaved();
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  async function submit() {
    if (!displayName.trim()) return setErr("El nombre es obligatorio");
    setBusy(true);
    setErr(null);
    try {
      if (participant) {
        await fetchJson(`/api/whatsapp/participants/${participant.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            display_name: displayName.trim(),
            company_status: companyStatus,
            technician_id: technicianId || null,
            user_id: userId || null,
            notes: notes || null,
          }),
        });
      } else {
        const aliases = phones
          .filter((p) => p.identifier_value.trim())
          .map((p) => ({ identifier_type: "phone", identifier_value: p.identifier_value.trim(), category: p.category }));
        await fetchJson(`/api/whatsapp/participants`, {
          method: "POST",
          body: JSON.stringify({
            display_name: displayName.trim(),
            company_status: companyStatus,
            technician_id: technicianId || null,
            user_id: userId || null,
            notes: notes || null,
            aliases,
          }),
        });
      }
      onSaved();
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={participant ? "Editar contacto" : "Nuevo contacto"}
      mark="W78"
      wide
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={busy}>{busy ? "Guardando…" : "Guardar"}</PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            <TextInput value={displayName} onChange={setDisplayName} placeholder="Nombre del contacto" />
          </Field>
          <Field label="Estado">
            <Select value={companyStatus} onChange={setCompanyStatus} options={[
              { value: "current", label: "Actual" },
              { value: "former", label: "Ex" },
              { value: "external", label: "Externo" },
              { value: "unclassified", label: "Sin clasificar" },
            ]} />
          </Field>
          <Field label="Técnico">
            <Select value={technicianId} onChange={setTechnicianId} placeholder="— ninguno —" options={(techs.data?.technicians ?? []).map((t) => ({ value: t.id, label: t.display_name }))} />
          </Field>
          <Field label="Usuario">
            <Select value={userId} onChange={setUserId} placeholder="— ninguno —" options={(users.data?.users ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.role})` }))} />
          </Field>
        </div>
        <Field label="Notas">
          <TextInput value={notes} onChange={setNotes} placeholder="Notas" />
        </Field>

        {participant ? (
          <div className="rounded-md border border-zinc-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Números / alias</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activeAliases.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-0.5 pl-2 pr-1 text-xs text-zinc-700">
                  {a.identifier_value}
                  <span className="text-[10px] text-zinc-400">{CATEGORY_LABEL[a.category] ?? a.category}</span>
                  <button type="button" disabled={busy} onClick={() => void expireAlias(a)} title="Quitar" className="rounded-full px-1 text-zinc-400 hover:bg-zinc-200 hover:text-rose-600 disabled:opacity-40">×</button>
                </span>
              ))}
              {activeAliases.length === 0 && <span className="text-xs text-zinc-400">Sin alias</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <input
                value={phones[0]?.identifier_value ?? ""}
                onChange={(e) => setPhones([{ key: "new", identifier_value: e.target.value, category: phones[0]?.category ?? "permanent_secondary" }])}
                placeholder="Agregar número"
                className="w-48 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
              <Select value={phones[0]?.category ?? "permanent_secondary"} onChange={(v) => setPhones([{ key: "new", identifier_value: phones[0]?.identifier_value ?? "", category: v }])} options={PHONE_CATEGORIES} className="w-40" />
              <SecondaryButton className="px-2 py-1 text-xs" disabled={busy || !phones[0]?.identifier_value?.trim()} onClick={() => void addPhoneToExisting()}>Agregar número</SecondaryButton>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-zinc-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Números (puedes agregar varios)</p>
            <div className="mt-2 space-y-2">
              {phones.map((p, idx) => (
                <div key={p.key} className="flex flex-wrap items-center gap-2">
                  <input
                    value={p.identifier_value}
                    onChange={(e) => setPhones((s) => s.map((x, i) => (i === idx ? { ...x, identifier_value: e.target.value } : x)))}
                    placeholder="Ej. 5215512345678"
                    className="w-56 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                  <Select value={p.category} onChange={(v) => setPhones((s) => s.map((x, i) => (i === idx ? { ...x, category: v } : x)))} options={PHONE_CATEGORIES} className="w-40" />
                  <button type="button" onClick={() => setPhones((s) => s.filter((_, i) => i !== idx))} className="rounded px-1 text-sm text-zinc-400 hover:text-rose-600">×</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setPhones((s) => [...s, { key: crypto.randomUUID(), identifier_value: "", category: s.length === 0 ? "primary" : "permanent_secondary" }])} className="mt-2 text-xs text-sky-700 hover:underline">+ Agregar otro número</button>
          </div>
        )}

        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}

function AssignSenderModal({
  sender,
  participants,
  onClose,
  onSaved,
}: {
  sender: UnresolvedSender;
  participants: Participant[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [participantId, setParticipantId] = useState("");
  const [newName, setNewName] = useState(sender.sender_display_name ?? "");
  const [category, setCategory] = useState("primary");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const phone = sender.sender_id ?? "";

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      if (mode === "existing") {
        if (!participantId) throw new Error("Selecciona un contacto");
        await fetchJson(`/api/whatsapp/participants/${participantId}/aliases`, {
          method: "POST",
          body: JSON.stringify({ identifier_type: phone ? "phone" : "display_name", identifier_value: phone || (sender.sender_display_name ?? ""), category: phone ? category : "identity" }),
        });
      } else {
        if (!newName.trim()) throw new Error("Indica el nombre del contacto");
        await fetchJson(`/api/whatsapp/participants`, {
          method: "POST",
          body: JSON.stringify({
            display_name: newName.trim(),
            company_status: "current",
            aliases: phone ? [{ identifier_type: "phone", identifier_value: phone, category }] : [],
          }),
        });
      }
      onSaved();
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Asignar remitente"
      wide
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={busy}>{busy ? "Guardando…" : "Asignar"}</PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
          <p className="text-zinc-700"><span className="text-zinc-400">Número/ID:</span> {sender.sender_id ?? "—"}</p>
          <p className="text-zinc-700"><span className="text-zinc-400">Nombre en el grupo:</span> {sender.sender_display_name ?? "—"}</p>
          <p className="text-zinc-500 text-xs">{sender.message_count} mensajes</p>
        </div>

        <div className="flex gap-1">
          {([["existing", "Vincular a un contacto"], ["new", "Crear contacto nuevo"]] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setMode(v)} className={`rounded-md px-3 py-1.5 text-sm transition ${mode === v ? "bg-zinc-900 font-medium text-white" : "text-zinc-600 hover:bg-zinc-100"}`}>{label}</button>
          ))}
        </div>

        {mode === "existing" ? (
          <Field label="Contacto">
            <Select value={participantId} onChange={setParticipantId} placeholder="— elegir —" options={participants.map((p) => ({ value: p.id, label: `${p.display_name}${p.technician_name ? ` · ${p.technician_name}` : ""}` }))} />
          </Field>
        ) : (
          <Field label="Nombre del contacto">
            <TextInput value={newName} onChange={setNewName} placeholder="Nombre" />
          </Field>
        )}

        {phone && (
          <Field label="Categoría del número">
            <Select value={category} onChange={setCategory} options={PHONE_CATEGORIES} />
          </Field>
        )}

        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}
