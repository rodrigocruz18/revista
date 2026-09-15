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
import type { Sponsor } from "@/types/sponsor";
import { FlipbookPage } from "@/components/flipbook/FlipbookPage";
import { FlipbookAdPage } from "@/components/flipbook/FlipbookAdPage";
import { FlipbookFillerPage } from "@/components/flipbook/FlipbookFillerPage";
import type { FullPageSpot } from "@/lib/fullPageSpots";
import { clamp } from "@/lib/utils";

/** Whatever is visually under a given viewport point, resolved by
 * `zoomTargetAtPoint` below — either a real PDF page, or a full-page
 * sponsor slot (ad or its blank filler companion; both resolve to the same
 * sponsor, since visually they're one spread). Lets a parent zoom into
 * whichever one the reader actually pointed at, sponsor pages included,
 * instead of only ever supporting real pages. */
export type ZoomTarget = { kind: "real"; page: number } | { kind: "ad"; sponsor: Sponsor };

export type FlipbookHandle = {
  goToPage: (pageNumber: number) => void;
  next: () => void;
  prev: () => void;
  /**
   * What is visually under a given viewport point right now — the left or
   * right half of a two-page spread resolve to different targets. Used when
   * the user starts zooming with the mouse wheel, so the zoom opens on
   * whichever page (real or sponsor) they were actually pointing at instead
   * of always the spread's nominal "current" page (react-pageflip's onFlip
   * only ever reports the left page of a spread, which is what made zooming
   * while pointing at the right-hand page visibly jump to the left one).
   * Returns null if the point isn't over the book at all.
   */
  zoomTargetAtPoint: (clientX: number, clientY: number) => ZoomTarget | null;
};

/** The empty space around the visible page(s), in the same coordinate space
 * as Flipbook's own root container (i.e. relative to that container's own
 * top-left corner) — the exact geometry Flipbook already computes for its
 * own left/right tap-to-turn hint arrows. Exposed so a parent can overlay
 * something (e.g. a sponsor banner) precisely centered in that dead space
 * instead of guessing a fixed width that never quite matches the book's
 * actual rendered size at the current viewport/aspect ratio. */
export type FlipbookGutter = {
  left: number;
  top: number;
  visibleWidth: number;
  visibleHeight: number;
};

