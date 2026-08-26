"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import HTMLFlipBook from "react-pageflip";
import type { PdfDocumentManager } from "@/lib/pdf";
import { FlipbookPage } from "@/components/flipbook/FlipbookPage";
import { clamp } from "@/lib/utils";

export type FlipbookHandle = {
  goToPage: (pageNumber: number) => void;
  next: () => void;
  prev: () => void;
};

export type FlipbookProps = {
  manager: PdfDocumentManager;
  pageCount: number;
  initialPage: number;
  baseWidth: number;
  baseHeight: number;
  renderScale: number;
  isMobile: boolean;
  reduceMotion: boolean;
  onPageChange: (pageNumber: number) => void;
};

type FlipEvent = { data: number };
type OrientationEvent = { data: "portrait" | "landscape" };

// react-pageflip ships loose (any-typed) callback props; narrow them here so
// the rest of the app never has to deal with `any`.
type PageFlipController = {
  turnToPage: (page: number) => void;
  flipNext: () => void;
  flipPrev: () => void;
};

const RENDER_WINDOW = 2;

export const Flipbook = forwardRef<FlipbookHandle, FlipbookProps>(function Flipbook(
  { manager, pageCount, initialPage, baseWidth, baseHeight, renderScale, isMobile, reduceMotion, onPageChange },
  ref,
) {
  // react-pageflip's own ref type is effectively `any`; we keep it isolated here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookRef = useRef<any>(null);
  const [activePage, setActivePage] = useState(initialPage);

  // react-pageflip's "stretch" sizing only fits the container's *width* —
  // on a wide-but-short viewport it happily computes a height taller than
  // what's actually available, and the overflow gets clipped by the
  // reader's outer `overflow-hidden`. So we measure the container ourselves
  // and hand the book an exact pixel width/height that fits both axes.
  const measureRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  // react-pageflip decides on its own whether a hard cover page is shown
  // "portrait" (alone) or as part of a landscape spread — we mirror that
  // here so a lone page gets exactly one page's worth of width (and is
  // therefore centered by the flex wrapper) instead of half of a
  // double-wide block.
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    isMobile ? "portrait" : "landscape",
  );
  // Native pinch-to-zoom (mobile) magnifies the whole page at the browser
  // level — nothing to render ourselves, but page-turn taps are suspended
  // while zoomed in, exactly like a real magazine you can't flip a page of
  // while your fingers are on it.
  const [isPinchZoomed, setIsPinchZoomed] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setIsPinchZoomed(viewport.scale > 1.05);
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    let timeout: ReturnType<typeof setTimeout>;
    let first = true;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      // Debounced (after the first measurement): the book remounts when its
      // computed size changes (see `key` below), so we don't want every
      // intermediate frame of a window drag to tear down and rebuild every
      // rendered page.
      if (first) {
        first = false;
        setContainerSize({ width, height });
        return;
      }
      clearTimeout(timeout);
      timeout = setTimeout(() => setContainerSize({ width, height }), 120);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, []);

  const pageAspect = baseWidth / baseHeight;
  const bookSize = useMemo(() => {
    if (!containerSize || containerSize.width <= 0 || containerSize.height <= 0) return null;
    const spreadMultiplier = orientation === "portrait" ? 1 : 2;
    // Leave a little breathing room so shadows/corners never clip.
    const availableWidth = containerSize.width * 0.96;
    const availableHeight = containerSize.height * 0.96;

    let pageHeight = availableHeight;
    let pageWidth = pageHeight * pageAspect;
    if (pageWidth * spreadMultiplier > availableWidth) {
      pageWidth = availableWidth / spreadMultiplier;
      pageHeight = pageWidth / pageAspect;
    }
    return { width: Math.floor(pageWidth), height: Math.floor(pageHeight) };
  }, [containerSize, pageAspect, orientation]);

  const getController = useCallback((): PageFlipController | null => {
    return bookRef.current?.pageFlip?.() ?? null;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      goToPage: (pageNumber: number) => {
        const clamped = Math.max(1, Math.min(pageCount, pageNumber));
        // turnToPage() jumps instantly without going through the flip
        // controller, so — unlike flipNext/flipPrev — it never fires
        // onFlip. Update our own window-tracking state directly so the
        // newly-visible page renders immediately.
        getController()?.turnToPage(clamped - 1);
        setActivePage(clamped);
      },
      next: () => getController()?.flipNext(),
      prev: () => getController()?.flipPrev(),
    }),
    [getController, pageCount],
  );

  const handleFlip = useCallback(
    (event: FlipEvent) => {
      const pageNumber = event.data + 1;
      setActivePage(pageNumber);
      onPageChange(pageNumber);
    },
    [onPageChange],
  );

  const handleChangeOrientation = useCallback((event: OrientationEvent) => {
    setOrientation(event.data);
  }, []);

  const pages = useMemo(
    () => Array.from({ length: pageCount }, (_, i) => i + 1),
    [pageCount],
  );

  // A lone hard cover/back page only fills half of the book's double-wide
  // landscape block (react-pageflip anchors the cover to the right, the
  // back page to the left) — shift the whole block by half a page so the
  // one visible page lands dead-center instead of off to one side.
  const isEdgePage = activePage === 1 || activePage === pageCount;
  const centeringShift =
    bookSize && orientation === "landscape" && isEdgePage
      ? (activePage === 1 ? -1 : 1) * (bookSize.width / 2)
      : 0;

  // Navigation model (same on mobile and desktop): react-pageflip's own
  // pointer-driven dragging and corner-click flipping is turned off
  // entirely (useMouseEvents/showPageCorners/disableFlipByClick below) —
  // it's the "grab a corner and drag" interaction nobody expects from a tap
  // on a phone. In its place, a simple tap/click near the outer edge of the
  // visible page(s) calls next()/prev() directly, classified in JS on
  // pointer-up rather than with a clickable overlay div, so it never
  // requires guessing a safe width that avoids a document's own margin
  // content.
  const visibleWidth = bookSize
    ? orientation === "landscape" && !isEdgePage
      ? bookSize.width * 2
      : bookSize.width
    : 0;
  const visibleHeight = bookSize?.height ?? 0;
  const edgeZoneWidth = bookSize ? clamp(Math.round(visibleWidth * 0.15), 56, 140) : 0;
  const showNavHints = !!bookSize && !!containerSize;
  const zoneTop = containerSize && bookSize ? (containerSize.height - visibleHeight) / 2 : 0;
  const zoneLeft = containerSize && bookSize ? (containerSize.width - visibleWidth) / 2 : 0;

  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isPinchZoomed) return;
      const start = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!start || !bookSize || !containerSize) return;
      // A real drag (e.g. a swipe) moves the pointer — only treat a
      // near-zero-movement press as a tap that might turn the page.
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) return;

      const rect = measureRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (y < zoneTop || y > zoneTop + visibleHeight) return;
      if (x >= zoneLeft && x <= zoneLeft + edgeZoneWidth) {
        getController()?.flipPrev();
      } else if (x <= zoneLeft + visibleWidth && x >= zoneLeft + visibleWidth - edgeZoneWidth) {
        getController()?.flipNext();
      }
    },
    [isPinchZoomed, bookSize, containerSize, zoneTop, visibleHeight, zoneLeft, edgeZoneWidth, visibleWidth, getController],
  );

  return (
    <div
      ref={measureRef}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
    >
      {bookSize && (
        <div
          style={{
            transform: `translateX(${centeringShift}px)`,
            transition: reduceMotion ? undefined : "transform 300ms ease",
          }}
        >
          <HTMLFlipBook
            key={`${bookSize.width}x${bookSize.height}`}
            className="revista-flipbook"
            style={{}}
            ref={bookRef}
            width={bookSize.width}
            height={bookSize.height}
            size="fixed"
            minWidth={0}
            maxWidth={4000}
            minHeight={0}
            maxHeight={4000}
            startPage={Math.max(0, activePage - 1)}
            drawShadow
            flippingTime={reduceMotion ? 1 : 550}
            usePortrait={isMobile}
            startZIndex={10}
            autoSize={false}
            maxShadowOpacity={0.4}
            showCover
            mobileScrollSupport={false}
            clickEventForward={false}
            swipeDistance={9999}
            useMouseEvents={false}
            showPageCorners={false}
            // NOT disableFlipByClick: useMouseEvents={false} already means
            // the library never attaches the native listeners that would
            // call its internal click-to-flip in the first place, so this
            // flag can't add any protection here — but leaving it `true`
            // makes react-pageflip's OWN flipPrev()/flipNext() calls (the
            // ones our tap/click handling invokes programmatically) run
            // through the same "is this click on a page corner?" check,
            // which flipPrev() fails due to a coordinate bug in that
            // library (it checks an un-offset x=10 against the book's
            // actual on-screen position), silently no-op-ing every
            // "previous page" tap. Leaving it false sidesteps that bug.
            disableFlipByClick={false}
            onFlip={handleFlip}
            onChangeOrientation={handleChangeOrientation}
            onChangeState={() => {}}
            onInit={() => {}}
            onUpdate={() => {}}
            renderOnlyPageLengthChange={false}
          >
            {pages.map((pageNumber) => {
              const shouldRender = Math.abs(pageNumber - activePage) <= RENDER_WINDOW;
              return (
                <FlipbookPage
                  key={pageNumber}
                  number={pageNumber}
                  totalPages={pageCount}
                  manager={manager}
                  scale={renderScale}
                  shouldRender={shouldRender || pageNumber <= RENDER_WINDOW + 1}
                />
              );
            })}
          </HTMLFlipBook>
        </div>
      )}

      {showNavHints && (
        // Purely decorative (pointer-events-none): a subtle always-on cue for
        // where a tap/click turns the page. Real taps are classified in
        // handlePointerUp above, not caught here.
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 flex items-center justify-start text-3xl text-white/25"
            style={{ left: zoneLeft, top: zoneTop, width: edgeZoneWidth, height: visibleHeight }}
          >
            <span className="pl-1">‹</span>
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 flex items-center justify-end text-3xl text-white/25"
            style={{
              left: zoneLeft + visibleWidth - edgeZoneWidth,
              top: zoneTop,
              width: edgeZoneWidth,
              height: visibleHeight,
            }}
          >
            <span className="pr-1">›</span>
          </div>
        </>
      )}
    </div>
  );
});
