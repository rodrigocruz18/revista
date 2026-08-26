"use client";

import { magazineConfig } from "@/config/magazine";

export type PreloaderProps = {
  editionLabel?: string;
  progress?: number; // 0..1
};

/**
 * Shown while the PDF's first pages load. Never a blank white screen —
 * per spec, the brand and the target edition should be visible immediately.
 */
export function Preloader({ editionLabel, progress }: PreloaderProps) {
  const pct = progress != null ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : null;

  return (
    <div className="flex h-full min-h-[60vh] w-full flex-col items-center justify-center gap-4 bg-[#0b0f0d] text-center text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/ace-tenis-logo.png" alt={magazineConfig.name} className="h-10 w-auto sm:h-12" />
      <h1 className="sr-only">{magazineConfig.name}</h1>
      <p className="text-sm text-white/50">Preparando edicion…</p>
      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-lime-300 transition-all duration-300"
          style={{ width: pct != null ? `${pct}%` : "40%" }}
        />
      </div>
      {editionLabel && <p className="font-serif text-xs uppercase tracking-widest text-white/40">{editionLabel}</p>}
    </div>
  );
}
