"use client";

import { ZOOM_LEVELS } from "@/config/magazine";
import { cn } from "@/lib/utils";

export type ZoomControlsProps = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  className?: string;
};

export function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset, className }: ZoomControlsProps) {
  const min = ZOOM_LEVELS[0];
  const max = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

  return (
    <div className={cn("flex items-center gap-2 text-white/90", className)}>
      <button
        type="button"
        onClick={onZoomOut}
        disabled={zoom <= min}
        aria-label="Alejar"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 transition hover:bg-white/15 disabled:opacity-30"
      >
        −
      </button>
      <button
        type="button"
        onClick={onReset}
        className="w-14 rounded-full border border-white/10 bg-white/5 py-1 text-center text-xs tabular-nums transition hover:bg-white/15"
        title="Restablecer zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        disabled={zoom >= max}
        aria-label="Acercar"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 transition hover:bg-white/15 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
