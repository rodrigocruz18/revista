"use client";

import { useEffect, useRef, useState } from "react";
import type { PdfDocumentManager } from "@/lib/pdf";
import { cn } from "@/lib/utils";

export type ThumbnailPanelProps = {
  manager: PdfDocumentManager;
  pageCount: number;
  currentPage: number;
  open: boolean;
  onClose: () => void;
  onSelect: (page: number) => void;
  favoritePages: number[];
};

function Thumbnail({
  manager,
  page,
  active,
  favorite,
  onSelect,
}: {
  manager: PdfDocumentManager;
  page: number;
  active: boolean;
  favorite: boolean;
  onSelect: (page: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          manager.renderThumbnail(page).then((result) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width = result.width;
            canvas.height = result.height;
            canvas.getContext("2d")?.drawImage(result.canvas, 0, 0);
            setLoaded(true);
          });
          observer.disconnect();
        }
      },
      { root: el.closest("[data-thumb-scroll]"), rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [manager, page]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onSelect(page)}
      className={cn(
        "group relative aspect-[3/4] overflow-hidden rounded-md border bg-[#efece2] transition",
        active ? "border-lime-300 ring-2 ring-lime-300/60" : "border-black/10 hover:border-black/30",
      )}
    >
      {!loaded && (
        <div className="absolute inset-0 flex animate-pulse items-center justify-center text-[10px] text-black/30">
          {page}
        </div>
      )}
      <canvas ref={canvasRef} className="h-full w-full" />
      {favorite && (
        <span className="absolute right-1 top-1 text-xs drop-shadow" aria-hidden>
          🔖
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-black/50 py-0.5 text-center text-[10px] text-white">
        {page}
      </span>
    </button>
  );
}

export function ThumbnailPanel({
  manager,
  pageCount,
  currentPage,
  open,
  onClose,
  onSelect,
  favoritePages,
}: ThumbnailPanelProps) {
  if (!open) return null;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-sm flex-col bg-[#141613] shadow-2xl sm:w-96"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="font-serif text-sm tracking-wide text-white">Miniaturas</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar miniaturas"
            className="rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div data-thumb-scroll className="grid flex-1 grid-cols-3 gap-2 overflow-y-auto p-3 sm:grid-cols-4">
          {pages.map((page) => (
            <Thumbnail
              key={page}
              manager={manager}
              page={page}
              active={page === currentPage}
              favorite={favoritePages.includes(page)}
              onSelect={(p) => {
                onSelect(p);
                onClose();
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
