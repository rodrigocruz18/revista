"use client";

import { cn } from "@/lib/utils";

export type ToolPanelItem = {
  id: string;
  label: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export type ToolPanelProps = {
  open: boolean;
  onClose: () => void;
  items: ToolPanelItem[];
};

export function ToolPanel({ open, onClose, items }: ToolPanelProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-sm rounded-t-2xl border border-white/10 bg-[#141613] p-2 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2">
          <h2 className="font-serif text-xs uppercase tracking-widest text-white/50">
            Herramientas de lectura
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1 p-1 sm:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                item.onClick();
                onClose();
              }}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 text-xs text-white/80 transition hover:bg-white/10 disabled:opacity-30",
                item.active && "bg-lime-300/15 text-lime-300",
              )}
            >
              <span className="text-xl" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
