"use client";

import { useEffect, useRef, useState } from "react";
import type { Sponsor } from "@/types/sponsor";
import { SPONSOR_TICK_MS } from "@/config/sponsors";
import { DEFAULT_SPONSOR_SETTINGS, type SponsorSettings } from "@/lib/sponsorSettings";

type RotationCategory = "light" | "premium";
export type BannerSponsor = Sponsor & { category: RotationCategory };

function isBannerSponsor(sponsor: Sponsor): sponsor is BannerSponsor {
  return sponsor.category === "light" || sponsor.category === "premium";
}

/** Two-step draw: first the category — Premium with
 * `settings.premiumProbability` %, Light otherwise (admin-configurable, see
 * SponsorSettings) — then a uniformly random sponsor within it. Drawing the
 * category first keeps the Premium/Light split at exactly the configured
 * percentage no matter how many sponsors each category has. If only one
 * category has candidates, it's used regardless of the percentage. Only the
 * rotating-banner categories (light/premium) participate — "fullpage" is a
 * separate placement entirely (see @/lib/fullPageSpots). */
export function pickBannerSponsor(
  candidates: BannerSponsor[],
  settings: SponsorSettings = DEFAULT_SPONSOR_SETTINGS,
): BannerSponsor | null {
  if (candidates.length === 0) return null;
  const premium = candidates.filter((s) => s.category === "premium");
  const light = candidates.filter((s) => s.category === "light");
  const pool =
    premium.length === 0 ? light : light.length === 0 ? premium : Math.random() * 100 < settings.premiumProbability ? premium : light;
  return pool[Math.floor(Math.random() * pool.length)];
}

type Phase = "initial" | "resting" | "showing";

/**
 * Drives the rotating banner slot: a silent delay right after the reader
 * opens (settings.initialDelaySec, so the very first thing a reader sees
 * isn't an ad), then alternates between showing a weighted-random pick (for
 * that sponsor's own exposure time — Premium gets both better odds and more
 * time) and a quiet rest gap (settings.restSec) with nothing shown at all
 * between sponsors. All timings come from the admin's SponsorSettings.
 *
 * Ticks every SPONSOR_TICK_MS instead of one long setTimeout per phase so
 * the whole thing can cleanly pause: while the tab is hidden (document.hidden
 * via the Page Visibility API), ticks are skipped entirely, so a reader who
 * tabs away mid-exposure comes back to the same remaining time rather than a
 * rotation that silently burned through while they weren't looking.
 *
 * Phase/remaining-time bookkeeping lives in refs, not state — the interval
 * callback is created once and reads/writes them directly, so a tick never
 * has to worry about a stale closure over a state value from N renders ago.
 * `current` is the only piece that needs to trigger a render, so it's the
 * only state.
 */
export function useSponsorRotation(
  sponsors: Sponsor[],
  settings: SponsorSettings = DEFAULT_SPONSOR_SETTINGS,
): Sponsor | null {
  const [current, setCurrent] = useState<BannerSponsor | null>(null);

  const sponsorsRef = useRef(sponsors);
  const settingsRef = useRef(settings);
  useEffect(() => {
    sponsorsRef.current = sponsors;
    settingsRef.current = settings;
  }, [sponsors, settings]);

  const phaseRef = useRef<Phase>("initial");
  const remainingRef = useRef(settings.initialDelaySec * 1000);
  const currentRef = useRef<BannerSponsor | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;

      // If the sponsor currently on screen got paused/deleted by the admin
      // mid-exposure, cut away immediately instead of waiting out a timer
      // for a sponsor that's no longer supposed to be shown.
      if (phaseRef.current === "showing" && currentRef.current) {
        const stillEligible = sponsorsRef.current.some(
          (s) => s.id === currentRef.current!.id && s.status === "active",
        );
        if (!stillEligible) {
          phaseRef.current = "resting";
          remainingRef.current = settingsRef.current.restSec * 1000;
          currentRef.current = null;
          setCurrent(null);
          return;
        }
      }

      remainingRef.current -= SPONSOR_TICK_MS;
      if (remainingRef.current > 0) return;

      if (phaseRef.current === "showing") {
        phaseRef.current = "resting";
        remainingRef.current = settingsRef.current.restSec * 1000;
        currentRef.current = null;
        setCurrent(null);
        return;
      }

      // "initial" or "resting" just elapsed — draw the next sponsor.
      const eligible = sponsorsRef.current.filter(
        (s): s is BannerSponsor => isBannerSponsor(s) && s.status === "active",
      );
      const picked = pickBannerSponsor(eligible, settingsRef.current);
      if (!picked) {
        // Nobody eligible right now — stay in "resting" and keep checking
        // every tick (e.g. the admin might activate one while this session
        // is open; `sponsors` is whatever the page passed in as a prop).
        phaseRef.current = "resting";
        remainingRef.current = settingsRef.current.restSec * 1000;
        return;
      }
      phaseRef.current = "showing";
      const { premiumExposureSec, lightExposureSec } = settingsRef.current;
      remainingRef.current = (picked.category === "premium" ? premiumExposureSec : lightExposureSec) * 1000;
      currentRef.current = picked;
      setCurrent(picked);
    }, SPONSOR_TICK_MS);

    return () => clearInterval(interval);
    // Intentionally empty deps: this effect sets up the interval exactly
    // once per mount. It reads live sponsor data through `sponsorsRef`
    // rather than depending on `sponsors` directly, so a new sponsors array
    // on every parent render never tears down and restarts the rotation
    // (which would otherwise reset the reader back to the silent initial
    // delay on every unrelated re-render).
  }, []);

  return current;
}
