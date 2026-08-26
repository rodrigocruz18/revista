"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PdfDocumentManager } from "@/lib/pdf";
import { ZOOM_MAX, ZOOM_MIN } from "@/config/magazine";
import { clamp } from "@/lib/utils";

export type ZoomedPageViewProps = {
  manager: PdfDocumentManager;
  pageNumber: number;
  totalPages: number;
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

/**
 * Replaces the flipbook while zoom > 100%. A single page, resized to the
 * current zoom level and pannable via drag or the browser's own
 * scrollbars/trackpad.
 *
 * Important: the canvas's on-screen size is set via actual `width`/`height`
 * (a plain resize of the existing bitmap — still just as cheap/GPU-friendly
 * as a CSS transform), never via `transform: scale()`. A `transform` only
 * changes how an element is *painted*; it never changes the box the browser
 * uses to compute `scrollWidth`/`scrollHeight`. With a transform-based zoom,
 * the visually-enlarged page keeps overflowing further and further outside
 * a scroll box sized for the *un*transformed canvas, so most of a zoomed-in
 * page becomes physically unreachable by scrolling/dragging — exactly the
 * "can't pan to the corners" bug this component used to have.
 *
 * Wheel-zooming owns its own zoom-anchoring: it tracks the cursor position
 * at the moment of each wheel tick and, once the zoom level actually
 * changes, adjusts the scroll offset so the point under the cursor stays
 * visually fixed on screen — the same "zoom toward where you're pointing"
 * behavior as an image viewer or map, rather than always zooming from
 * whatever the scroll happened to be pinned to (which read as the page
 * jumping to the top-left on every tick).
 */
export function ZoomedPageView({
  manager,
  pageNumber,
  totalPages,
  zoom,
  baseWidth,
  baseHeight,
  onZoomChange,
  onReset,
}: ZoomedPageViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  // Captured at wheel time (cursor position + the scroll/zoom state right
  // before the change), consumed by the layout effect below right after the
  // zoom prop actually updates and the canvas has been resized.
  const pendingAnchorRef = useRef<{
    clientX: number;
    clientY: number;
    prevZoom: number;
    prevScrollLeft: number;
    prevScrollTop: number;
  } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
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

  // Centering a too-large child with `justify-content/align-items: center`
  // (the previous approach) is a well-known browser scrolling trap: when
  // content overflows a centered flex/grid container, the browser only
  // extends the scrollable area on the trailing (right/bottom) side — the
  // leading (left/top) overflow, shifted out from under the container by
  // the same centering math, ends up outside the scrollable region entirely
  // and is never reachable by scrolling or dragging. That's exactly why
  // panning used to stop well short of the actual corners. Plain padding
  // doesn't have this quirk: it centers the page when it's smaller than the
  // viewport (padding > 0) and disappears once zoom makes it bigger
  // (padding clamps to 0), at which point the canvas is a normal
  // top-left-anchored block and every pixel of it is reachable.
  const padX = containerSize && displayWidth < containerSize.width ? (containerSize.width - displayWidth) / 2 : 0;
  const padY = containerSize && displayHeight < containerSize.height ? (containerSize.height - displayHeight) / 2 : 0;

  useEffect(() => {
    let cancelled = false;
    // Resets the "ready" flag for the newly-selected page before its
    // higher-resolution render has loaded — a legitimate effect since it's
    // synchronizing with the `pageNumber` prop, not derivable at render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(false);
    manager.renderPage(pageNumber, RENDER_SCALE).then((result) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = result.width;
      canvas.height = result.height;
      canvas.getContext("2d")?.drawImage(result.canvas, 0, 0);
      setReady(true);
      requestAnimationFrame(() => {
        const scroller = scrollRef.current;
        if (!scroller) return;
        scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
        scroller.scrollTop = 0;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [manager, pageNumber]);

  // Runs whenever `zoom` actually changes. If that change came from a wheel
  // tick (see handleWheel), re-anchor the scroll position so the point that
  // was under the cursor before the resize is still under it after — a
  // plain useEffect would run after the browser has already painted the
  // resized canvas at the old scroll offset, producing a visible flash of
  // the wrong position first, so this needs to run synchronously before
  // paint.
  useLayoutEffect(() => {
    const pending = pendingAnchorRef.current;
    const scroller = scrollRef.current;
    if (!pending || !scroller || pending.prevZoom === zoom) return;
    pendingAnchorRef.current = null;

    const rect = scroller.getBoundingClientRect();
    const pointerX = pending.clientX - rect.left;
    const pointerY = pending.clientY - rect.top;
    const ratio = zoom / pending.prevZoom;
    scroller.scrollLeft = (pending.prevScrollLeft + pointerX) * ratio - pointerX;
    scroller.scrollTop = (pending.prevScrollTop + pointerY) * ratio - pointerY;
  }, [zoom]);

  // Wheel-zoom is wired up via a plain, non-passive `addEventListener`
  // rather than React's `onWheel` prop: modern React attaches its
  // synthetic wheel listener as passive, which silently makes
  // `e.preventDefault()` a no-op (with a console warning) — the browser
  // would keep natively scrolling this very div on every tick, fighting the
  // scroll position this component sets programmatically for anchoring.
  // `zoomRef` keeps the listener itself stable across zoom changes instead
  // of tearing it down and re-adding it on every single wheel tick.
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    function onWheel(e: WheelEvent) {
      // Read fresh from the ref rather than closing over the outer
      // `scroller` — keeps TypeScript's null-narrowing scoped to this
      // callback and avoids relying on a value captured at effect-setup
      // time for the lifetime of the listener.
      const current = scrollRef.current;
      if (!current) return;
      e.preventDefault();
      // Keeps Reader's own (flipbook-mode) wheel listener on the outer
      // container from also reacting to the same tick once this view is
      // what's actually on screen and owns wheel-zooming itself.
      e.stopPropagation();
      const currentZoom = zoomRef.current;
      const next = clamp(currentZoom - e.deltaY * WHEEL_ZOOM_SENSITIVITY, ZOOM_MIN, ZOOM_MAX);
      if (next === currentZoom) return;
      pendingAnchorRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        prevZoom: currentZoom,
        prevScrollLeft: current.scrollLeft,
        prevScrollTop: current.scrollTop,
      };
      onZoomChange(next);
    }
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [onZoomChange]);

  function handlePointerDown(e: React.PointerEvent) {
    const scroller = scrollRef.current;
    if (!scroller) return;
    dragRef.current = { x: e.clientX, y: e.clientY, scrollLeft: scroller.scrollLeft, scrollTop: scroller.scrollTop };
    scroller.setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    const scroller = scrollRef.current;
    if (!drag || !scroller) return;
    scroller.scrollLeft = drag.scrollLeft - (e.clientX - drag.x);
    scroller.scrollTop = drag.scrollTop - (e.clientY - drag.y);
  }
  function handlePointerUp() {
    dragRef.current = null;
  }

  return (
    <div
      ref={scrollRef}
      onDoubleClick={onReset}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative h-full w-full cursor-grab overflow-auto overscroll-contain bg-[#05070a] active:cursor-grabbing"
    >
      <div style={{ padding: `${padY}px ${padX}px` }}>
        <canvas
          ref={canvasRef}
          className="block bg-[#f6f3ea] shadow-2xl transition-opacity"
          style={{
            width: displayWidth || undefined,
            height: displayHeight || undefined,
            opacity: ready ? 1 : 0,
          }}
        />
      </div>
      <span className="pointer-events-none fixed bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80">
        {pageNumber} / {totalPages} · doble clic para restablecer
      </span>
    </div>
  );
}
