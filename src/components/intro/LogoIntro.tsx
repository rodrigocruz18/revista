"use client";

import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "revista-tenis:intro-seen";

// Cinematic reveal timings (unchanged from the original spec).
const CINEMATIC_MAIN_MS = 3000;
const CINEMATIC_EXIT_MS = 550;
const REDUCED_CINEMATIC_MS = 240;
const REDUCED_EXIT_MS = 200;

// Loading-phase pacing.
const MIN_LOADING_MS = 500; // never flash the loader for less than this, even on an instant page
const HARD_TIMEOUT_MS = 9000; // never trap the user behind a stuck loader
const TRICKLE_CEILING = 92; // the trickle stalls here until real progress/readiness catches up
const HOLD_AT_100_MS = 280; // brief pause once the bar visibly reaches 100%

export type LogoIntroProps = {
  /** Called once the intro has fully finished (including its exit fade) — or
   * immediately, if it decided not to play at all (already seen this
   * session). */
  onComplete?: () => void;
  /** True once the page beneath the splash has real content ready to show —
   * reported via `useAppLoading()` (see AppLoadingContext/IntroGate). */
  contentReady: boolean;
  /** 0..1 — real load progress, when a page can report one (e.g. a PDF's
   * metadata). Blended with a time-based trickle so the bar never looks
   * stuck even when a page can only report readiness, not granular
   * progress. */
  contentProgress: number;
};

type Phase = "loading" | "cinematic" | "exiting" | "done";

/**
 * One-time splash for the Ace Tenis brand — plays out in two acts, both
 * gated behind sessionStorage so the whole thing only ever runs once per
 * browser tab session, never on client-side navigation between routes:
 *
 *   1. "loading" — the circular Ace mark with a real percentage counting up
 *      to 100, driven by `contentReady`/`contentProgress`. This is the part
 *      that actually waits for the app underneath (e.g. a PDF's metadata)
 *      to be ready, so act 2 never plays over a still-blank page.
 *   2. "cinematic" — the full wordmark reveal (glow / zoom / light burst),
 *      exactly as before, which only starts once there's something real to
 *      reveal.
 *
 * The actual choreography for both acts is CSS `@keyframes` driving only
 * opacity/transform/filter (GPU-compositable, no layout/reflow) — see
 * globals.css. React just sequences phases with a handful of timers; no
 * animation library needed for any of this.
 */
