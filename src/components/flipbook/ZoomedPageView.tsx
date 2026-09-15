"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PdfDocumentManager } from "@/lib/pdf";
import type { Sponsor } from "@/types/sponsor";
import { ZOOM_MAX, ZOOM_MIN } from "@/config/magazine";
import { clamp } from "@/lib/utils";

export type ZoomedPageViewProps = {
  manager: PdfDocumentManager;
  pageNumber: number;
  totalPages: number;
  /** Set when the reader zoomed into a full-page sponsor slot rather than a
   * real PDF page — shows the sponsor's own image (cropped to the page's
   * aspect ratio with `object-cover`, matching how it's cropped on the
   * actual flipbook page) instead of rendering a PDF page, but shares every
   * bit of the fit/zoom/pan/centering behavior below, so a sponsor slot
   * zooms exactly like any other page. `pageNumber`/`totalPages` are simply
   * ignored while this is set. */
  sponsor?: Sponsor | null;
  zoom: number;
  /** PDF page size (any consistent unit — only the aspect ratio matters). */
  baseWidth: number;
  baseHeight: number;
  onZoomChange: (nextZoom: number) => void;
  onReset: () => void;
};

// Rendered once per page at a fixed, fairly high resolution so the bitmap
// stays crisp all the way up to ZOOM_MAX — every zoom change afterwards just
// resizes how large that bitmap is drawn (see displayWidth/displayHeight
// below), not a fresh PDF.js render. Re-rendering on every wheel tick (the
// old approach) is what made zooming feel laggy; resizing an existing
// bitmap is instant.
const RENDER_SCALE = 3;

// Mouse-wheel zoom sensitivity — matches the feel previously hardcoded in
// Reader.tsx's global wheel listener (kept identical so the transition from
// flipbook-zoom into this view doesn't feel like a speed change).
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

/** How far `offset` may push the content off of dead-center before its
 * near edge would pull in from the container's edge, leaving a gap. Zero
 * (and `offset` gets clamped to exactly zero) whenever the content already
 * fits inside `container` — nothing to pan there, it's just centered. */
function maxPanOffset(display: number, container: number): number {
  return display > container ? (display - container) / 2 : 0;
}

function clampPanOffset(offset: number, display: number, container: number): number {
  const max = maxPanOffset(display, container);
  return clamp(offset, -max, max);
}

/**
 * Replaces the flipbook while zoom > 100%. A single page (or sponsor ad),
 * resized to the current zoom level and pannable via drag or the mouse
 * wheel.
 *
 * Position is driven entirely by a `translate()` on the content itself,
 * computed fresh on every render from plain numbers already in React state
 * — `containerSize` (measured once per resize) and `displayWidth`/
 * `displayHeight` (derived from `zoom`) — rather than by imperatively
 * setting a scrollable container's `scrollLeft`/`scrollTop` and reading
 * `scrollWidth`/`clientWidth` back from the DOM to compute it, which is
 * what an earlier version did. That approach kept a class of centering bugs
 * alive across several rounds of fixes: `scrollWidth` depends on the
 * canvas's *imperative* `width`/`height` assignment below, which runs
 * outside React's render cycle, so a value read back from the DOM could
 * reflect a half-applied state that never quite matched what the numbers
 * driving the same render said it should be — "sometimes centered,
 * sometimes skewed," with no pattern a reader could point to, because it
 * depended on browser-internal timing rather than on anything about the
 * page itself. Here, "centered" is simply `offset === {0, 0}` — the
 * container and content sizes are plugged into the same formula on every
 * render, so there's no separate imperative step that can fall out of sync
 * with it, and nothing to race.
 *
 * `offset` itself holds only the reader's own deliberate pan beyond that
 * automatic centering (from dragging, or from the wheel's zoom-toward-
 * cursor below) — it resets to `{0, 0}` the moment a new page or sponsor
 * opens, which is what puts every fresh zoom dead-center regardless of
 * where its content previously sat on screen (e.g. one half of a two-page
 * spread) or how long its bitmap takes to render.
 */
