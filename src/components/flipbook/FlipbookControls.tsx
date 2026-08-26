"use client";

import { cn } from "@/lib/utils";

export type FlipbookControlsProps = {
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
};

export function FlipbookControls({
  currentPage,
  totalPages,
  onPrev,
  onNext,
  className,
}: FlipbookControlsProps) {
  return (
    <div className={cn("flex items-center gap-4 font-serif text-sm text-white/90", className)}>
      <button
        type="button"
        onClick={onPrev}
        disabled={currentPage <= 1}
        aria-label="Pagina anterior"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg transition hover:bg-white/15 disabled:opacity-30"
      >
        ‹
      </button>
      <span className="tabular-nums tracking-wide text-white/70">
        {currentPage} / {totalPages}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={currentPage >= totalPages}
        aria-label="Pagina siguiente"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg transition hover:bg-white/15 disabled:opacity-30"
      >
        ›
      </button>
    </div>
  );
}
