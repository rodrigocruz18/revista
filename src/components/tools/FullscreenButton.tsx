"use client";

import { cn } from "@/lib/utils";

export type FullscreenButtonProps = {
  isFullscreen: boolean;
  isSupported: boolean;
  onToggle: () => void;
  className?: string;
};

export function FullscreenButton({ isFullscreen, isSupported, onToggle, className }: FullscreenButtonProps) {
  if (!isSupported) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
      title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/90 transition hover:bg-white/15",
        className,
      )}
    >
      {isFullscreen ? "⤡" : "⛶"}
    </button>
  );
}
