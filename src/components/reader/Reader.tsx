"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Magazine } from "@/types/magazine";
import type { Sponsor } from "@/types/sponsor";
import { getPdfDocumentManager } from "@/lib/pdf";
import { Flipbook, type FlipbookGutter, type FlipbookHandle } from "@/components/flipbook/Flipbook";
import { ZoomedPageView } from "@/components/flipbook/ZoomedPageView";
import { Toolbar } from "@/components/tools/Toolbar";
import { Preloader } from "@/components/ui/Preloader";
import { ErrorState } from "@/components/ui/ErrorState";
import { SponsorSlot } from "@/components/sponsors/SponsorSlot";
import { useMediaQuery, usePrefersReducedMotion } from "@/hooks/useMediaQuery";
import { useKeyboardShortcuts } from "@/lib/keyboard";
import { ZOOM_MAX, ZOOM_MIN, magazineConfig } from "@/config/magazine";
import { clamp, cn } from "@/lib/utils";
import { useAppLoading } from "@/components/intro/AppLoadingContext";
import { useSponsorRotation } from "@/lib/sponsorRotation";
import { type FullPageSpot, fromStoredSpots, pickFullPageSpots, toStoredSpots } from "@/lib/fullPageSpots";
import { loadFullPageSpotLayout, saveFullPageSpotLayout } from "@/lib/sponsorFullPageStorage";

