"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Magazine } from "@/types/magazine";
import type { Sponsor } from "@/types/sponsor";
import { getPdfDocumentManager } from "@/lib/pdf";
import { Flipbook, type FlipbookGutter, type FlipbookHandle } from "@/components/flipbook/Flipbook";
import { ZoomedPageView } from "@/components/flipbook/ZoomedPageView";
import { Toolbar } from "@/components/tools/Toolbar";
import { Preloader } from "@/components/ui/Preloader";
import { ErrorState } from "@/components/ui/ErrorState";
import { SponsorSlot } from "@/components/sponsors/SponsorSlot";
import { FullPageSponsorAd, type PageBox } from "@/components/sponsors/FullPageSponsorAd";
import { useMediaQuery, usePrefersReducedMotion } from "@/hooks/useMediaQuery";
import { useKeyboardShortcuts } from "@/lib/keyboard";
import { ZOOM_MAX, ZOOM_MIN, magazineConfig } from "@/config/magazine";
import { FULLPAGE_TRIGGER_AFTER_TURNS } from "@/config/sponsors";
import { clamp } from "@/lib/utils";
import { loadEditionProgress, saveEditionProgress } from "@/lib/reader-storage";
import { useAppLoading } from "@/components/intro/AppLoadingContext";
import { useSponsorRotation } from "@/lib/sponsorRotation";
import { hasSeenFullPageAd, markFullPageAdSeen } from "@/lib/sponsorFullPageStorage";