export type FlipbookProps = {
  manager: PdfDocumentManager;
  /** Real page count of the underlying PDF — never includes the full-page
   * sponsor slots inserted via `spots` (see the sequence builder below). */
  pageCount: number;
  /** Fixed full-page sponsor placements for this edition/session (see
   * fullPageSpots.ts) — each is inserted as a genuine page (or two, in a
   * two-page spread) right after its `beforePage`, so it turns with
   * exactly the same engine as every other page. Must be its FINAL value
   * before this component first mounts: the book's own page array is built
   * from it once and shifts if it changes shape under an already-open
   * book, so the parent should wait until `spots` is settled before
   * rendering `<Flipbook>` at all (see Reader's `spotsReady`). */
  spots: FullPageSpot[];
  initialPage: number;
  baseWidth: number;
  baseHeight: number;
  renderScale: number;
  isMobile: boolean;
  reduceMotion: boolean;
  /** Real page number — never called while sitting on a full-page sponsor
   * slot (see `onActiveAdChange` for that). */
  onPageChange: (pageNumber: number) => void;
  /** Fires whenever the book's own layout is (re)computed — null while it
   * isn't ready yet (still measuring, or the container has no size). */
  onGutterChange?: (gutter: FlipbookGutter | null) => void;
  /** Fires whenever the currently-shown page becomes (or stops being) a
   * full-page sponsor slot, naming which sponsor (or null, back on real
   * content) — a parent uses this to keep its own idea of "what's on
   * screen" in sync even when nothing calls `zoomTargetAtPoint` (e.g.
   * zooming via a keyboard shortcut, which has no cursor position to
   * resolve a target from). */
  onActiveAdChange?: (sponsor: Sponsor | null) => void;
  /**
   * When provided, tap/click-to-turn (the only way this component ever
   * turns a page — see the note on disableFlipByClick below) calls these
   * instead of driving the page-flip controller directly. This lets a
   * parent centralize *every* forward/backward request — tap, keyboard,
   * toolbar button all end up here. Falls back to calling the controller
   * directly if not provided, so this component still works standalone.
   */
  onRequestNext?: () => void;
  onRequestPrev?: () => void;
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

/** One slot in the book's actual page array, as handed to HTMLFlipBook —
 * "book position" from here on, to distinguish it from the real PDF page
 * number a "real" entry carries. A full-page sponsor spot always inserts
 * an "ad" entry right after its `beforePage`, plus a "filler" entry too
 * when spreads are in play (see `includeFiller`) — always exactly 2 slots
 * in that case, never 1, so every real page after the spot keeps the same
 * odd/even spread pairing it would have had without the spot at all. */
type SequenceEntry = { kind: "real"; page: number } | { kind: "ad" | "filler"; spot: FullPageSpot };

function buildSequence(pageCount: number, spots: FullPageSpot[], includeFiller: boolean): SequenceEntry[] {
  const spotByBeforePage = new Map(spots.map((s) => [s.beforePage, s]));
  const sequence: SequenceEntry[] = [];
  for (let page = 1; page <= pageCount; page++) {
    sequence.push({ kind: "real", page });
    const spot = spotByBeforePage.get(page);
    if (spot) {
      sequence.push({ kind: "ad", spot });
      if (includeFiller) sequence.push({ kind: "filler", spot });
    }
  }
  return sequence;
}

/** 1-based book position of a given real page number — falls back to 1
 * (should never actually happen: every real page 1..pageCount always has
 * exactly one "real" entry in the sequence). */
function bookPositionForRealPage(sequence: SequenceEntry[], realPage: number): number {
  const idx = sequence.findIndex((entry) => entry.kind === "real" && entry.page === realPage);
  return idx === -1 ? 1 : idx + 1;
}

export const Flipbook = forwardRef<FlipbookHandle, FlipbookProps>(function Flipbook(
  {
    manager,
    pageCount,
    spots,
    initialPage,
    baseWidth,
    baseHeight,
    renderScale,
    isMobile,
    reduceMotion,
    onPageChange,
    onGutterChange,
    onActiveAdChange,
    onRequestNext,
    onRequestPrev,
  },
  ref,
) {
  // react-pageflip's own ref type is effectively `any`; we keep it isolated here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookRef = useRef<any>(null);

  // Landscape/desktop shows the sponsor as a real two-page spread (ad +
  // blank filler); portrait/mobile has no second slot to fill, so the ad
  // stands alone — one page, not two, to avoid an extra tap through
  // nothing. See the module doc comment on SequenceEntry for why this is
  // always exactly 1 or 2 slots, never a mix, per spot.
  const sequence = useMemo(() => buildSequence(pageCount, spots, !isMobile), [pageCount, spots, isMobile]);

  // `activePage` is a 1-based position in `sequence` (a "book position"),
  // NOT a real PDF page number — the two only coincide when there are no
  // sponsor spots before the current position. Every external boundary
  // (the `initialPage` prop, `onPageChange`, `goToPage`, `zoomTargetAtPoint`)
  // converts between the two right at the edge; everything else in this
  // component (isEdgePage, spreadLeftPage, centering, render-window,
  // tap-zone geometry) operates purely on book positions and doesn't care
  // what they represent, so none of that math needed to change.
  const [activePage, setActivePage] = useState(() => bookPositionForRealPage(sequence, initialPage));

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

  // A lone hard cover/back page only fills half of the book's double-wide
  // landscape block (react-pageflip anchors the cover to the right, the
  // back page to the left) — shift the whole block by half a page so the
  // one visible page lands dead-center instead of off to one side.
  const isEdgePage = activePage === 1 || activePage === sequence.length;

  // `activePage` is only guaranteed to be the LEFT page of its spread when
  // it came from react-pageflip's own onFlip callback (handleFlip below) —
  // that's its reporting convention. But `activePage` can also be set
  // directly from outside (goToPage(), or this component's own `initialPage`
  // prop on mount) with either parity, e.g. Reader hands back a page it
  // resolved by pointing at the *right*-hand page of a spread while zooming.
  // Every bit of layout math below (spread width, click zones, zoomTargetAtPoint)
  // assumes a left-page anchor, so normalize to it here rather than trusting
  // `activePage`'s parity — otherwise landing on an odd "activePage" made
  // this component believe it was the left page of a spread with the next
  // page as its right half, one page off from what's actually on screen.
  const spreadLeftPage =
    isEdgePage || orientation !== "landscape"
      ? activePage
      : activePage % 2 === 0
        ? activePage
        : activePage - 1;

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

  // Reports the same left/top/visible-size geometry used for the nav-hint
  // arrows below, so a parent (Reader) can position something else — the
  // sponsor banner — precisely within the real dead space around the book,
  // which shifts with viewport size, page aspect ratio, and orientation.
  useEffect(() => {
    if (!onGutterChange) return;
    if (!bookSize || !containerSize) {
      onGutterChange(null);
      return;
    }
    onGutterChange({ left: zoneLeft, top: zoneTop, visibleWidth, visibleHeight });
  }, [onGutterChange, bookSize, containerSize, zoneLeft, zoneTop, visibleWidth, visibleHeight]);

  // Tells a parent whenever the currently-shown page is a full-page
  // sponsor slot rather than real content, and which sponsor — see the
  // prop's own doc comment for why that matters.
  useEffect(() => {
    if (!onActiveAdChange) return;
    const entry = sequence[activePage - 1];
    onActiveAdChange(entry && entry.kind !== "real" ? entry.spot.sponsor : null);
  }, [onActiveAdChange, sequence, activePage]);

  useImperativeHandle(
    ref,
    () => ({
      goToPage: (pageNumber: number) => {
        const clampedReal = Math.max(1, Math.min(pageCount, pageNumber));
        const bookPos = bookPositionForRealPage(sequence, clampedReal);
        // turnToPage() jumps instantly without going through the flip
        // controller, so — unlike flipNext/flipPrev — it never fires
        // onFlip. Update our own window-tracking state directly so the
        // newly-visible page renders immediately.
        getController()?.turnToPage(bookPos - 1);
        setActivePage(bookPos);
      },
      next: () => getController()?.flipNext(),
      prev: () => getController()?.flipPrev(),
      zoomTargetAtPoint: (clientX: number, clientY: number) => {
        const rect = measureRef.current?.getBoundingClientRect();
        if (!rect || !bookSize) return null;
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        if (y < zoneTop || y > zoneTop + visibleHeight) return null;
        if (x < zoneLeft || x > zoneLeft + visibleWidth) return null;
        let bookPos: number;
        if (orientation !== "landscape" || isEdgePage) {
          // Only one page is actually visible (portrait/mobile, or a lone
          // cover/back page) — no left/right ambiguity to resolve.
          bookPos = clamp(activePage, 1, sequence.length);
        } else {
          // Two-page spread: spreadLeftPage is the left page, +1 the right.
          const isRightHalf = x >= zoneLeft + bookSize.width;
          bookPos = clamp(isRightHalf ? spreadLeftPage + 1 : spreadLeftPage, 1, sequence.length);
        }
        const entry = sequence[bookPos - 1];
        if (!entry) return null;
        if (entry.kind === "real") return { kind: "real", page: entry.page };
        // "ad" and "filler" (the blank back of a spread, desktop-only) both
        // resolve to the same sponsor — visually they're one placement, so
        // pointing at either half zooms into the sponsor's own page.
        return { kind: "ad", sponsor: entry.spot.sponsor };
      },
    }),
    [
      getController,
      pageCount,
      sequence,
      bookSize,
      orientation,
      isEdgePage,
      activePage,
      spreadLeftPage,
      zoneTop,
      zoneLeft,
      visibleWidth,
      visibleHeight,
    ],
  );

  const handleFlip = useCallback(
    (event: FlipEvent) => {
      const bookPos = event.data + 1;
      setActivePage(bookPos);
      const entry = sequence[bookPos - 1];
      if (entry?.kind === "real") onPageChange(entry.page);
    },
    [onPageChange, sequence],
  );

  const handleChangeOrientation = useCallback((event: OrientationEvent) => {
    setOrientation(event.data);
  }, []);

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
        if (onRequestPrev) onRequestPrev();
        else getController()?.flipPrev();
      } else if (x <= zoneLeft + visibleWidth && x >= zoneLeft + visibleWidth - edgeZoneWidth) {
        if (onRequestNext) onRequestNext();
        else getController()?.flipNext();
      }
    },
    [
      isPinchZoomed,
      bookSize,
      containerSize,
      zoneTop,
      visibleHeight,
      zoneLeft,
      edgeZoneWidth,
      visibleWidth,
      getController,
      onRequestPrev,
      onRequestNext,
    ],
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
            startPage={Math.max(0, spreadLeftPage - 1)}
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
            {sequence.map((entry, index) => {
              const bookPos = index + 1;
              const shouldRender = Math.abs(bookPos - spreadLeftPage) <= RENDER_WINDOW || bookPos <= RENDER_WINDOW + 1;
              if (entry.kind === "real") {
                return (
                  <FlipbookPage
                    key={`real-${entry.page}`}
                    number={entry.page}
                    totalPages={pageCount}
                    manager={manager}
                    scale={renderScale}
                    shouldRender={shouldRender}
                  />
                );
              }
              if (entry.kind === "ad") {
                return (
                  <FlipbookAdPage key={`ad-${entry.spot.id}`} sponsor={entry.spot.sponsor} edgeInset={edgeZoneWidth} />
                );
              }
              return <FlipbookFillerPage key={`filler-${entry.spot.id}`} />;
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
