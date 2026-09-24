"use client";

import { useState } from "react";

export interface ColumnDef {
  key: string;
  label: string;
}

export function ColumnSelector({
  columns,
  visible,
  onToggle,
}: {
  columns: readonly ColumnDef[];
  visible: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        Columnas
      </button>
      {open && (
        <div
          className="absolute right-0 z-50 mt-1 min-w-[160px] rounded-md border border-zinc-200 bg-white py-1 shadow-lg"
          role="menu"
        >
          {columns.map((col) => (
            <label
              key={col.key}
              onMouseDown={(e) => e.preventDefault()}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              <input
                type="checkbox"
                checked={Boolean(visible[col.key])}
                onChange={() => onToggle(col.key)}
                className="h-4 w-4 accent-zinc-900"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}