export function ZoomedPageView({
  manager,
  pageNumber,
  totalPages,
  sponsor,
  zoom,
  baseWidth,
  baseHeight,
  onZoomChange,
  onReset,
}: ZoomedPageViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);

  // The reader's own pan, beyond automatic centering — see the component
  // doc comment. `offsetRef` mirrors it for synchronous reads inside the
  // wheel/drag handlers below, which can fire faster than React re-renders.
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The page's "fit" size at zoom==1 — deliberately computed the same way
  // the flipbook fits a page into its container, so crossing from the
  // flipbook into this zoomed view (and back) doesn't visually jump.
  const pageAspect = baseWidth / baseHeight;
  const fitSize = useMemo(() => {
    if (!containerSize || containerSize.width <= 0 || containerSize.height <= 0) return null;
    const availableWidth = containerSize.width * 0.92;
    const availableHeight = containerSize.height * 0.92;
    let height = availableHeight;
    let width = height * pageAspect;
    if (width > availableWidth) {
      width = availableWidth;
      height = width / pageAspect;
    }
    return { width, height };
  }, [containerSize, pageAspect]);

  const displayWidth = fitSize ? Math.round(fitSize.width * zoom) : 0;
  const displayHeight = fitSize ? Math.round(fitSize.height * zoom) : 0;

  // Dead-center position for the current size, plus the reader's own pan on
  // top of it (re-clamped here too — not just at the point `offset` is set
  // — so a window resize that shrinks `containerSize` after a pan can't
  // leave the content hanging off in space beyond its own edge).
  const baseX = containerSize ? (containerSize.width - displayWidth) / 2 : 0;
  const baseY = containerSize ? (containerSize.height - displayHeight) / 2 : 0;
  const clampedOffsetX = containerSize ? clampPanOffset(offset.x, displayWidth, containerSize.width) : 0;
  const clampedOffsetY = containerSize ? clampPanOffset(offset.y, displayHeight, containerSize.height) : 0;
  const translateX = baseX + clampedOffsetX;
  const translateY = baseY + clampedOffsetY;

  useEffect(() => {
    let cancelled = false;
    // Resets both "ready" and the reader's pan for the newly-selected
    // target before its content has loaded — legitimate effects since
    // they're synchronizing with the `pageNumber`/`sponsor` props, not
    // derivable at render. Resetting `offset` here (rather than only on
    // mount) is what re-centers every fresh page/sponsor even when this
    // component itself stays mounted the whole time zoom stays above 1x.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(false);
    setOffset({ x: 0, y: 0 });
    if (sponsor) {
      // Nothing to render ourselves — the sponsor's own <img> below loads
      // itself — just flag ready so it fades in.
      setReady(true);
      return;
    }
    manager.renderPage(pageNumber, RENDER_SCALE).then((result) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = result.width;
      canvas.height = result.height;
      canvas.getContext("2d")?.drawImage(result.canvas, 0, 0);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [manager, pageNumber, sponsor]);

  // Wheel-zoom: fully synchronous — no deferred effect needed, since
  // `next` (the new zoom level) and `fitSize` are both already known at the
  // moment the event fires, so the anchor-preserving offset for it can be
  // computed and applied in the same tick as the zoom change itself.
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      // Keeps Reader's own (flipbook-mode) wheel listener on the outer
      // container from also reacting to the same tick once this view is
      // what's actually on screen and owns wheel-zooming itself.
      e.stopPropagation();
      const currentZoom = zoomRef.current;
      const next = clamp(currentZoom - e.deltaY * WHEEL_ZOOM_SENSITIVITY, ZOOM_MIN, ZOOM_MAX);
      if (next === currentZoom || !fitSize || !containerSize || !viewport) return;

      // Keep the point under the cursor visually fixed as the content
      // resizes: convert the cursor's on-screen position into a
      // zoom-invariant "content-space" coordinate at the OLD size, then
      // solve for whatever new offset puts that same content point back
      // under the cursor at the NEW size.
      const rect = viewport.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;
      const oldDisplayWidth = fitSize.width * currentZoom;
      const oldDisplayHeight = fitSize.height * currentZoom;
      const oldTranslateX =
        (containerSize.width - oldDisplayWidth) / 2 +
        clampPanOffset(offsetRef.current.x, oldDisplayWidth, containerSize.width);
      const oldTranslateY =
        (containerSize.height - oldDisplayHeight) / 2 +
        clampPanOffset(offsetRef.current.y, oldDisplayHeight, containerSize.height);
      const contentX = (pointerX - oldTranslateX) / currentZoom;
      const contentY = (pointerY - oldTranslateY) / currentZoom;

      const newDisplayWidth = fitSize.width * next;
      const newDisplayHeight = fitSize.height * next;
      const newTranslateX = pointerX - contentX * next;
      const newTranslateY = pointerY - contentY * next;
      const newBaseX = (containerSize.width - newDisplayWidth) / 2;
      const newBaseY = (containerSize.height - newDisplayHeight) / 2;
      const nextOffset = {
        x: clampPanOffset(newTranslateX - newBaseX, newDisplayWidth, containerSize.width),
        y: clampPanOffset(newTranslateY - newBaseY, newDisplayHeight, containerSize.height),
      };
      offsetRef.current = nextOffset;
      setOffset(nextOffset);
      onZoomChange(next);
    }
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [onZoomChange, fitSize, containerSize]);

  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, offsetX: offsetRef.current.x, offsetY: offsetRef.current.y };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, []);
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !containerSize) return;
      const nextOffset = {
        x: clampPanOffset(drag.offsetX + (e.clientX - drag.x), displayWidth, containerSize.width),
        y: clampPanOffset(drag.offsetY + (e.clientY - drag.y), displayHeight, containerSize.height),
      };
      offsetRef.current = nextOffset;
      setOffset(nextOffset);
    },
    [containerSize, displayWidth, displayHeight],
  );
  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div
      ref={viewportRef}
      onDoubleClick={onReset}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative h-full w-full cursor-grab touch-none overflow-hidden bg-[#05070a] active:cursor-grabbing"
    >
      {sponsor
        ? sponsor.fullPageImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sponsor.fullPageImageUrl}
              alt={sponsor.name}
              draggable={false}
              className="absolute left-0 top-0 block bg-[#f6f3ea] object-cover shadow-2xl transition-opacity"
              style={{
                width: displayWidth || undefined,
                height: displayHeight || undefined,
                transform: `translate(${translateX}px, ${translateY}px)`,
                opacity: ready ? 1 : 0,
              }}
            />
          )
        : (
            <canvas
              ref={canvasRef}
              className="absolute left-0 top-0 block bg-[#f6f3ea] shadow-2xl transition-opacity"
              style={{
                width: displayWidth || undefined,
                height: displayHeight || undefined,
                transform: `translate(${translateX}px, ${translateY}px)`,
                opacity: ready ? 1 : 0,
              }}
            />
          )}
      <span className="pointer-events-none fixed bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80">
        {sponsor ? "Publicidad" : `${pageNumber} / ${totalPages}`} · doble clic para restablecer
      </span>
    </div>
  );
}
