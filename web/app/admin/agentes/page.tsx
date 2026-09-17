"use client";

import { useState } from "react";
import { fetchJson, useResource } from "@/app/lib/client";
import { formatDateTime } from "@/app/lib/format";
import {
  Badge,
  DangerButton,
  EmptyState,
  Field,
  Modal,
  PrimaryButton,
  SecondaryButton,
  Spinner,
  TextInput,
} from "@/app/components/ui";

interface TokenRow {
  id: string;
  name: string;
  active: boolean;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by_name: string | null;
}

interface TokensResponse {
  tokens: TokenRow[];
}

export default function AgentTokensPage() {
  const { data, error, reload } = useResource<TokensResponse>("/api/agent-tokens");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tokens = data?.tokens ?? [];

  const createToken = async () => {
    if (!name.trim()) {
      setFormError("Escribe un nombre para identificar el token");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetchJson<{ token: string }>("/api/agent-tokens", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      setNewToken(res.token);
      setName("");
      setCreateOpen(false);
      reload();
    } catch (e) {
      setFormError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: string, tokenName: string) => {
    if (!confirm(`¿Revocar el token "${tokenName}"? El agente dejará de funcionar.`)) return;
    try {
      await fetchJson(`/api/agent-tokens/${id}`, { method: "DELETE" });
      reload();
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    }
  };

  const copyToken = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Agentes CLI</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Tokens para que agentes/CLI creen tickets y proyectos, actualicen actividades y
            consulten los proyectos en marcha. Cada acción queda registrada en el historial como
            &quot;Agente CLI&quot;.
          </p>
        </div>
        <PrimaryButton onClick={() => setCreateOpen(true)}>Nuevo token</PrimaryButton>
      </div>

      <div className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
        <p className="font-medium text-zinc-700">Cómo usarlo</p>
        <p className="mt-1">
          Envía el token en la cabecera{" "}
          <code className="rounded bg-white px-1 py-0.5">Authorization: Bearer ag_...</code> (o{" "}
          <code className="rounded bg-white px-1 py-0.5">x-agent-token</code>).
        </p>
        <ul className="mt-2 space-y-0.5">
          <li>
            <code className="rounded bg-white px-1 py-0.5">GET /api/agent/me</code> — verificar el token
          </li>
          <li>
            <code className="rounded bg-white px-1 py-0.5">POST /api/agent/tickets</code> — crear ticket
          </li>
          <li>
            <code className="rounded bg-white px-1 py-0.5">POST /api/agent/projects</code> — crear proyecto
          </li>
          <li>
            <code className="rounded bg-white px-1 py-0.5">GET /api/agent/projects</code> — proyectos en marcha
          </li>
          <li>
            <code className="rounded bg-white px-1 py-0.5">PATCH /api/agent/activities/&#123;id&#125;</code>{" "}
            — actualizar estado de actividad
          </li>
        </ul>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar los tokens: {error}
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        {!data ? (
          <Spinner className="py-10" />
        ) : tokens.length === 0 ? (
          <EmptyState title="Aún no hay tokens de agente">
            <p>Crea uno para conectar un agente o la CLI.</p>
          </EmptyState>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Creado</th>
                <th className="px-4 py-2 font-medium">Último uso</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {tokens.map((t) => (
                <tr key={t.id} className="text-zinc-700">
                  <td className="px-4 py-2 font-medium text-zinc-900">{t.name}</td>
                  <td className="px-4 py-2">
                    {t.active ? (
                      <Badge className="bg-green-100 text-green-700">Activo</Badge>
                    ) : (
                      <Badge className="bg-zinc-200 text-zinc-600">Revocado</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {formatDateTime(t.created_at)}
                    {t.created_by_name && (
                      <span className="block text-[11px] text-zinc-400">por {t.created_by_name}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {t.last_used_at ? formatDateTime(t.last_used_at) : "Nunca"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {t.active && (
                      <DangerButton onClick={() => revoke(t.id, t.name)}>Revocar</DangerButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nuevo token de agente"
        footer={
          <>
            <SecondaryButton onClick={() => setCreateOpen(false)}>Cancelar</SecondaryButton>
            <PrimaryButton onClick={createToken} disabled={saving}>
              {saving ? "Creando…" : "Crear token"}
            </PrimaryButton>
          </>
        }
      >
        <Field label="Nombre" hint="Ayuda a identificar para qué agente o equipo es el token.">
          <TextInput value={name} onChange={setName} placeholder="p. ej. CLI de soporte" />
        </Field>
        {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
      </Modal>

      <Modal
        open={newToken !== null}
        onClose={() => setNewToken(null)}
        title="Token creado"
        footer={
          <>
            <SecondaryButton onClick={copyToken}>{copied ? "Copiado" : "Copiar token"}</SecondaryButton>
            <PrimaryButton onClick={() => setNewToken(null)}>Listo</PrimaryButton>
          </>
        }
      >
        <p className="text-sm text-zinc-600">
          Cópialo ahora: por seguridad no se volverá a mostrar.
        </p>
        <code className="mt-3 block break-all rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-800">
          {newToken}
        </code>
      </Modal>
    </div>
  );
}
