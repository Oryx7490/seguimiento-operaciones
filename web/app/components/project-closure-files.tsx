"use client";

import { useRef, useState } from "react";
import { fetchJson } from "@/app/lib/client";

type FileType = "delivery_sheet" | "screen_photo" | "technical_file";

interface ProjectFile {
  id: string;
  file_name: string;
  attachment_type?: string;
  size_bytes?: number | null;
}

const SECTIONS: Array<{ type: FileType; title: string; hint: string; accept?: string; multiple: boolean }> = [
  {
    type: "delivery_sheet",
    title: "Hoja de entrega firmada",
    hint: "Adjunta el PDF o la imagen firmada que respalda la recepción.",
    accept: ".pdf,image/*",
    multiple: false,
  },
  {
    type: "screen_photo",
    title: "Fotos de la pantalla",
    hint: "Puedes seleccionar varias fotografías de la pantalla instalada.",
    accept: "image/*",
    multiple: true,
  },
  {
    type: "technical_file",
    title: "Otros archivos técnicos",
    hint: "Planos, configuraciones, versiones de software y otros entregables. Hasta 25 MB por archivo.",
    multiple: true,
  },
];

export default function ProjectClosureFiles({
  projectId,
  attachments,
  selectedDeliverySheetId,
  onDeliverySheetChange,
  onChanged,
}: {
  projectId: string;
  attachments: ProjectFile[];
  selectedDeliverySheetId: string | null;
  onDeliverySheetChange: (id: string | null) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<FileType | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Partial<Record<FileType, HTMLInputElement | null>>>({});

  async function upload(type: FileType, selected: FileList | null) {
    if (!selected?.length) return;
    setBusy(type);
    setError(null);
    try {
      for (const file of Array.from(selected)) {
        const form = new FormData();
        form.append("file", file);
        form.append("project_id", projectId);
        form.append("attachment_type", type);
        const response = await fetch("/api/attachments", { method: "POST", body: form });
        const data = await response.json() as { attachment?: ProjectFile; error?: string };
        if (!response.ok || !data.attachment) throw new Error(data.error || `No se pudo subir ${file.name}`);
        if (type === "delivery_sheet") {
          await fetchJson(`/api/projects/${projectId}`, {
            method: "PATCH",
            body: JSON.stringify({ closure: { delivery_sheet_attachment_id: data.attachment.id } }),
          });
          onDeliverySheetChange(data.attachment.id);
        }
      }
      onChanged();
    } catch (cause) {
      setError(String(cause));
      onChanged();
    } finally {
      setBusy(null);
      if (inputs.current[type]) inputs.current[type]!.value = "";
    }
  }

  async function remove(file: ProjectFile) {
    if (!window.confirm(`¿Eliminar ${file.file_name}?`)) return;
    setBusy(file.id);
    setError(null);
    try {
      await fetchJson(`/api/attachments/${file.id}`, { method: "DELETE" });
      if (file.id === selectedDeliverySheetId) onDeliverySheetChange(null);
      onChanged();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 border-t border-zinc-100 pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Archivos del cierre</h3>
      {SECTIONS.map((section) => {
        const sectionFiles = attachments.filter((file) => file.attachment_type === section.type);
        return (
          <div key={section.type} className="rounded-md border border-zinc-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-zinc-800">{section.title}</h4>
                <p className="mt-0.5 text-xs text-zinc-500">{section.hint}</p>
              </div>
              <input
                ref={(node) => { inputs.current[section.type] = node; }}
                type="file"
                accept={section.accept}
                multiple={section.multiple}
                className="hidden"
                onChange={(event) => void upload(section.type, event.target.files)}
              />
              <button
                type="button"
                onClick={() => inputs.current[section.type]?.click()}
                disabled={busy !== null}
                className="rounded border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {busy === section.type ? "Subiendo…" : "Agregar archivo"}
              </button>
            </div>
            {sectionFiles.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-400">Sin archivos.</p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-100">
                {sectionFiles.map((file) => (
                  <li key={file.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                    <a href={`/api/attachments/${file.id}/download`} className="min-w-0 flex-1 truncate text-blue-700 hover:underline">
                      {file.file_name}
                    </a>
                    {section.type === "delivery_sheet" && file.id === selectedDeliverySheetId && (
                      <span className="text-[11px] font-medium text-emerald-700">Seleccionada para el cierre</span>
                    )}
                    <button
                      type="button"
                      onClick={() => void remove(file)}
                      disabled={busy !== null}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      Eliminar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
