"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/app/lib/client";
import { formatDateTime } from "@/app/lib/format";
import {
  Field,
  Modal,
  PrimaryButton,
  SecondaryButton,
  Textarea,
} from "@/app/components/ui";
import type { Comment } from "@/app/lib/types";

export default function CommentSection({
  kind,
  entityId,
  comments,
  onSaved,
}: {
  kind: "project" | "ticket";
  entityId: string;
  comments: Comment[];
  onSaved: () => void;
}) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Comment | null>(null);
  const [editBody, setEditBody] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ user: { id: string } }>("/api/me")
      .then((r) => {
        if (!cancelled) setCurrentUserId(r.user.id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    if (!body.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await fetchJson("/api/comments", {
        method: "POST",
        body: JSON.stringify({ [`${kind}_id`]: entityId, body }),
      });
      setBody("");
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit() {
    if (!editing || !editBody.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await fetchJson(`/api/comments/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body: editBody }),
      });
      setEditing(null);
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-800">Comentarios</h2>

      {comments.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">Sin comentarios.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {comments.map((c) => {
            const isOwner = currentUserId != null && c.author_id === currentUserId;
            const edited = c.updated_at !== c.created_at;
            return (
              <li key={c.id} className="rounded-md border border-zinc-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-700">{c.author_name}</p>
                  {isOwner && (
                    <SecondaryButton
                      className="px-2 py-0.5 text-[11px]"
                      onClick={() => {
                        setEditing(c);
                        setEditBody(c.body);
                      }}
                    >
                      Editar
                    </SecondaryButton>
                  )}
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap text-zinc-600">{c.body}</p>
                <p className="mt-1 text-[11px] text-zinc-400">
                  {formatDateTime(c.created_at)}
                  {edited && <span className="ml-1">· editado {formatDateTime(c.updated_at)}</span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3">
        <Textarea value={body} onChange={setBody} rows={2} placeholder="Añadir comentario…" />
        <div className="mt-2 flex items-center gap-3">
          <PrimaryButton onClick={submit} disabled={saving || !body.trim()}>
            {saving ? "Publicando…" : "Publicar"}
          </PrimaryButton>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      </div>

      {editing && (
        <Modal
          open={true}
          onClose={() => setEditing(null)}
          title="Editar comentario"
          footer={
            <>
              <SecondaryButton onClick={() => setEditing(null)}>Cancelar</SecondaryButton>
              <PrimaryButton onClick={submitEdit} disabled={saving || !editBody.trim()}>
                {saving ? "Guardando…" : "Guardar"}
              </PrimaryButton>
            </>
          }
        >
          <Field label="Comentario">
            <Textarea value={editBody} onChange={setEditBody} rows={4} />
          </Field>
        </Modal>
      )}
    </section>
  );
}