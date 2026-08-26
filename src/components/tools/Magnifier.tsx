"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PdfDocumentManager } from "@/lib/pdf";
import { MAGNIFIER_LEVELS } from "@/config/magazine";
import { clamp, cn } from "@/lib/utils";

export type MagnifierProps = {
  manager: PdfDocumentManager;
  /** The flipbook viewport — pointer tracking and page hit-testing happen inside it. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  baseScale: number;
  zoomLevel: number;
  onZoomLevelChange: (level: number) => void;
  onClose: () => void;
  isTouch: boolean;
};

const LENS_SIZE = 220;
const MAX_HIGH_RES_DIMENSION = 3600;

/**
 * A true optical loupe: it renders a *second*, higher-resolution canvas for
 * whichever page is under the cursor and draws a cropped, scaled-up region
 * of that source into the lens — never a CSS `transform: scale()` on the
 * visible page — so text stays crisp instead of pixelating.
 */
export function Magnifier({
  manager,
  containerRef,
  baseScale,
  zoomLevel,
  onZoomLevelChange,
  onClose,
  isTouch,
}: MagnifierProps) {
  const lensCanvasRef = useRef<HTMLCanvasElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const dragging = useRef(false);
  const highResCache = useRef(new Map<number, HTMLCanvasElement>());

  const drawLens = useCallback(
    async (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return;

      const pageEl = document
        .elementsFromPoint(clientX, clientY)
        .find((el) => el instanceof HTMLElement && el.dataset.pageNumber) as
        | HTMLElement
        | undefined;
      if (!pageEl) return;

      const pageNumber = Number(pageEl.dataset.pageNumber);
      const rect = pageEl.getBoundingClientRect();
      const fx = clamp((clientX - rect.left) / rect.width, 0, 1);
      const fy = clamp((clientY - rect.top) / rect.height, 0, 1);

      let hiRes = highResCache.current.get(pageNumber * 100 + zoomLevel);
      if (!hiRes) {
        const base = await manager.getViewportSize(pageNumber, 1);
        let targetScale = baseScale * zoomLevel;
        const longestSide = Math.max(base.width, base.height) * targetScale;
        if (longestSide > MAX_HIGH_RES_DIMENSION) {
          targetScale *= MAX_HIGH_RES_DIMENSION / longestSide;
        }
        const result = await manager.renderHighRes(pageNumber, targetScale);
        hiRes = result.canvas;
        highResCache.current.set(pageNumber * 100 + zoomLevel, hiRes);
      }

      const lens = lensCanvasRef.current;
      const ctx = lens?.getContext("2d");
      if (!lens || !ctx) return;

      const ratioX = hiRes.width / rect.width;
      const ratioY = hiRes.height / rect.height;
      const cropCss = LENS_SIZE / zoomLevel;
      const cropW = cropCss * ratioX;
      const cropH = cropCss * ratioY;
      const srcX = clamp(fx * hiRes.width - cropW / 2, 0, Math.max(0, hiRes.width - cropW));
      const srcY = clamp(fy * hiRes.height - cropH / 2, 0, Math.max(0, hiRes.height - cropH));

      ctx.clearRect(0, 0, lens.width, lens.height);
      ctx.drawImage(hiRes, srcX, srcY, cropW, cropH, 0, 0, lens.width, lens.height);
    },
    [manager, containerRef, baseScale, zoomLevel],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || isTouch) return;

    function onMove(e: PointerEvent) {
      setPosition({ x: e.clientX, y: e.clientY });
      setVisible(true);
      void drawLens(e.clientX, e.clientY);
    }
    function onLeave() {
      setVisible(false);
    }

    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerleave", onLeave);
    return () => {
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
    };
  }, [containerRef, isTouch, drawLens]);

  // Touch devices: lens starts centered and is dragged manually.
  useEffect(() => {
    if (!isTouch) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const initial = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    setPosition(initial);
    setVisible(true);
    void drawLens(initial.x, initial.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTouch]);

  function onLensPointerDown(e: React.PointerEvent) {
    if (!isTouch) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onLensPointerMove(e: React.PointerEvent) {
    if (!isTouch || !dragging.current) return;
    setPosition({ x: e.clientX, y: e.clientY });
    void drawLens(e.clientX, e.clientY);
  }
  function onLensPointerUp() {
    dragging.current = false;
  }

  if (!position) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-50 transition-opacity",
        visible ? "opacity-100" : "opacity-0",
      )}
      style={{ left: position.x - LENS_SIZE / 2, top: position.y - LENS_SIZE / 2 }}
    >
      <div
        onPointerDown={onLensPointerDown}
        onPointerMove={onLensPointerMove}
        onPointerUp={onLensPointerUp}
        className={cn(
          "relative overflow-hidden rounded-full border-2 border-lime-300/70 shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_20px_45px_-10px_rgba(0,0,0,0.7)]",
          isTouch && "pointer-events-auto",
        )}
        style={{ width: LENS_SIZE, height: LENS_SIZE }}
      >
        <canvas ref={lensCanvasRef} width={LENS_SIZE} height={LENS_SIZE} className="h-full w-full bg-white" />
        <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/40" />
      </div>

      <div className="pointer-events-auto mt-2 flex items-center justify-center gap-1 rounded-full bg-black/80 px-2 py-1 text-xs text-white shadow-lg backdrop-blur">
        {MAGNIFIER_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onZoomLevelChange(level)}
            className={cn(
              "rounded-full px-2 py-0.5 transition",
              level === zoomLevel ? "bg-lime-300 text-black" : "hover:bg-white/15",
            )}
          >
            {level}×
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar lupa"
          className="ml-1 rounded-full px-2 py-0.5 hover:bg-white/15"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
