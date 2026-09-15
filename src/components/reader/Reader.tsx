"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Magazine } from "@/types/magazine";
import type { Sponsor } from "@/types/sponsor";
import { getPdfDocumentManager } from "@/lib/pdf";
import { Flipbook, type FlipbookHandle } from "@/components/flipbook/Flipbook";
import { ZoomedPageView } from "@/components/flipbook/ZoomedPageView";
import { Toolbar } from "@/components/tools/Toolbar";
import { Preloader } from "@/components/ui/Preloader";
import { ErrorState } from "@/components/ui/ErrorState";
import { SponsorSlot } from "@/components/sponsors/SponsorSlot";
import { FullPageSponsorAd } from "@/components/sponsors/FullPageSponsorAd";
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

  const [pageTurnCount, setPageTurnCount] = useState(0);
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
    markFullPageAdSeen();
    // A legitimate effect: this is synchronizing with `pageTurnCount`
    // crossing the trigger threshold (an external-ish signal driven by real
    // page-flip events), not something derivable during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFullPageSponsor(picked);
  }, [pageTurnCount, sponsors]);

  const dismissFullPageAd = useCallback(() => {
    setFullPageSponsor(null);
  }, []);

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
  const goPrev = useCallback(() => flipbookRef.current?.prev(), []);
  const goNext = useCallback(() => flipbookRef.current?.next(), []);

  // While the full-page sponsor interstitial is up it should block real
  // navigation entirely (per the feature's design — see FullPageSponsorAd),
  // so every shortcut except the one that dismisses it (Escape, reusing
  // onCloseOverlay) becomes a no-op for as long as it's showing.
  const noop = useCallback(() => {}, []);
  useKeyboardShortcuts({
    onPrevPage: fullPageSponsor ? noop : goPrev,
    onNextPage: fullPageSponsor ? noop : goNext,
    onZoomIn: fullPageSponsor ? noop : zoomIn,
    onZoomOut: fullPageSponsor ? noop : zoomOut,
    onCloseOverlay: () => {
      if (fullPageSponsor) {
        dismissFullPageAd();
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
          <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-3 sm:px-6">
            <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-white backdrop-blur-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/ace-tenis-logo.png" alt={magazineConfig.shortName} className="h-8 w-auto sm:h-10" />
              <span className="hidden text-xs text-white/40 sm:inline">· {edition.editionLabel}</span>
            </div>
            <Link
              href="/archivo"
              className="pointer-events-auto rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-white/80 backdrop-blur-md transition hover:text-white"
            >
              Archivo
            </Link>
          </div>

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
            {/* Desktop: vertical sponsor banner to the left of the magazine.
                Reserving the column regardless of whether a sponsor is
                currently showing (rest gap / initial delay) keeps the
                flipbook's own width stable — nothing reflows when the
                rotation swaps or goes quiet. */}
            <div className="hidden shrink-0 items-center justify-center px-2 py-3 md:flex md:w-36 lg:w-44">
              <div
                className="relative h-full max-h-[78vh] w-full"
                data-sponsor-variant="vertical"
                style={{ aspectRatio: "600 / 1200" }}
              >
                <SponsorSlot
                  key={currentBannerSponsor?.id ?? "empty-vertical"}
                  sponsor={currentBannerSponsor}
                  variant="vertical"
                  reduceMotion={reduceMotion}
                />
              </div>
            </div>

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

              {fullPageSponsor && (
                <FullPageSponsorAd sponsor={fullPageSponsor} onDismiss={dismissFullPageAd} reduceMotion={reduceMotion} />
              )}
            </div>

            {/* Mobile: horizontal sponsor strip right below the magazine.
                Same reserved-space reasoning as the vertical column above. */}
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

          <Toolbar visible={toolbarVisible} currentPage={currentPage} totalPages={numPages} onPrev={goPrev} onNext={goNext} />
        </>
      )}
    </div>
  );
}