export function LogoIntro({ onComplete, contentReady, contentProgress }: LogoIntroProps) {
  // Starts in "loading" rather than some neutral/unknown phase: sessionStorage
  // can't be read during the server render (or the very first client render,
  // which has to match it to avoid a hydration mismatch), so there's no way
  // to know yet whether this splash should play at all. Defaulting to
  // "loading" means the overlay is part of the very first HTML the browser
  // paints — if it turns out this session already saw the intro, the effect
  // below flips it to "done" a tick later and it disappears. The alternative
  // (starting from a "not decided yet" phase that renders nothing) was the
  // actual bug reported: it left a gap, before that effect ran, where the
  // *page underneath* — its own plain "Preparando edicion..." loader — was
  // the only thing on screen, showing up as a stray extra loading screen
  // ahead of this one instead of being covered by it from the start.
  const [phase, setPhase] = useState<Phase>("loading");
  const [reduceMotion, setReduceMotion] = useState(false);
  const [displayPct, setDisplayPct] = useState(0);

  const loadingStartRef = useRef<number | null>(null);
  const contentProgressRef = useRef(contentProgress);
  useEffect(() => {
    contentProgressRef.current = contentProgress;
  }, [contentProgress]);

  // ---- One-time skip check: only ever plays once per browser tab session.
  useEffect(() => {
    let alreadySeen = true;
    try {
      alreadySeen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      alreadySeen = true;
    }
    if (alreadySeen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("done");
      onComplete?.();
      return;
    }
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    loadingStartRef.current = performance.now();
    // Already "loading" by default — nothing else to do for the happy path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Loading phase: trickle the displayed % while waiting. ---------------
  // A page can only reliably report "I'm not ready yet", not always a
  // precise fraction — the trickle keeps the bar visibly moving regardless,
  // capped short of 100 until the page is actually ready.
  useEffect(() => {
    if (phase !== "loading") return;
    const start = loadingStartRef.current ?? performance.now();
    const interval = setInterval(() => {
      const elapsed = performance.now() - start;
      const trickleTarget = Math.min(TRICKLE_CEILING, elapsed / 45);
      const target = Math.max(contentProgressRef.current * 100, trickleTarget);
      setDisplayPct((prev) => (prev >= target ? prev : prev + (target - prev) * 0.18));
    }, 45);
    return () => clearInterval(interval);
  }, [phase]);

  // ---- Loading phase: move on once the page is actually ready. -------------
  useEffect(() => {
    if (phase !== "loading" || !contentReady) return;
    const start = loadingStartRef.current ?? performance.now();
    const remaining = Math.max(0, MIN_LOADING_MS - (performance.now() - start));
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    const settleTimer = setTimeout(() => {
      setDisplayPct(100);
      holdTimer = setTimeout(() => setPhase("cinematic"), HOLD_AT_100_MS);
    }, remaining);
    return () => {
      clearTimeout(settleTimer);
      if (holdTimer) clearTimeout(holdTimer);
    };
  }, [phase, contentReady]);

  // ---- Loading phase: hard safety net. A page that never reports ready
  // (an unexpected bug elsewhere) shouldn't be able to trap the user behind
  // the splash forever. -------------------------------------------------------
  useEffect(() => {
    if (phase !== "loading") return;
    const timer = setTimeout(() => {
      setDisplayPct(100);
      setPhase("cinematic");
    }, HARD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // ---- Cinematic phase timing (unchanged shape from the original spec). ----
  useEffect(() => {
    if (phase !== "cinematic") return;
    const mainMs = reduceMotion ? REDUCED_CINEMATIC_MS : CINEMATIC_MAIN_MS;
    const timer = setTimeout(() => setPhase("exiting"), mainMs);
    return () => clearTimeout(timer);
  }, [phase, reduceMotion]);

  useEffect(() => {
    if (phase !== "exiting") return;
    const exitMs = reduceMotion ? REDUCED_EXIT_MS : CINEMATIC_EXIT_MS;
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // Nothing to do if storage is unavailable — worst case, the intro
        // plays again next time. Not worth failing over.
      }
      setPhase("done");
      onComplete?.();
    }, exitMs);
    return () => clearTimeout(timer);
  }, [phase, reduceMotion, onComplete]);

  if (phase === "done") return null;

  const isLoading = phase === "loading";

  return (
    <div
      className={[
        "intro-overlay",
        phase === "exiting" && "intro-overlay--exiting",
        reduceMotion && "intro-overlay--reduced",
      ]
        .filter(Boolean)
        .join(" ")}
      role="presentation"
      aria-hidden="true"
    >
      {isLoading ? (
        <div className="intro-loading">
          <span className="intro-loading-glow" />
          {/* Decorative — see the cinematic wordmark below for the real,
              accessible branding once the app is ready.
              eslint-disable-next-line for the same reason the rest of this
              codebase opts out of next/image: a plain <img> avoids pulling
              in Next's image optimizer for a handful of static assets. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/ace-icon.png" alt="" className="intro-loading-mark" draggable={false} />
          <div className="intro-loading-bar">
            <div className="intro-loading-bar-fill" style={{ width: `${displayPct}%` }} />
          </div>
          <span className="intro-loading-pct">{Math.round(displayPct)}%</span>
        </div>
      ) : (
        <div className="intro-stage">
          <span className="intro-glow intro-glow--outer" />
          <span className="intro-glow intro-glow--inner" />
          <span className="intro-ring" />
          <span className="intro-burst" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/ace-tenis-logo.png" alt="" className="intro-logo" draggable={false} />
        </div>
      )}
    </div>
  );
}
