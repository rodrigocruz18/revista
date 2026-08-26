"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Magazine } from "@/types/magazine";
import { getPdfDocumentManager } from "@/lib/pdf";
import { Flipbook, type FlipbookHandle } from "@/components/flipbook/Flipbook";
import { ZoomedPageView } from "@/components/flipbook/ZoomedPageView";
import { Toolbar } from "@/components/tools/Toolbar";
import { Preloader } from "@/components/ui/Preloader";
import { ErrorState } from "@/components/ui/ErrorState";
import { useMediaQuery, usePrefersReducedMotion } from "@/hooks/useMediaQuery";
import { useKeyboardShortcuts } from "@/lib/keyboard";
import { ZOOM_MAX, ZOOM_MIN, magazineConfig } from "@/config/magazine";
import { clamp } from "@/lib/utils";
import { loadEditionProgress, saveEditionProgress } from "@/lib/reader-storage";
import { useAppLoading } from "@/components/intro/AppLoadingContext";

export function Reader({ edition }: { edition: Magazine; allEditions: Magazine[] }) {
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
      if (zoomRef.current > ZOOM_MIN) return;
      e.preventDefault();
      setZoomClamped(zoomRef.current - e.deltaY * 0.0015);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isMobile, setZoomClamped]);

  // ---- Navigation ----
  const goPrev = useCallback(() => flipbookRef.current?.prev(), []);
  const goNext = useCallback(() => flipbookRef.current?.next(), []);

  useKeyboardShortcuts({
    onPrevPage: goPrev,
    onNextPage: goNext,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
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

          {/* min-h-0 is load-bearing here, not decorative: a flex child
              defaults to min-height:auto, which means it refuses to shrink
              below its content's intrinsic height. ZoomedPageView renders a
              canvas taller than the viewport on purpose once zoomed in —
              without min-h-0 this wrapper grows to match that canvas
              instead of staying pinned to the column's actual available
              space, so ZoomedPageView's own `h-full` resolves against an
              already-oversized parent and ends up with scrollHeight equal
              to clientHeight (nothing left to scroll). That's what made
              vertical panning silently do nothing while horizontal panning
              (unaffected, since width is fixed by the row layout, not
              content) kept working — not a scroll-math bug, a sizing one. */}
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
                onPageChange={setCurrentPage}
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
          </div>

          <Toolbar visible={toolbarVisible} currentPage={currentPage} totalPages={numPages} onPrev={goPrev} onNext={goNext} />
        </>
      )}
    </div>
  );
}