export function Reader({
  edition,
  sponsors,
}: {
  edition: Magazine;
  allEditions: Magazine[];
  sponsors: Sponsor[];
}) {
  const manager = useMemo(() => getPdfDocumentManager(edition.url), [edition.url]);

  const isMobile = useMediaQuery("(max-width: 767px)");
  const reduceMotion = usePrefersReducedMotion();
  const appLoading = useAppLoading();

  const containerRef = useRef<HTMLDivElement>(null);
  const flipbookRef = useRef<FlipbookHandle>(null);

  const [numPages, setNumPages] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [baseSize, setBaseSize] = useState<{ width: number; height: number } | null>(null);
  const [initialPage, setInitialPage] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [toolbarVisible, setToolbarVisible] = useState(true);

  const baseScale = isMobile ? 1.6 : 2;

  // ---- Sponsors: rotating banner + fixed full-page interstitials. A
  // single rotation timer drives both the mobile (horizontal) and desktop
  // (vertical) banner slots below, so they always agree on which sponsor is
  // currently up instead of running on independent, possibly-drifting timers.
  const currentBannerSponsor = useSponsorRotation(sponsors);

  // The book's own dead-space geometry (see Flipbook's onGutterChange doc
  // comment) — used to place the vertical banner precisely centered in the
  // real gap between the reading area's left edge and the book itself,
  // instead of a fixed-width column that couldn't account for how that gap
  // changes with viewport size and page aspect ratio.
  const [gutter, setGutter] = useState<FlipbookGutter | null>(null);
  const MIN_GUTTER_FOR_SPONSOR = 110; // below this the space is too tight to show a banner nicely

  // ---- Full-page sponsor: fixed spots in the page sequence, inserted as
  // genuine pages inside the book itself (see fullPageSpots.ts's doc
  // comment, and Flipbook's sequence builder). `spots` is this edition's
  // randomized layout for the session. It MUST be settled before Flipbook
  // first mounts (see Flipbook's own doc comment on the `spots` prop) — so
  // `spotsReady` gates the whole reader below until the spots-init effect
  // has actually run for the current edition, rather than letting Flipbook
  // mount against a still-empty `spots` and then swap the book's page
  // array out from under an already-open reader.
  const [spots, setSpots] = useState<FullPageSpot[]>([]);
  const [spotsReady, setSpotsReady] = useState(false);
  const spotsInitializedRef = useRef(false);

  // Whether the page currently on screen is a full-page sponsor slot rather
  // than real content — fed by Flipbook's onFullPageActiveChange. Gates
  // zoom entry (nothing real to zoom into on an ad) and keeps the toolbar
  // pill from fading out while it's the only way to leave the ad.
  const [onAdPage, setOnAdPage] = useState(false);
  const onAdPageRef = useRef(false);
  const handleFullPageActiveChange = useCallback((active: boolean) => {
    onAdPageRef.current = active;
    setOnAdPage(active);
  }, []);

  useEffect(() => {
    if (!numPages || spotsInitializedRef.current) return;
    spotsInitializedRef.current = true;
    const stored = loadFullPageSpotLayout(edition.slug);
    const restored = stored ? fromStoredSpots(stored, sponsors) : [];
    const layout = restored.length > 0 ? restored : pickFullPageSpots(numPages, sponsors);
    if (!stored || restored.length !== stored.length) saveFullPageSpotLayout(edition.slug, toStoredSpots(layout));
    // Synchronizing with `numPages` becoming known for this edition, not
    // something derivable during render (it also reads sessionStorage).
    setSpots(layout);
    setSpotsReady(true);
  }, [numPages, sponsors, edition.slug]);

  // ---- Load document metadata + always open on page 1 (the cover). -----
  useEffect(() => {
    let cancelled = false;
    // Resets reader state for the newly-selected edition before its PDF
    // metadata (page count, size) has loaded — a legitimate effect since
    // it's synchronizing with the `edition.slug` prop, not derivable at render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNumPages(null);
    setLoadError(null);
    setInitialPage(null);
    spotsInitializedRef.current = false;
    setSpots([]);
    setSpotsReady(false);

    // Tells the splash's loading phase (see LogoIntro/IntroGate) there's
    // real work to wait for — on the very first load of a browser session
    // this is what keeps the cinematic reveal from starting before there's
    // anything behind it to reveal.
    appLoading?.begin("reader");
    appLoading?.setProgress("reader", 0.08);

    Promise.all([manager.getNumPages(), manager.getViewportSize(1, 1)])
      .then(([pages, size]) => {
        if (cancelled) return;
        setNumPages(pages);
        setBaseSize({ width: Math.round(size.width), height: Math.round(size.height) });
        appLoading?.setProgress("reader", 0.75);

        // Every edition always opens on its cover — no restoring or
        // persisting a "last read page" across visits.
        setInitialPage(1);
        setCurrentPage(1);
      })
      .catch(() => {
        if (!cancelled) setLoadError("El archivo PDF no pudo abrirse.");
        // A load that failed is still "done" as far as the splash is
        // concerned — the reader shows its own ErrorState next, the splash
        // shouldn't sit there waiting for a success that isn't coming.
        appLoading?.finish("reader");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manager, edition.slug]);

  const isReady = !loadError && !!numPages && !!baseSize && initialPage !== null && spotsReady;

  // Signals the splash once this edition's first page is actually showable
  // (same condition that swaps the reader's own inline Preloader for the
  // flipbook) — see the effect above for where "not ready yet" is reported.
  useEffect(() => {
    if (isReady) appLoading?.finish("reader");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  // ---- Toolbar + mobile header auto-hide on inactivity. Both float
  // directly on top of the PDF on mobile (see the header/Toolbar markup
  // below), which is what lets the book render truly full-screen there —
  // so on mobile this fades faster than on desktop, where the header is a
  // normal opaque bar that doesn't cover any content and only the toolbar
  // itself needs to get out of the way. ----
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const hideDelay = isMobile ? 1400 : 3200;
    function show() {
      setToolbarVisible(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setToolbarVisible(false), hideDelay);
    }
    const el = containerRef.current;
    el?.addEventListener("pointermove", show);
    el?.addEventListener("pointerdown", show);
    el?.addEventListener("touchstart", show);
    show();
    return () => {
      clearTimeout(timeout);
      el?.removeEventListener("pointermove", show);
      el?.removeEventListener("pointerdown", show);
      el?.removeEventListener("touchstart", show);
    };
  }, [isMobile]);

  // ---- Zoom ----
  const setZoomClamped = useCallback((next: number) => {
    const clamped = clamp(next, ZOOM_MIN, ZOOM_MAX);
    setZoom(clamped <= ZOOM_MIN + 0.02 ? ZOOM_MIN : clamped);
  }, []);
  const zoomIn = useCallback(() => setZoomClamped(zoom + 0.25), [zoom, setZoomClamped]);
  const zoomOut = useCallback(() => setZoomClamped(zoom - 0.25), [zoom, setZoomClamped]);
  const resetZoom = useCallback(() => setZoom(ZOOM_MIN), []);

  // Desktop only: plain mouse-wheel scroll zooms in/out for reading — a
  // single page rendered once and scaled with CSS (see ZoomedPageView), not
  // a fresh PDF render on every tick, so it stays smooth. Mobile zooms with
  // a real pinch gesture instead (native browser zoom, see Flipbook.tsx).
  //
  // This listener only handles the transition *into* zoom from the flat
  // flipbook (zoom === ZOOM_MIN, nothing scrollable yet to anchor to). Once
  // ZoomedPageView is mounted it owns wheel-zooming itself, anchoring each
  // tick to the cursor position — see its handleWheel. `zoomRef` (rather
  // than a `zoom` dependency) keeps this effect from tearing down and
  // re-attaching the native listener on every single zoom tick.
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    if (isMobile) return;
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (onAdPageRef.current) return;
      if (zoomRef.current > ZOOM_MIN) return;
      e.preventDefault();
      const next = zoomRef.current - e.deltaY * 0.0015;
      if (next > ZOOM_MIN) {
        // Entering zoom: `currentPage` is whatever react-pageflip's onFlip
        // last reported, which for a two-page spread is always the LEFT
        // page — so scrolling to zoom while pointing at the right-hand page
        // used to open the zoom on the left one instead (reported bug).
        // Resolve the actual page under the cursor from the book's own
        // layout geometry and switch to it before the zoom view mounts, so
        // it opens on whichever page was actually under the pointer.
        const pointedPage = flipbookRef.current?.pageAtPoint(e.clientX, e.clientY);
        if (pointedPage) setCurrentPage(pointedPage);
      }
      setZoomClamped(next);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isMobile, setZoomClamped]);

  // ---- Navigation ----
  // Every forward/backward navigation intent — tap-corner (via Flipbook's
  // onRequestNext/onRequestPrev), keyboard arrows, and the toolbar buttons —
  // funnels through these two functions instead of calling flipbookRef
  // directly. Full-page sponsor spots are now genuine pages inside the book
  // (see fullPageSpots.ts / Flipbook's sequence builder), so there's no
  // interception logic needed here any more — react-pageflip just turns to
  // whatever's next, ad slot or real page alike, the same way every time.
  const requestNext = useCallback(() => {
    flipbookRef.current?.next();
  }, []);
  const requestPrev = useCallback(() => {
    flipbookRef.current?.prev();
  }, []);

  useKeyboardShortcuts({
    onPrevPage: requestPrev,
    onNextPage: requestNext,
    onZoomIn: onAdPage ? undefined : zoomIn,
    onZoomOut: onAdPage ? undefined : zoomOut,
    onCloseOverlay: () => {
      if (zoom !== ZOOM_MIN) resetZoom();
    },
  });

  // The outer ref'd container is always mounted (even during loading/error
  // states) so effects that attach native listeners to it — wheel-zoom,
  // toolbar auto-hide — pick up a real element on their very first run.
  // Gating the whole div behind `!numPages` (as an early return) would mount
  // it late, after those effects' one-shot dependency arrays had already
  // fired against a still-null ref. (`isReady` itself is computed above,
  // next to the effect that loads the PDF's metadata.)

  // Shared by the mobile header and the toolbar (both floating overlays on
  // mobile — see the markup below): forced visible whenever a full-page
  // sponsor slot is on screen, same reasoning as the toolbar always had on
  // its own — the reader's only way past it is a prev/next turn, and the
  // inactivity auto-hide doesn't know that; left alone, staring at the ad
  // for a few seconds without moving the mouse would fade the only controls
  // that get past it.
  const controlsVisible = onAdPage ? true : toolbarVisible;

  return (
    <div ref={containerRef} className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#05070a]">
      {loadError ? (
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      ) : !isReady || !numPages || !baseSize ? (
        <Preloader editionLabel={edition.editionLabel} />
      ) : (
        <>
          {/* Desktop: a real header, part of the normal layout flow, not a
              floating overlay — plenty of room there, so it's simplest to
              just give it genuine space rather than float it. Mobile: the
              PDF is meant to run truly full-screen (its own explicit
              request), so here the header floats directly on top of it
              instead of pushing it down — translucent, and sharing the
              toolbar's inactivity fade below (`controlsVisible`) so it gets
              out of the reader's way the same way the page-turn pill does.
              Minimalist either way to match the rest of the brand: no
              pill/button treatment on the logo, just a bottom border plus a
              soft shadow for a bit of depth ("relieve"). */}
          <header
            className={cn(
              "z-50 flex items-center justify-between px-4 py-3 sm:px-6",
              isMobile
                ? cn(
                    "fixed inset-x-0 top-0 border-b border-white/10 bg-[#05070a]/55 backdrop-blur-sm transition-all duration-300",
                    controlsVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0",
                  )
                : "relative shrink-0 border-b border-white/10 bg-[#05070a] shadow-[0_4px_18px_-6px_rgba(0,0,0,0.55)]",
            )}
          >
            <div className="flex items-center gap-2 text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/ace-tenis-logo.png" alt={magazineConfig.shortName} className="h-8 w-auto sm:h-9" />
              <span className="hidden text-xs text-white/40 sm:inline">· {edition.editionLabel}</span>
            </div>
            <Link
              href="/archivo"
              className="text-xs font-medium uppercase tracking-wide text-white/50 transition hover:text-white"
            >
              Archivo
            </Link>
          </header>

          {/* min-h-0 cascades down this whole row: a flex child defaults to
              min-height:auto, which means it refuses to shrink below its
              content's intrinsic height. ZoomedPageView renders a canvas
              taller than the viewport on purpose once zoomed in — without
              min-h-0 at every level here, that inner wrapper grows to match
              that canvas instead of staying pinned to the available space,
              so ZoomedPageView's own `h-full` resolves against an
              already-oversized parent and ends up with scrollHeight equal
              to clientHeight (nothing left to scroll). That's what made
              vertical panning silently do nothing while horizontal panning
              (unaffected, since width is fixed by the row layout, not
              content) kept working — not a scroll-math bug, a sizing one. */}
          <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
            {/* The book's own container spans the FULL row width — exactly
                like before this feature existed — so it centers itself in
                the true viewport with no help needed from a matching
                spacer on the other side. The vertical sponsor banner is an
                absolutely-positioned overlay *inside* this same box (see
                below), placed using the book's own reported gutter, so it
                sits centered in the real dead space between this box's left
                edge and the book itself — not a fixed-width column that
                could only guess at that gap. */}
            <div className="relative min-h-0 flex-1">
              {zoom <= ZOOM_MIN ? (
                <Flipbook
                  ref={flipbookRef}
                  manager={manager}
                  pageCount={numPages}
                  spots={spots}
                  initialPage={currentPage}
                  baseWidth={baseSize.width}
                  baseHeight={baseSize.height}
                  renderScale={baseScale}
                  isMobile={isMobile}
                  reduceMotion={reduceMotion}
                  onPageChange={setCurrentPage}
                  onGutterChange={setGutter}
                  onFullPageActiveChange={handleFullPageActiveChange}
                  onRequestNext={requestNext}
                  onRequestPrev={requestPrev}
                />
              ) : (
                <ZoomedPageView
                  manager={manager}
                  pageNumber={currentPage}
                  totalPages={numPages}
                  zoom={zoom}
                  baseWidth={baseSize.width}
                  baseHeight={baseSize.height}
                  onZoomChange={setZoomClamped}
                  onReset={resetZoom}
                />
              )}

              {!isMobile && zoom <= ZOOM_MIN && gutter && gutter.left >= MIN_GUTTER_FOR_SPONSOR && (
                <div
                  className="pointer-events-none absolute flex items-center justify-center"
                  style={{ left: 0, top: gutter.top, width: gutter.left, height: gutter.visibleHeight }}
                >
                  <div
                    className="pointer-events-auto relative h-full max-h-full w-full max-w-[220px] p-4"
                    data-sponsor-variant="vertical"
                  >
                    <div className="relative h-full w-full" style={{ aspectRatio: "600 / 1200" }}>
                      <SponsorSlot
                        key={currentBannerSponsor?.id ?? "empty-vertical"}
                        sponsor={currentBannerSponsor}
                        variant="vertical"
                        reduceMotion={reduceMotion}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile: horizontal sponsor strip right below the magazine.
                No gutter math needed here — it's simply the next block in
                the column flow, full-width. */}
            <div className="flex shrink-0 items-center justify-center px-3 py-2 md:hidden">
              <div
                className="relative w-full max-w-md"
                data-sponsor-variant="horizontal"
                style={{ aspectRatio: "640 / 200" }}
              >
                <SponsorSlot
                  key={currentBannerSponsor?.id ?? "empty-horizontal"}
                  sponsor={currentBannerSponsor}
                  variant="horizontal"
                  reduceMotion={reduceMotion}
                />
              </div>
            </div>
          </div>

          {/* The floating auto-hiding pill, on both mobile and desktop now
              (see `controlsVisible` above) — more translucent and quicker
              to fade on mobile (`translucent`, and the shorter mobile
              `hideDelay` in the auto-hide effect above), since there it
              sits directly on top of the full-screen PDF rather than in
              its own reserved strip. */}
          <Toolbar
            visible={controlsVisible}
            currentPage={currentPage}
            totalPages={numPages}
            onPrev={requestPrev}
            onNext={requestNext}
            translucent={isMobile}
          />
        </>
      )}
    </div>
  );
}
