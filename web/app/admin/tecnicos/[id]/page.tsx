"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { useResource } from "@/app/lib/client";
import { formatDateTime } from "@/app/lib/format";
import {
  Badge,
  DangerButton,
  EmptyState,
  Field,
  PrimaryButton,
  SecondaryButton,
  Select,
  Spinner,
  Textarea,
} from "@/app/components/ui";
import type {
  TechnicianDetailResponse,
  TechnicianSpecialtyAssignment,
} from "@/app/lib/types";

const DOC_TYPES: { value: string; label: string }[] = [
  { value: "ine", label: "INE" },
  { value: "passport", label: "Pasaporte" },
  { value: "curp", label: "CURP" },
  { value: "proof_address", label: "Comprobante de domicilio" },
  { value: "contract", label: "Contrato" },
  { value: "nss", label: "NSS" },
  { value: "other", label: "Otro" },
];

const DOC_LABEL: Record<string, string> = Object.fromEntries(
  DOC_TYPES.map((d) => [d.value, d.label])
);

export default function TechnicianFilePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data, error, reload } = useResource<TechnicianDetailResponse>(`/api/technicians/${id}`);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("ine");
  const [notes, setNotes] = useState("");

  const t = data?.technician;
  const specialties = data?.specialties ?? [];
  const documents = data?.documents ?? [];

  const approved = specialties.filter((s) => s.status === "approved");
  const pending = specialties.filter((s) => s.status === "pending");

  const review = async (s: TechnicianSpecialtyAssignment, status: "approved") => {
    await fetch(`/api/technicians/${id}/specialties`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specialty_id: s.specialty_id, status }),
    });
    reload();
  };

  const removeSkill = async (s: TechnicianSpecialtyAssignment) => {
    if (!confirm(`¿Quitar "${s.name}" del perfil?`)) return;
    await fetch(`/api/technicians/${id}/specialties?specialty_id=${s.specialty_id}`, {
      method: "DELETE",
    });
    reload();
  };

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setUploadError("Selecciona un archivo");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.set("technician_id", id);
      form.set("doc_type", docType);
      form.set("file", file);
      if (notes.trim()) form.set("notes", notes.trim());
      const res = await fetch("/api/technician-documents", { method: "POST", body: form });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `HTTP ${res.status}`);
      }
      if (fileRef.current) fileRef.current.value = "";
      setNotes("");
      reload();
    } catch (e) {
      setUploadError(String(e instanceof Error ? e.message : e));
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (docId: string, name: string) => {
    if (!confirm(`¿Eliminar "${name}" del expediente?`)) return;
    await fetch(`/api/technician-documents/${docId}`, { method: "DELETE" });
    reload();
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar el expediente: {error}
        </div>
      </div>
    );
  }

  if (!t) {
    return (
      <div className="p-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/tecnicos" className="text-xs text-zinc-500 hover:text-zinc-800">
            ← Técnicos
          </Link>
          <h1 className="text-xl font-semibold text-zinc-900">{t.display_name}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {t.email ?? (t.username ? `@${t.username}` : "sin correo")} · Expediente confidencial
          </p>
        </div>
        <div className="flex items-center gap-2">
          {t.technician_active && t.user_active ? (
            <Badge className="bg-emerald-100 text-emerald-700">Activo</Badge>
          ) : (
            <Badge className="bg-zinc-200 text-zinc-600">Inactivo</Badge>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-700">Datos personales</h2>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Info label="CURP" value={t.curp} />
            <Info label="NSS" value={t.nss} />
            <Info label="Teléfono" value={t.phone} />
            <Info label="Zona horaria" value={t.timezone} />
            <Info label="Dirección" value={t.address} full />
            <Info label="Contacto de emergencia" value={t.emergency_contact_name} />
            <Info label="Teléfono de emergencia" value={t.emergency_contact_phone} />
          </dl>
          {t.admin_notes && (
            <div className="mt-3 rounded-md bg-zinc-50 p-3 text-sm text-zinc-600">
              <p className="text-xs font-medium text-zinc-500">Notas internas</p>
              <p className="mt-1 whitespace-pre-wrap">{t.admin_notes}</p>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-700">Habilidades</h2>
          {approved.length === 0 && pending.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">Sin habilidades registradas.</p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {approved.map((s) => (
                  <span
                    key={s.specialty_id}
                    className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700"
                  >
                    {s.name}
                    <button
                      type="button"
                      onClick={() => removeSkill(s)}
                      className="text-zinc-400 hover:text-red-600"
                      aria-label={`Quitar ${s.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {approved.length === 0 && <span className="text-xs text-zinc-400">Ninguna aprobada.</span>}
              </div>
              {pending.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-amber-700">Por aprobar</p>
                  <ul className="mt-2 space-y-2">
                    {pending.map((s) => (
                      <li
                        key={s.specialty_id}
                        className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                      >
                        <span className="text-amber-800">{s.name}</span>
                        <div className="flex gap-2">
                          <PrimaryButton onClick={() => review(s, "approved")}>Aprobar</PrimaryButton>
                          <SecondaryButton onClick={() => removeSkill(s)}>Rechazar</SecondaryButton>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <section className="mt-5 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-700">Documentos del expediente</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Confidencial: el técnico no puede ver esta sección. Se guardan en el almacenamiento
          interno.
        </p>

        <div className="mt-3 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label="Tipo de documento">
            <Select
              value={docType}
              onChange={setDocType}
              options={DOC_TYPES}
            />
          </Field>
          <Field label="Archivo">
            <input
              ref={fileRef}
              type="file"
              className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-700 file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-xs"
            />
          </Field>
          <PrimaryButton onClick={upload} disabled={uploading}>
            {uploading ? "Subiendo…" : "Subir"}
          </PrimaryButton>
        </div>
        <div className="mt-2">
          <Textarea value={notes} onChange={setNotes} placeholder="Notas del documento (opcional)" />
        </div>
        {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}

        <div className="mt-4 overflow-hidden rounded-md border border-zinc-200">
          {documents.length === 0 ? (
            <EmptyState title="Sin documentos en el expediente" />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Archivo</th>
                  <th className="px-3 py-2 font-medium">Notas</th>
                  <th className="px-3 py-2 font-medium">Subido</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2 text-zinc-700">{DOC_LABEL[d.doc_type] ?? d.doc_type}</td>
                    <td className="px-3 py-2">
                      <a
                        href={`/api/technician-documents/${d.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {d.file_name}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-zinc-500">{d.notes ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-500">
                      {formatDateTime(d.created_at)}
                      {d.uploaded_by_name && (
                        <span className="block text-[11px] text-zinc-400">por {d.uploaded_by_name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <DangerButton onClick={() => deleteDoc(d.id, d.file_name)} className="px-2 py-1 text-xs">
                        Eliminar
                      </DangerButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function Info({ label, value, full = false }: { label: string; value: string | null; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</dt>
      <dd className="text-zinc-800">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}
