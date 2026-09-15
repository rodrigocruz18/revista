"use client";

import { useEffect, useRef, useState } from "react";
import type { Sponsor } from "@/types/sponsor";
import {
  SPONSOR_INITIAL_DELAY_MS,
  SPONSOR_REST_MS,
  SPONSOR_TICK_MS,
  sponsorDrawWeight,
  sponsorExposureMs,
} from "@/config/sponsors";

type RotationCategory = "light" | "premium";
export type BannerSponsor = Sponsor & { category: RotationCategory };

function isBannerSponsor(sponsor: Sponsor): sponsor is BannerSponsor {
  return sponsor.category === "light" || sponsor.category === "premium";
}

/** Weighted random pick: duplicate each candidate `weight` times into a flat
 * "ticket" pool, then draw uniformly — Premium's 3x weight (see
 * SPONSOR_DRAW_WEIGHT) means it fills 3 tickets per candidate against
 * Light's 1, without ever fully excluding Light from the draw. Only the
 * rotating-banner categories (light/premium) participate — "fullpage" is a
 * separate placement entirely (see @/lib/fullPageSpots). */
export function pickWeightedSponsor(candidates: BannerSponsor[]): BannerSponsor | null {
  if (candidates.length === 0) return null;
  const tickets = candidates.flatMap((sponsor) => Array(sponsorDrawWeight(sponsor.category)).fill(sponsor));
  return tickets[Math.floor(Math.random() * tickets.length)] as BannerSponsor;
}

type Phase = "initial" | "resting" | "showing";

/**
 * Drives the rotating banner slot: a silent delay right after the reader
 * opens (SPONSOR_INITIAL_DELAY_MS, so the very first thing a reader sees
 * isn't an ad), then alternates between showing a weighted-random pick (for
 * that sponsor's own exposure time — Premium gets both better odds and more
 * time) and a quiet rest gap (SPONSOR_REST_MS) with nothing shown at all
 * between sponsors. See @/config/sponsors for why each number is what it is.
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
export function useSponsorRotation(sponsors: Sponsor[]): Sponsor | null {
  const [current, setCurrent] = useState<BannerSponsor | null>(null);

  const sponsorsRef = useRef(sponsors);
  useEffect(() => {
    sponsorsRef.current = sponsors;
  }, [sponsors]);

  const phaseRef = useRef<Phase>("initial");
  const remainingRef = useRef(SPONSOR_INITIAL_DELAY_MS);
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
          remainingRef.current = SPONSOR_REST_MS;
          currentRef.current = null;
          setCurrent(null);
          return;
        }
      }

      remainingRef.current -= SPONSOR_TICK_MS;
      if (remainingRef.current > 0) return;

      if (phaseRef.current === "showing") {
        phaseRef.current = "resting";
        remainingRef.current = SPONSOR_REST_MS;
        currentRef.current = null;
        setCurrent(null);
        return;
      }

      // "initial" or "resting" just elapsed — draw the next sponsor.
      const eligible = sponsorsRef.current.filter(
        (s): s is BannerSponsor => isBannerSponsor(s) && s.status === "active",
      );
      const picked = pickWeightedSponsor(eligible);
      if (!picked) {
        // Nobody eligible right now — stay in "resting" and keep checking
        // every tick (e.g. the admin might activate one while this session
        // is open; `sponsors` is whatever the page passed in as a prop).
        phaseRef.current = "resting";
        remainingRef.current = SPONSOR_REST_MS;
        return;
      }
      phaseRef.current = "showing";
      remainingRef.current = sponsorExposureMs(picked.category);
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