export function Reader({
  edition,
  sponsors,
}: {
  edition: Magazine;
  allEditions: Magazine[];
  sponsors: Sponsor[];
}) {
  const manager = useMemo(() => getPdfDocumentManager(edition.url), [edition.url]);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  // ---- Sponsors: rotating banner + once-per-session full-page interstitial.
  // A single rotation timer drives both the mobile (horizontal) and desktop
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

  // Same gutter geometry, reshaped into the box the fake interstitial
  // page(s) need to exactly overlay the real book — see FullPageSponsorAd.
  const fullPageBox: PageBox | null = gutter
    ? { left: gutter.left, top: gutter.top, width: gutter.visibleWidth, height: gutter.visibleHeight }
    : null;

  const [pageTurnCount, setPageTurnCount] = useState(0);
  // Two-state model for the "fake page turn" interstitial (see
  // FullPageSponsorAd's doc comment): `armedFullPageSponsor` means it's
  // ready to appear on the reader's *next* forward turn, but nothing is
  // showing yet — the real book keeps behaving completely normally until
  // that turn happens. `fullPageSponsor` means the fake page is actually up
  // right now. Splitting these is what lets the interstitial intercept
  // exactly one forward turn (see requestNext below) instead of jumping in
  // immediately the instant it becomes eligible, which would fire mid
  // page-flip-animation.
  const [armedFullPageSponsor, setArmedFullPageSponsor] = useState<Sponsor | null>(null);
  const [fullPageSponsor, setFullPageSponsor] = useState<Sponsor | null>(null);
  const fullPageTriggeredRef = useRef(false);
  const fullPageActiveRef = useRef(false);
  useEffect(() => {
    fullPageActiveRef.current = fullPageSponsor !== null;
  }, [fullPageSponsor]);

  // Only counts *real* flips (see the onPageChange wiring on <Flipbook> below)
  // — never the initial page the reader opened on, and never the direct
  // setCurrentPage() calls the wheel-zoom-entry handler makes further down.
  const handleRealPageChange = useCallback((page: number) => {
    setCurrentPage(page);
    setPageTurnCount((count) => count + 1);
  }, []);

  useEffect(() => {
    if (fullPageTriggeredRef.current) return;
    if (pageTurnCount < FULLPAGE_TRIGGER_AFTER_TURNS) return;
    if (hasSeenFullPageAd()) {
      fullPageTriggeredRef.current = true;
      return;
    }
    const eligible = sponsors.filter(
      (s) => s.category === "fullpage" && s.status === "active" && s.fullPageImageUrl,
    );
    if (eligible.length === 0) return;
    fullPageTriggeredRef.current = true;
    const picked = eligible[Math.floor(Math.random() * eligible.length)];
    // Only ARM it here — "seen" is recorded once it's actually shown (see
    // requestNext), not the moment it becomes eligible, so a reader who
    // never turns the page again this session genuinely never saw it.
    // A legitimate effect: this is synchronizing with `pageTurnCount`
    // crossing the trigger threshold (an external-ish signal driven by real
    // page-flip events), not something derivable during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setArmedFullPageSponsor(picked);
  }, [pageTurnCount, sponsors]);

  // ---- Load document metadata + resolve the page we should open on. -----
  useEffect(() => {
    let cancelled = false;
    // Resets reader state for the newly-selected edition before its PDF
    // metadata (page count, size) has loaded — a legitimate effect since
    // it's synchronizing with the `edition.slug` prop, not derivable at render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNumPages(null);
    setLoadError(null);
    setInitialPage(null);

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

        const fromUrl = Number(searchParams.get("p"));
        const progress = loadEditionProgress(edition.slug);
        const resolved = fromUrl && fromUrl >= 1 && fromUrl <= pages ? fromUrl : clamp(progress.lastPage || 1, 1, pages);
        setInitialPage(resolved);
        setCurrentPage(resolved);
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

  const isReady = !loadError && !!numPages && !!baseSize && initialPage !== null;

  // Signals the splash once this edition's first page is actually showable
  // (same condition that swaps the reader's own inline Preloader for the
  // flipbook) — see the effect above for where "not ready yet" is reported.
  useEffect(() => {
    if (isReady) appLoading?.finish("reader");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  // ---- Persist progress + reflect page in the URL (shareable links). ----
  useEffect(() => {
    if (!initialPage) return;
    saveEditionProgress(edition.slug, { lastPage: currentPage });
    const params = new URLSearchParams(searchParams.toString());
    params.set("p", String(currentPage));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, edition.slug]);

  // ---- Toolbar auto-hide on inactivity. ----
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    function show() {
      setToolbarVisible(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setToolbarVisible(false), 3200);
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
  }, []);

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
      if (fullPageActiveRef.current) return;
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
  // directly, which is what makes it possible to intercept a turn gesture
  // and show the fake interstitial page in place of a real flip, regardless
  // of which input method triggered it.
  const requestNext = useCallback(() => {
    if (fullPageSponsor) {
      // The interstitial is already up: this turn dismisses it and performs
      // the real flip that was deferred when it first appeared, landing on
      // whatever the true next page actually is.
      setFullPageSponsor(null);
      flipbookRef.current?.next();
      return;
    }
    if (armedFullPageSponsor) {
      // First forward turn since arming: show the fake page instead of
      // flipping for real — the real page underneath doesn't move.
      const picked = armedFullPageSponsor;
      setArmedFullPageSponsor(null);
      setFullPageSponsor(picked);
      markFullPageAdSeen();
      return;
    }
    flipbookRef.current?.next();
  }, [fullPageSponsor, armedFullPageSponsor]);

  const requestPrev = useCallback(() => {
    if (fullPageSponsor) {
      // Cancel: return to whatever real page was already showing, with no
      // real flip — the interstitial never touched the real page state.
      setFullPageSponsor(null);
      return;
    }
    flipbookRef.current?.prev();
  }, [fullPageSponsor]);

  const noop = useCallback(() => {}, []);
  useKeyboardShortcuts({
    onPrevPage: requestPrev,
    onNextPage: requestNext,
    onZoomIn: fullPageSponsor ? noop : zoomIn,
    onZoomOut: fullPageSponsor ? noop : zoomOut,
    onCloseOverlay: () => {
      if (fullPageSponsor) {
        requestPrev();
        return;
      }
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

  return (
    <div ref={containerRef} className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#05070a]">
      {loadError ? (
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      ) : !isReady || !numPages || !baseSize ? (
        <Preloader editionLabel={edition.editionLabel} />
      ) : (
        <>
          {/* A real header — part of the normal layout flow, not a floating
              overlay — so everything below it (book, sponsor banner) always
              starts with genuine breathing room instead of sharing space
              with a transparent chip. Minimalist on purpose to match the
              rest of the brand: no pill/button treatment on the logo, just
              a clean bottom border plus a soft shadow for a bit of depth
              ("relieve") so it stays visually grounded above the content
              without competing with it. */}
          <header className="relative z-30 flex shrink-0 items-center justify-between border-b border-white/10 bg-[#05070a] px-4 py-3 shadow-[0_4px_18px_-6px_rgba(0,0,0,0.55)] sm:px-6">
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
          <div className="relative flex min-h-0 flex-1 flex-col pt-3 md:flex-row md:pt-0">
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
                  initialPage={currentPage}
                  baseWidth={baseSize.width}
                  baseHeight={baseSize.height}
                  renderScale={baseScale}
                  isMobile={isMobile}
                  reduceMotion={reduceMotion}
                  onPageChange={handleRealPageChange}
                  onGutterChange={setGutter}
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

              {fullPageSponsor && fullPageBox && (
                <FullPageSponsorAd
                  sponsor={fullPageSponsor}
                  pageBox={fullPageBox}
                  isSpread={gutter?.isSpread ?? false}
                  reduceMotion={reduceMotion}
                  onAdvance={requestNext}
                  onCancel={requestPrev}
                />
              )}
            </div>

            {/* Mobile: page-turn controls sit in-flow right below the book,
                between it and the sponsor strip — see Toolbar's "inline"
                variant doc comment for why this replaces the floating pill
                here specifically. */}
            <div className="md:hidden">
              <Toolbar
                visible={toolbarVisible}
                currentPage={currentPage}
                totalPages={numPages}
                onPrev={requestPrev}
                onNext={requestNext}
                variant="inline"
              />
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

          {/* Desktop only: the floating auto-hiding pill (see Toolbar's
              "floating" vs "inline" doc comment) — mobile gets its own
              in-flow copy above, between the book and the sponsor strip.
              Forced visible whenever the full-page interstitial is up: the
              reader's only way to leave it is a prev/next turn, and the
              inactivity auto-hide (see the "show"/timeout effect above)
              doesn't know that — left alone, staring at the ad for a few
              seconds without moving the mouse would fade the only controls
              that get them out of it. */}
          <div className="hidden md:block">
            <Toolbar
              visible={fullPageSponsor ? true : toolbarVisible}
              currentPage={currentPage}
              totalPages={numPages}
              onPrev={requestPrev}
              onNext={requestNext}
            />
          </div>
        </>
      )}
    </div>
  );
}
