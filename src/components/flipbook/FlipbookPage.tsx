"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import type { PdfDocumentManager } from "@/lib/pdf";

export type FlipbookPageProps = {
  number: number;
  totalPages: number;
  manager: PdfDocumentManager;
  scale: number;
  /** Only pages inside the active render window actually rasterize. */
  shouldRender: boolean;
};

/**
 * A single page slot inside the flipbook. react-pageflip clones/measures its
 * children directly, so this must forward its ref straight to the outer DOM
 * node (see react-pageflip's "Advanced Usage" pattern).
 */
export const FlipbookPage = forwardRef<HTMLDivElement, FlipbookPageProps>(
  function FlipbookPage({ number, totalPages, manager, scale, shouldRender }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

    useEffect(() => {
      if (!shouldRender) return;
      let cancelled = false;
      setStatus("loading");

      manager
        .renderPage(number, scale)
        .then((result) => {
          if (cancelled) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext("2d");
          canvas.width = result.width;
          canvas.height = result.height;
          ctx?.drawImage(result.canvas, 0, 0);
          setStatus("ready");
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });

      return () => {
        cancelled = true;
      };
    }, [manager, number, scale, shouldRender]);

    return (
      <div className="page" ref={ref} data-page-number={number}>
        <div className="relative h-full w-full overflow-hidden bg-[#f6f3ea] shadow-inner">
          {status !== "ready" && (
            <div className="absolute inset-0 flex animate-pulse items-center justify-center bg-[#efece2]">
              <span className="font-serif text-sm tracking-wide text-black/30">{number}</span>
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#efece2] text-center text-xs text-black/50">
              No se pudo cargar la pagina {number}
            </div>
          )}
          <canvas ref={canvasRef} className="h-full w-full select-none" />
          <div className="pointer-events-none absolute bottom-1.5 right-2 select-none font-sans text-[10px] tracking-wide text-black/30">
            {number} / {totalPages}
          </div>
        </div>
      </div>
    );
  },
);
