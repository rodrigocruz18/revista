"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogoIntro } from "@/components/intro/LogoIntro";
import { AppLoadingContext, type AppLoadingApi } from "@/components/intro/AppLoadingContext";

// If nothing claims the loading phase shortly after mount, there's nothing
// worth waiting for (a light page with no real async data, e.g. the home
// or archive page) — let the splash proceed instead of sitting at 0%
// forever for a load that was never going to report itself.
//
// This has to be generous, not snappy: on a real deploy (unlike a warm
// localhost), the very first paint is a server-rendered shell that hasn't
// hydrated yet — nothing has run any React effects at all until hydration
// finishes downloading/parsing the page's JS. `useAppLoading()` callers
// (e.g. the Reader, claiming "reader") can only call `begin()` from an
// effect, so on a slow connection or a cold serverless start, hydration
// itself can easily take longer than a short grace window. If that window
// fires first, the splash wraps up and hands off to a page that hasn't
// actually claimed its own loading yet, and its own plain fallback
// ("Preparando edicion...") becomes visible for a beat — the exact bug this
// value used to cause at 350ms. Longer errs toward "wait a little longer on
// the rare slow load" rather than "flash old UI on it."
const AUTO_READY_GRACE_MS = 1200;

type LoaderState = { ready: boolean; progress: number };

/**
 * Thin integration wrapper between the self-contained `LogoIntro` splash and
 * the app it splashes in front of. Lives in the root layout so it mounts
 * exactly once per browser tab session — the App Router keeps a layout
 * mounted across client-side navigations, so this (and the intro itself)
 * never re-triggers when the user moves between /revista and /archivo.
 *
 * Also hosts the `AppLoadingContext` provider: any page below can call
 * `useAppLoading()` to report real load progress (e.g. the Reader waiting
 * on a PDF's metadata), which drives the splash's loading-phase percentage
 * instead of it being a guess. A page that never calls the hook at all
 * doesn't block anything — see `AUTO_READY_GRACE_MS` below.
 *
 * The app underneath is always rendered (so its own data fetching starts
 * immediately, in parallel with the splash), just marked `inert` while the
 * splash is up so it can't steal focus or be clicked through a fading
 * overlay.
 */
export function IntroGate({ children }: { children: React.ReactNode }) {
  const [introActive, setIntroActive] = useState(true);
  const [loaders, setLoaders] = useState<Record<string, LoaderState>>({});
  const claimedRef = useRef(false);

  const begin = useCallback((key: string) => {
    claimedRef.current = true;
    setLoaders((prev) => (prev[key] ? prev : { ...prev, [key]: { ready: false, progress: 0 } }));
  }, []);
  const setProgress = useCallback((key: string, value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    setLoaders((prev) => {
      const entry = prev[key] ?? { ready: false, progress: 0 };
      if (clamped <= entry.progress) return prev;
      return { ...prev, [key]: { ...entry, progress: clamped } };
    });
  }, []);
  const finish = useCallback((key: string) => {
    setLoaders((prev) => ({ ...prev, [key]: { ready: true, progress: 1 } }));
  }, []);

  const api = useMemo<AppLoadingApi>(() => ({ begin, setProgress, finish }), [begin, setProgress, finish]);

  const [autoReady, setAutoReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!claimedRef.current) setAutoReady(true);
    }, AUTO_READY_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  const entries = Object.values(loaders);
  const contentReady = autoReady || (entries.length > 0 && entries.every((l) => l.ready));
  const contentProgress = entries.length > 0 ? entries.reduce((sum, l) => sum + l.progress, 0) / entries.length : 0;

  return (
    <AppLoadingContext.Provider value={api}>
      <LogoIntro
        onComplete={() => setIntroActive(false)}
        contentReady={contentReady}
        contentProgress={contentProgress}
      />
      <div inert={introActive || undefined}>{children}</div>
    </AppLoadingContext.Provider>
  );
}
