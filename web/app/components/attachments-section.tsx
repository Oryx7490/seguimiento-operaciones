"use client";

import { useRef, useState } from "react";
import { fetchJson } from "@/app/lib/client";
import { formatDateTime } from "@/app/lib/format";
import { Badge, SecondaryButton } from "@/app/components/ui";

type AttType =
  | "delivery_sheet"
  | "photo"
  | "quote"
  | "evidence"
  | "digital_signature"
  | "finiquito"
  | "fiscal_complement"
  | "other";

interface AttachmentRow {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes?: number | null;
  attachment_type?: string;
  uploaded_by_name: string | null;
  created_at: string;
}

const TYPE_LABEL: Record<AttType, string> = {
  delivery_sheet: "Hoja de entrega",
  photo: "Foto",
  quote: "Cotización",
  evidence: "Evidencia",
  digital_signature: "Firma digital",
  finiquito: "Finiquito",
  fiscal_complement: "Complemento fiscal",
  other: "Otro",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadFetch(url: string, form: FormData) {
  const res = await fetch(url, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return data;
}

export default function AttachmentsSection({
  projectId,
  ticketId,
  initial,
  onChanged,
}: {
  projectId?: string;
  ticketId?: string;
  initial: AttachmentRow[];
  onChanged?: () => void;
}) {
  const [list, setList] = useState<AttachmentRow[]>(initial);
  const [type, setType] = useState<AttType>("other");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setErr(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("attachment_type", type);
      if (projectId) form.append("project_id", projectId);
      if (ticketId) form.append("ticket_id", ticketId);
      const data = (await uploadFetch("/api/attachments", form)) as { attachment: AttachmentRow };
      setList((prev) => [data.attachment, ...prev]);
      onChanged?.();
    } catch (e) {
      setErr(String(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: string) {
    if (!window.confirm("¿Eliminar este adjunto?")) return;
    setBusy(id);
    setErr(null);
    try {
      await fetchJson(`/api/attachments/${id}`, { method: "DELETE" });
      setList((prev) => prev.filter((a) => a.id !== id));
      onChanged?.();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <header className="border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-800">Adjuntos</h2>
      </header>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-zinc-500">Tipo:</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AttType)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800"
          >
            {(Object.keys(TYPE_LABEL) as AttType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <SecondaryButton onClick={() => inputRef.current?.click()} disabled={uploading} className="px-3 py-1.5 text-xs">
            {uploading ? "Subiendo…" : "Subir archivo"}
          </SecondaryButton>
          {err && <span className="text-[11px] text-red-600">{err}</span>}
        </div>

        {list.length === 0 ? (
          <p className="text-sm text-zinc-400">Sin adjuntos todavía.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-100">
            {list.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_BG[(a.attachment_type ?? "other") as AttType] ?? "bg-zinc-300"}`} />
                <Badge className="bg-zinc-100 text-zinc-600">{TYPE_LABEL[(a.attachment_type ?? "other") as AttType]}</Badge>
                <a
                  href={`/api/attachments/${a.id}/download`}
                  className="inline-flex max-w-[280px] items-center gap-1 truncate text-sm font-medium text-zinc-800 hover:underline"
                >
                  <svg className="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                    <path d="M8 2v8M5 7l3 3 3-3M2.5 13h11" />
                  </svg>
                  <span className="truncate">{a.file_name}</span>
                </a>
                <span className="text-[11px] text-zinc-400">
                  {a.size_bytes != null ? formatBytes(a.size_bytes) : ""}
                  {a.uploaded_by_name ? ` · ${a.uploaded_by_name}` : ""} · {formatDateTime(a.created_at)}
                </span>
                <button
                  type="button"
                  onClick={() => void remove(a.id)}
                  disabled={busy === a.id}
                  className="ml-auto rounded-md px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {busy === a.id ? "Eliminando…" : "Eliminar"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const TONE_BG: Partial<Record<AttType, string>> = {
  delivery_sheet: "bg-emerald-400",
  digital_signature: "bg-violet-400",
  finiquito: "bg-sky-400",
  fiscal_complement: "bg-amber-400",
  photo: "bg-rose-400",
  quote: "bg-orange-400",
  evidence: "bg-teal-400",
};